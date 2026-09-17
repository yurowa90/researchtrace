import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { classes, guidanceEntries, referenceMaterials, studentRecords, students } from "@/db/schema";
import type { Viewer } from "@/lib/data";
import type { PortalData } from "@/lib/portal-types";
import { assertStudentAccess } from "@/lib/data";
import { assertStorageWritable, commitGoogleState, googleEnabled, readGoogleState } from "@/lib/google-bridge";
import { currentGoogleViewer, googleStudentAccess } from "@/lib/google-school";
import { insertRow, type SchoolState } from "@/lib/school-tables";
import { appliedCriteria, decodeGuidance, guidanceKinds, guidancePayloadSchema, guidanceVisible, isStaff, latestGuidance, referenceChecks, workKinds, type GuidanceEntry, type GuidanceKind, type StoredGuidance } from "@/lib/guidance";

const newest = sql`${guidanceEntries.revision} = (SELECT max(g.revision) FROM guidance_entries g WHERE g.entity_key = ${guidanceEntries.entityKey})`;
type Context = {
  studentId: number | null;
  records: Array<{ id:number; studentId:number }>;
  snapshots: Array<{id:number;studentId:number}>;
  materials: Array<{id:number; status:string; institution:string; admissionsYear:number|null; admissionTrack:string}>;
  entries: GuidanceEntry[];
  classroomIds: number[];
};
function fail(message: string): never { throw new Error(message); }
function approved(viewer: Viewer) { if (viewer.status !== "approved") fail("승인된 계정으로 로그인하세요."); }

