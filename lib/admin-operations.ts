import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { classes, students, users, schoolIdentities, schoolOperations } from "@/db/schema";
import type { Viewer } from "@/lib/data";
import { currentAdmin } from "@/lib/admin-data";
import { assertStorageWritable, commitGoogleState } from "@/lib/google-bridge";
import { currentIdentityActor } from "@/lib/school-identities";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { emptySchoolState, insertRow, type SchoolState } from "@/lib/school-tables";

import { operationLabels, type OperationKind } from "@/lib/admin-operation-types";
const inputSchema = z.object({
  batchId:z.string().uuid(), kind:z.enum(["promote","transfer","graduate","restore","assign_teacher"]),
  reason:z.string().trim().min(2).max(500),
  targets:z.array(z.object({studentId:z.number().int().positive(),studentNumber:z.string().trim().min(1).max(30).optional()})).max(100).default([]),
  classId:z.number().int().positive().optional(), teacherId:z.number().int().positive().optional(),
  graduatedYear:z.number().int().min(2022).max(2100).optional(),
});
export type OperationInput = z.infer<typeof inputSchema>;
type StudentRow = SchoolState["tables"]["students"][number];
type ClassRow = SchoolState["tables"]["classes"][number];
const studentState=(s:StudentRow)=>({id:s.id,name:s.name,classId:s.classId,studentNumber:s.studentNumber,status:s.status,userId:s.userId,graduatedYear:s.graduatedYear,graduatedAt:s.graduatedAt,isExample:s.isExample});
const classState=(c:ClassRow)=>({id:c.id,name:c.name,schoolYear:c.schoolYear,grade:c.grade,teacherId:c.teacherId});
export type OperationRow = {targetType:"student"|"class";targetId:number;name:string;beforeLabel:string;afterLabel:string;before:Record<string,unknown>;after:Record<string,unknown>};
export type OperationPreview = { input:OperationInput; token:string; rows:OperationRow[]; message:string };
type Prepared = OperationPreview & { guards:{source:ReturnType<typeof classState>;target:ReturnType<typeof classState>|null}[];actor:Viewer };
function fail(message:string):never {throw new Error(message);}
function checkedAdmin(state:SchoolState, viewer:Viewer){const actor=currentIdentityActor(state.tables,viewer);if(!isSchoolAdmin(actor))fail("학교 관리자만 변경할 수 있습니다.");return actor;}
const classLabel=(c:ClassRow)=>`${c.schoolYear}학년도 ${c.name}`;
export async function prepareOperation(state:SchoolState, viewer:Viewer, body:unknown):Promise<Prepared> {
  const actor=checkedAdmin(state,viewer),parsed=inputSchema.safeParse(body);
  if(!parsed.success)fail("작업 대상과 변경 사유(2~500자)를 확인하세요. 한 번에 최대 100명까지 처리합니다.");
  const input=parsed.data,rows:OperationRow[]=[],guards:Prepared["guards"]=[];
  const classroom=(id:number|undefined)=>state.tables.classes.find(c=>c.id===id)??fail("대상 학급을 확인하세요.");
  if(input.kind==="assign_teacher"){
    if(input.targets.length)fail("담임 변경에는 학생 대상을 지정하지 않습니다.");
    const cls=classroom(input.classId),teacher=state.tables.users.find(u=>u.id===input.teacherId);
    if(!teacher||teacher.status!=="approved"||!["admin","teacher"].includes(teacher.role))fail("승인된 교사 또는 관리자를 선택하세요.");
    if(cls.teacherId===teacher.id)fail("현재 담당 교사와 같습니다.");
    rows.push({targetType:"class",targetId:cls.id,name:classLabel(cls),before:classState(cls),after:{...classState(cls),teacherId:teacher.id},beforeLabel:state.tables.users.find(u=>u.id===cls.teacherId)?.displayName??"기존 담당자",afterLabel:teacher.displayName});
    guards.push({source:classState(cls),target:null});
  }else{
    if(!input.targets.length||new Set(input.targets.map(t=>t.studentId)).size!==input.targets.length)fail("중복 없이 1~100명을 선택하세요.");
    const moving=input.kind==="promote"||input.kind==="transfer",target=moving?classroom(input.classId):null;
    const numbers=new Set<string>();
    for(const item of [...input.targets].sort((a,b)=>a.studentId-b.studentId)){
      const student=state.tables.students.find(s=>s.id===item.studentId)??fail("학생 정보가 바뀌었습니다. 목록을 새로고침하세요.");
      if(student.isExample)fail("예시 학생은 일괄 학적 변경에서 제외됩니다.");
      const cls=classroom(student.classId),before=studentState(student),after={...before};
      let beforeLabel=`${classLabel(cls)} · ${student.studentNumber}`,afterLabel=beforeLabel;
      if(moving&&target){
        if(student.status!=="active")fail("진급·이동은 재학생만 선택하세요.");
        if(input.kind==="promote"&&(cls.grade!==2||target.grade!==3||target.schoolYear!==cls.schoolYear+1))fail("진급은 2학년에서 다음 학년도 3학년 학급으로 진행합니다.");
        if(input.kind==="transfer"&&(cls.grade!==target.grade||cls.schoolYear!==target.schoolYear||cls.id===target.id))fail("학급 이동은 같은 학년도·학년의 다른 학급을 선택하세요.");
        const number=item.studentNumber??student.studentNumber;
        if(numbers.has(number)||state.tables.students.some(s=>s.classId===target.id&&s.studentNumber===number))fail(`새 학번 ${number}이 중복됩니다. 대상 학급과 선택 명단을 확인하세요.`);
        numbers.add(number);after.classId=target.id;after.studentNumber=number;
        afterLabel=`${classLabel(target)} · ${number}`;
      }else if(input.kind==="graduate"){
        if(student.status!=="active"||cls.grade!==3)fail("졸업 처리는 3학년 재학생만 선택하세요.");
        if(input.graduatedYear!==cls.schoolYear+1)fail("졸업 연도는 현재 학급 학년도의 다음 해로 입력하세요.");
        after.status="graduated";after.graduatedYear=input.graduatedYear;after.graduatedAt=null;
        afterLabel=`${input.graduatedYear}년 졸업 · ${beforeLabel}`;
      }else if(input.kind==="restore"){
        if(student.status==="active")fail("졸업·보관 상태인 학생만 복원할 수 있습니다.");
        beforeLabel=`${student.status==="graduated"?`${student.graduatedYear??""}년 졸업`:"보관"} · ${beforeLabel}`;
        after.status="active";after.graduatedYear=null;after.graduatedAt=null;afterLabel=`재학 · ${afterLabel}`;
      }
      rows.push({targetType:"student",targetId:student.id,name:student.name,before,after,beforeLabel,afterLabel});
      guards.push({source:classState(cls),target:target?classState(target):null});
    }
  }
  if(state.tables.schoolOperations.some(e=>e.batchId===input.batchId))fail("이미 처리된 작업입니다. 변경 이력과 최신 목록을 확인하세요.");
  const bytes=new TextEncoder().encode(JSON.stringify({input,rows,guards,actorId:actor.id}));
  const token=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
  const message=input.kind==="assign_teacher"?"저장하면 해당 학급의 담임 조회·관리 권한이 새 담당자에게 적용됩니다.":input.kind==="restore"?"잘못 처리한 학적 상태를 원래 학급의 재학생으로 돌립니다. 재입학·새 학급 배정은 별도로 확인하세요.":"학생 ID·계정 연결·학생부 원본·활동·분석 버전을 유지합니다. 졸업 처리는 로그인 계정 정지와 별개입니다.";
  return {input,token,rows,guards,actor,message};
}
function eventFor(p:Prepared,row:OperationRow,at:string){
  const after={...row.after};if(p.input.kind==="graduate")after.graduatedAt=at;
  return {operationKey:`${p.input.batchId}:${row.targetId}`,batchId:p.input.batchId,kind:p.input.kind,targetType:row.targetType,targetId:row.targetId,beforeJson:JSON.stringify({...row.before,label:row.beforeLabel}),afterJson:JSON.stringify({...after,label:row.afterLabel}),actorId:p.actor.id,actorName:p.actor.displayName,reason:p.input.reason,createdAt:at};
}
export function applyPreparedOperation(state:SchoolState,p:Prepared){
  checkedAdmin(state,p.actor);const at=new Date().toISOString();
  for(const row of p.rows){
    const event=eventFor(p,row,at);
    if(row.targetType==="class")state.tables.classes.find(c=>c.id===row.targetId)!.teacherId=Number(row.after.teacherId);
    else{const student=state.tables.students.find(s=>s.id===row.targetId)!;Object.assign(student,row.after);if(p.input.kind==="graduate")student.graduatedAt=at;}
    insertRow(state,"schoolOperations",event);
  }
}
async function context(viewer:Viewer,input:unknown){
  const batchId=input&&typeof input==="object"&&"batchId" in input?String(input.batchId):"";
  const {actor,state:google,tables}=await currentAdmin(viewer);
  if(google)return {actor,state:google,google:true};
  const db=getDb(),[classRows,studentRows,events]=await db.batch([db.select().from(classes),db.select().from(students),db.select().from(schoolOperations).where(eq(schoolOperations.batchId,batchId))]);
  const state=emptySchoolState();Object.assign(state.tables,tables,{classes:classRows,students:studentRows,schoolOperations:events});
  return {actor,state,google:false};
}
const publicPreview=(p:Prepared):OperationPreview=>({input:p.input,token:p.token,rows:p.rows,message:p.message});
export async function previewOperation(viewer:Viewer,body:unknown){await assertStorageWritable();const c=await context(viewer,body);return publicPreview(await prepareOperation(c.state,c.actor,body));}
// The audit insert is also a transactional precondition. A NULL operation key
// aborts the whole D1 batch if any stored row/role/identity changed after preview.
function valuesMatch(table:typeof students|typeof classes,values:Record<string,unknown>):SQL{
  return and(...Object.entries(values).map(([key,value])=>sql`${table[key as keyof typeof table]} IS ${typeof value==="boolean"?Number(value):value}`))!;
}
export async function commitOperation(viewer:Viewer,input:unknown,token:unknown){
  await assertStorageWritable();const c=await context(viewer,input),p=await prepareOperation(c.state,c.actor,input);
  if(typeof token!=="string"||token!==p.token)fail("확인 후 대상 정보가 바뀌었습니다. 변경 내용을 다시 미리보기하세요.");
  if(c.google){applyPreparedOperation(c.state,p);await commitGoogleState(c.state);return {ok:true,count:p.rows.length};}
  const db=getDb(),at=new Date().toISOString();
  const actorGuard=sql`EXISTS(SELECT 1 FROM ${users} WHERE ${users.id}=${p.actor.id} AND ${users.role}='admin' AND ${users.status}='approved' AND ${users.authUserId}=${p.actor.authUserId})`;
  const identityGuard=p.actor.loginIdentityId?sql`EXISTS(SELECT 1 FROM ${schoolIdentities} WHERE ${schoolIdentities.id}=${p.actor.loginIdentityId} AND ${schoolIdentities.siteId}=${p.actor.loginSiteId} AND ${schoolIdentities.userId}=${p.actor.id} AND ${schoolIdentities.status}='approved')`:sql`1`;
  const statements=p.rows.flatMap((row,i)=>{
    const table=row.targetType==="student"?students:classes,event=eventFor(p,row,at),guard=p.guards[i];
    const checks=[actorGuard,identityGuard,sql`EXISTS(SELECT 1 FROM ${table} WHERE ${valuesMatch(table,row.before)})`,sql`EXISTS(SELECT 1 FROM ${classes} WHERE ${valuesMatch(classes,guard.source)})`];
    if(guard.target)checks.push(sql`EXISTS(SELECT 1 FROM ${classes} WHERE ${valuesMatch(classes,guard.target)})`);
    if(row.targetType==="class")checks.push(sql`EXISTS(SELECT 1 FROM ${users} WHERE ${users.id}=${row.after.teacherId} AND ${users.status}='approved' AND ${users.role} IN ('admin','teacher'))`);
    const log=db.insert(schoolOperations).values({...event,operationKey:sql`CASE WHEN ${and(...checks)} THEN ${event.operationKey} ELSE NULL END`});
    const update=row.targetType==="class"?db.update(classes).set({teacherId:Number(row.after.teacherId)}).where(eq(classes.id,row.targetId)):db.update(students).set({classId:Number(row.after.classId),studentNumber:String(row.after.studentNumber),status:row.after.status as StudentRow["status"],graduatedYear:row.after.graduatedYear as number|null,graduatedAt:p.input.kind==="graduate"?at:row.after.graduatedAt as string|null}).where(eq(students.id,row.targetId));
    return [log,update];
  });
  try{await db.batch(statements as [typeof statements[number],...typeof statements]);}
  catch{fail("변경을 저장하지 못했습니다. 다른 변경 또는 학번 중복 여부를 확인하고 다시 미리보기하세요. 이번 작업은 부분 저장되지 않았습니다.");}
  return {ok:true,count:p.rows.length};
}
export type OperationEvent = typeof schoolOperations.$inferSelect;
export async function operationHistory(viewer:Viewer,params:URLSearchParams){
  const {state}=await currentAdmin(viewer),kind=params.get("kind"),studentId=Number(params.get("studentId")||0),cursor=Number(params.get("cursor")||0),query=(params.get("q")??"").trim().slice(0,100);
  if((kind&&!Object.hasOwn(operationLabels,kind))||!Number.isSafeInteger(studentId)||studentId<0||!Number.isSafeInteger(cursor)||cursor<0)fail("이력 검색 조건을 확인하세요.");
  let rows:OperationEvent[];
  if(state){rows=state.tables.schoolOperations.filter(e=>(!kind||e.kind===kind)&&(!studentId||(e.targetType==="student"&&e.targetId===studentId))&&(!cursor||e.id<cursor)&&(!query||`${e.actorName} ${e.reason} ${e.beforeJson} ${e.afterJson}`.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>b.id-a.id).slice(0,51);}
  else {const term=`%${query.replace(/[\\%_]/g,"\\$&")}%`;rows=await getDb().select().from(schoolOperations).where(and(kind?eq(schoolOperations.kind,kind as OperationKind):undefined,studentId?and(eq(schoolOperations.targetType,"student"),eq(schoolOperations.targetId,studentId)):undefined,cursor?lt(schoolOperations.id,cursor):undefined,query?or(...[schoolOperations.actorName,schoolOperations.reason,schoolOperations.beforeJson,schoolOperations.afterJson].map(col=>sql`${col} LIKE ${term} ESCAPE '\\'`)):undefined)).orderBy(desc(schoolOperations.id)).limit(51);}
  return {events:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null};
}