export function prepareGuidanceRevision(viewer: Viewer, current: GuidanceEntry | undefined, body: Record<string, unknown>, context: Context): Omit<StoredGuidance, "id" | "createdAt"> {
  approved(viewer);
  const kind = (current?.kind ?? body.kind) as GuidanceKind;
  if (!Object.hasOwn(guidanceKinds, kind)) fail("기록 종류를 확인하세요.");
  const staff = isStaff(viewer);
  if (["reference", "course_offering", "enrollment"].includes(kind) && viewer.role !== "admin") fail("관리자만 변경할 수 있습니다.");
  if (["observation", "record_review"].includes(kind) && !staff) fail("교사만 관찰·학생부 검토를 작성할 수 있습니다.");
  const global = kind === "reference" || kind === "course_offering";
  if (global ? context.studentId !== null : context.studentId === null) fail("대상 학생을 확인하세요.");
  if (current && (current.studentId !== context.studentId || (!staff && current.audience !== "student"))) fail("이 기록에 접근할 수 없습니다.");
  const expected = Number(body.expectedRevision ?? 0);
  if (!Number.isSafeInteger(expected) || expected !== (current?.revision ?? 0)) fail("다른 변경이 먼저 저장되었습니다. 최신 기록을 열고 다시 저장하세요.");
  const intent = body.intent ?? "save";
  if (!["save", "submit", "review", "close"].includes(String(intent))) fail("저장 동작을 확인하세요.");
  if (["review", "close"].includes(String(intent)) && !staff) fail("교사만 확인하거나 마칠 수 있습니다.");
  if (!staff && ["confirmed","closed"].includes(current?.payload.status??"")) fail("교사 확인된 기록은 보존됩니다. 새 질문이나 정정 요청을 작성하세요.");
  if (!staff && intent === "save" && current && current.payload.ownerId !== viewer.id && kind !== "student_plan") fail("교사가 등록한 항목은 실행 결과로 답변하세요.");
  const input = body.payload && typeof body.payload === "object" ? body.payload as Record<string,unknown> : {};
  let payloadInput: Record<string, unknown> = { ...input };
  if(!staff)payloadInput.observationInterpretation=current?.payload.observationInterpretation??"";
  if (intent === "submit" || intent === "review" || intent === "close") {
    if (!current) fail("기록을 먼저 저장하세요.");
    payloadInput = { ...current.payload };
    if (intent === "submit") {
      if (!staff && !["action","question","reflection","correction"].includes(kind)) fail("답변할 수 없는 기록입니다.");
      const response = typeof input.response === "string" ? input.response.trim() : "";
      if (!response) fail("무엇을 했고 어떻게 달라졌는지 근거와 함께 적으세요.");
      payloadInput.response = response; payloadInput.status = "submitted";
      payloadInput.reviewedBy = ""; payloadInput.reviewedAt = "";
    } else if (intent === "review") {
      if (!["confirmed", "revision_requested"].includes(String(input.status))) fail("확인 또는 보완 요청을 선택하세요.");
      if (kind === "action" && input.status === "confirmed" && !current.payload.response.trim()) fail("실행 결과가 제출된 뒤 완료를 확인하세요.");
      const feedback = typeof input.feedback === "string" ? input.feedback.trim() : "";
      if (!feedback) fail("확인 근거나 보완할 내용을 적으세요.");
      payloadInput.feedback=feedback; payloadInput.status=input.status; payloadInput.reviewedBy=viewer.displayName; payloadInput.reviewedAt=new Date().toISOString();
    } else payloadInput.status = "closed";
  } else {
    payloadInput.ownerId = current?.payload.ownerId || viewer.id;
    payloadInput.response = current?.payload.response ?? "";
    payloadInput.feedback = current?.payload.feedback ?? "";
    payloadInput.reviewedBy = ""; payloadInput.reviewedAt = "";
    payloadInput.status = input.status === "draft" ? "draft" : "active";
  }
  const parsed = guidancePayloadSchema.safeParse(payloadInput);
  if (!parsed.success) fail(`입력 내용을 확인하세요: ${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}`);
  const p = parsed.data;
  if (p.recordId && !context.records.some(r => r.id === p.recordId && r.studentId === context.studentId)) fail("이 학생의 원본만 근거로 연결할 수 있습니다.");
  if (p.snapshotId && !context.snapshots.some(r => r.id === p.snapshotId && r.studentId === context.studentId)) fail("이 학생의 분석 버전만 연결할 수 있습니다.");
  if (p.page && !p.recordId) fail("쪽수를 연결할 원본을 선택하세요.");
  if (p.parentKey) {
    const parent = context.entries.find(e => e.entityKey === p.parentKey);
    if (!parent || parent.studentId !== context.studentId || (!staff && parent.audience !== "student") || parent.entityKey === current?.entityKey) fail("같은 학생의 접근 가능한 이전 질문·활동만 연결하세요.");
    const visited = new Set([current?.entityKey]); let next: GuidanceEntry | undefined = parent;
    while (next) { if (visited.has(next.entityKey)) fail("질문 연결이 순환하지 않도록 확인하세요."); visited.add(next.entityKey); next = context.entries.find(e => e.entityKey === next!.payload.parentKey); }
  }
  if (kind === "reference") {
    const r = p.reference;
    if (!r || !context.materials.some(m => m.id === r.materialId)) fail("등록한 공용 자료를 선택하세요.");
    if (r.approval === "approved" && (!r.checkedOn || !r.versionLabel)) fail("적용 승인 전에 판본과 확인일을 적으세요.");
    if (r.rules.length && !["plan","final","correction"].includes(r.stage)) fail("과목 점검 규칙은 시행계획·모집요강·정정 공지의 확인된 조항으로 등록하세요.");
    if (r.supersedesMaterialId) {
      if (r.supersedesMaterialId === r.materialId || !context.materials.some(m => m.id === r.supersedesMaterialId)) fail("대체할 이전 자료를 확인하세요.");
      const seen=new Set([r.materialId]);let next: number|null=r.supersedesMaterialId;
      while(next){if(seen.has(next))fail("자료의 대체 관계가 순환합니다.");seen.add(next);next=context.entries.find(e=>e.payload.reference?.materialId===next)?.payload.reference?.supersedesMaterialId??null;}
    }
  } else if (p.reference) fail("공용 자료 설정은 관리자 자료 화면에서 저장하세요.");
  if (kind === "course_offering" ? !p.offering : Boolean(p.offering)) fail("학교 개설 과목 정보를 확인하세요.");
  if (kind === "student_plan") {
    if (!p.plan || p.plan.materialIds.some(id => !context.materials.some(m=>m.id===id))) fail("진학 계획과 평가 자료를 확인하세요.");
    if (!staff && JSON.stringify([...p.plan.materialIds].sort()) !== JSON.stringify([...(current?.payload.plan?.materialIds??[])].sort())) fail("평가 기준 지정은 담당 교사에게 요청하세요.");
    if (p.plan.offeringKeys.some(key=>!context.entries.some(e=>e.entityKey===key&&e.kind==="course_offering"))) fail("등록된 학교 개설 과목만 선택하세요.");
  } else if (p.plan) fail("진학 계획 화면에서 저장하세요.");
  if (kind === "enrollment") {
    if (!p.enrollment || !context.classroomIds.includes(p.enrollment.toClassId)) fail("이동할 학급을 확인하세요.");
  } else if (p.enrollment) fail("학급 이동 화면에서 변경하세요.");
  let key = current?.entityKey ?? (typeof body.entityKey === "string" && /^[a-f0-9-]{36}$/.test(body.entityKey) ? body.entityKey : crypto.randomUUID());
  if(kind==="reference") key=`reference:${p.reference!.materialId}`;
  if(kind==="student_plan") key=`plan:${context.studentId}`;
  if(kind==="enrollment") key=`enrollment:${context.studentId}`;
  if(current && key!==current.entityKey) fail("기록의 대상을 바꿀 수 없습니다.");
  return { entityKey:key, revision:expected+1, kind, studentId:context.studentId,
    audience:global ? (kind==="reference"?"staff":"student") : (staff && intent==="save" ? (body.audience==="staff"?"staff":"student") : current?.audience??"student"),
    includeInWork:intent==="save"?body.includeInWork===true:current?.includeInWork??false,
    payloadJson:JSON.stringify(p), createdBy:viewer.id,actorName:viewer.displayName,actorRole:viewer.role,
  };
}

export function guidanceFromState(state: SchoolState, viewer: Viewer, data: PortalData) {
  const entries=latestGuidance(state.tables.guidanceEntries??[]).map(decodeGuidance);
  const allowed=new Set(data.students.map(s=>s.id));
  return {appliedCriteria:appliedCriteria(entries,{...data,referenceMaterials:state.tables.referenceMaterials}),guidance:entries.filter(e=>guidanceVisible(e,viewer,allowed)), referenceChecks:referenceChecks({...data,referenceMaterials:state.tables.referenceMaterials},entries)};
}
export async function guidanceForPortal(viewer: Viewer, data: PortalData) {
  if(viewer.status!=="approved")return {guidance:[],referenceChecks:[],appliedCriteria:[]};
  const db=getDb();
  const studentScope=viewer.role==="admin"?undefined:viewer.role==="teacher"?inArray(students.classId,db.select({id:classes.id}).from(classes).where(eq(classes.teacherId,viewer.id))):eq(students.userId,viewer.id);
  const rows=await db.select().from(guidanceEntries).where(and(newest,or(isNull(guidanceEntries.studentId),inArray(guidanceEntries.studentId,db.select({id:students.id}).from(students).where(studentScope)))));
  const entries=rows.map(decodeGuidance),allowed=new Set(data.students.map(s=>s.id));
  const materials=await db.select({id:referenceMaterials.id,status:referenceMaterials.status,sha256:referenceMaterials.sha256,institution:referenceMaterials.institution,admissionsYear:referenceMaterials.admissionsYear,admissionTrack:referenceMaterials.admissionTrack}).from(referenceMaterials);
  return {appliedCriteria:appliedCriteria(entries,{...data,referenceMaterials:materials as PortalData["referenceMaterials"]}),guidance:entries.filter(e=>guidanceVisible(e,viewer,allowed)),referenceChecks:referenceChecks({...data,referenceMaterials:materials as PortalData["referenceMaterials"]},entries)};
}

export function applyGuidanceAction(state: SchoolState, givenViewer: Viewer, body: Record<string, unknown>) {
  const viewer=currentGoogleViewer(state,givenViewer);approved(viewer);
  if(!Array.isArray(state.tables.guidanceEntries))fail("구글 저장소 설치 코드를 갱신한 뒤 설정을 다시 실행하세요. 기존 자료는 보존됩니다.");
  const entries=latestGuidance(state.tables.guidanceEntries).map(decodeGuidance);
  const kind=String(body.kind),studentId=body.studentId==null?null:Number(body.studentId);
  if(studentId!==null)googleStudentAccess(state,viewer,studentId);
  let key=String(body.entityKey??"");
  if(kind==="reference")key=`reference:${(body.payload as {reference?:{materialId?:number}})?.reference?.materialId}`;
  if(kind==="student_plan")key=`plan:${studentId}`;
  if(kind==="enrollment")key=`enrollment:${studentId}`;
  const current=entries.find(e=>e.entityKey===key);
  const values=prepareGuidanceRevision(viewer,current,body,{studentId,records:state.tables.studentRecords,snapshots:state.tables.profileSnapshots,materials:state.tables.referenceMaterials,entries,classroomIds:state.tables.classes.map(c=>c.id)});
  if(values.kind==="enrollment"){
    const e=JSON.parse(values.payloadJson).enrollment,student=state.tables.students.find(s=>s.id===studentId)!;
    if(student.classId!==e.fromClassId||student.studentNumber!==e.previousNumber)fail("학생의 현재 학급 정보가 바뀌었습니다. 다시 확인하세요.");
    if(state.tables.students.some(s=>s.id!==studentId&&s.classId===e.toClassId&&s.studentNumber===e.studentNumber))fail("이동할 학급에 같은 학번이 있습니다.");
    student.classId=e.toClassId;student.studentNumber=e.studentNumber;
  }
  const row=insertRow(state,"guidanceEntries",values);
  return {ok:true,entry:decodeGuidance(row)};
}

export async function saveGuidance(viewer: Viewer, body: Record<string,unknown>) {
  approved(viewer);await assertStorageWritable();
  if(await googleEnabled()) {const state=await readGoogleState();const result=applyGuidanceAction(state,viewer,body);await commitGoogleState(state);return result;}
  const db=getDb(),kind=String(body.kind),studentId=body.studentId==null?null:Number(body.studentId);
  if(studentId!==null){if(!Number.isSafeInteger(studentId)||studentId<1)fail("학생을 확인하세요.");await assertStudentAccess(viewer,studentId);}
  const rows=await db.select().from(guidanceEntries).where(and(newest,or(isNull(guidanceEntries.studentId),studentId?eq(guidanceEntries.studentId,studentId):undefined)));
  const entries=rows.map(decodeGuidance);
  let key=String(body.entityKey??"");
  if(kind==="reference")key=`reference:${(body.payload as {reference?:{materialId?:number}})?.reference?.materialId}`;
  if(kind==="student_plan")key=`plan:${studentId}`;
  if(kind==="enrollment")key=`enrollment:${studentId}`;
  const current=entries.find(e=>e.entityKey===key);
  // A supplied key must not be rebound to a different student.
  if(!current&&body.entityKey){const [other]=await db.select({id:guidanceEntries.id}).from(guidanceEntries).where(eq(guidanceEntries.entityKey,String(body.entityKey))).limit(1);if(other)fail("이 기록에 접근할 수 없습니다.");}
  const records=studentId?await db.select({id:studentRecords.id,studentId:studentRecords.studentId}).from(studentRecords).where(eq(studentRecords.studentId,studentId)):[];
  const {profileSnapshots}=await import("@/db/schema");
  const snapshots=studentId?await db.select({id:profileSnapshots.id,studentId:profileSnapshots.studentId}).from(profileSnapshots).where(eq(profileSnapshots.studentId,studentId)):[];
  const materials=await db.select().from(referenceMaterials);
  const classrooms=viewer.role==="admin"?await db.select().from(classes):[];
  const values=prepareGuidanceRevision(viewer,current,body,{studentId,records,snapshots,materials,entries,classroomIds:classrooms.map(c=>c.id)});
  try {
    if(values.kind==="enrollment"){
      const e=JSON.parse(values.payloadJson).enrollment;
      const [student]=await db.select().from(students).where(eq(students.id,studentId!));
      if(student.classId!==e.fromClassId||student.studentNumber!==e.previousNumber)fail("학생의 현재 학급 정보가 바뀌었습니다. 다시 확인하세요.");
      const result=await db.batch([db.insert(guidanceEntries).values(values).returning(),db.update(students).set({classId:e.toClassId,studentNumber:e.studentNumber}).where(eq(students.id,studentId!))]);
      return {ok:true,entry:decodeGuidance(result[0][0])};
    }
    const [row]=await db.insert(guidanceEntries).values(values).returning();return {ok:true,entry:decodeGuidance(row)};
  } catch {fail("저장하지 못했습니다. 최신 기록과 학번 중복 여부를 확인한 뒤 다시 시도하세요. 입력 내용은 유지됩니다.");}
}

export async function guidanceHistory(viewer: Viewer, key: string) {
  approved(viewer);if(!key||key.length>100)fail("기록을 확인하세요.");
  let rows:StoredGuidance[];
  if(await googleEnabled()) {const state=await readGoogleState();viewer=currentGoogleViewer(state,viewer);rows=(state.tables.guidanceEntries??[]).filter(e=>e.entityKey===key);const row=rows[0];if(row?.studentId)googleStudentAccess(state,viewer,row.studentId);}
  else {rows=await getDb().select().from(guidanceEntries).where(eq(guidanceEntries.entityKey,key)).orderBy(guidanceEntries.revision);if(rows[0]?.studentId)await assertStudentAccess(viewer,rows[0].studentId);}
  if(!rows.length)return [];
  const latest=rows.reduce((a,b)=>a.revision>b.revision?a:b);
  if(!guidanceVisible({...latest,kind:latest.kind as GuidanceKind},viewer,new Set(latest.studentId?[latest.studentId]:[])))fail("이 기록에 접근할 수 없습니다.");
  return rows.filter(r=>isStaff(viewer)||r.audience==="student").map(decodeGuidance);
}
