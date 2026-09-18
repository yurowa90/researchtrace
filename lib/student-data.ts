import { getPortalData, type Viewer } from "@/lib/data";
import { getStorageConnection, readGoogleState } from "@/lib/google-bridge";
import { googlePortalData } from "@/lib/google-school";
import { currentIdentityActor, readLegacyIdentityData } from "@/lib/school-identities";
import { approvedSchoolRole } from "@/lib/school-permissions";
import { guidanceHistory, saveGuidance } from "@/lib/guidance-store";
import { studentProjection } from "@/lib/student-overview";
import type { PortalData } from "@/lib/portal-types";

export class StudentAccessError extends Error {constructor(message="본인에게 연결된 학생 자료만 사용할 수 있습니다."){super(message);}}
export type StudentOption={id:number;name:string;studentNumber:string;className:string};
export type StudentReport={state:"ready";data:PortalData;readOnly:boolean;storage:"legacy"|"migrating"|"google";choices:StudentOption[]}|{state:"unlinked"}|{state:"choose";choices:StudentOption[]};
async function currentStudent(viewer:Viewer) {
  const connection=await getStorageConnection(),state=connection?.state==="google"?await readGoogleState():null;
  const actor=currentIdentityActor(state?.tables??await readLegacyIdentityData(),viewer),role=approvedSchoolRole(actor);
  if(role!=="student"&&role!=="admin")throw new StudentAccessError("승인된 학생 계정으로 접속하세요.");
  const data=state?googlePortalData(state,actor):await getPortalData(actor);
  return {actor,data,connection};
}
export async function getStudentReport(viewer:Viewer,requestedId?:number):Promise<StudentReport> {
  const {actor,data,connection}=await currentStudent(viewer);
  const choices=actor.role==="admin"?data.students.map(s=>({id:s.id,name:s.name,studentNumber:s.studentNumber,className:data.classes.find(c=>c.id===s.classId)?.name??"학급 미확인"})):[];
  if(actor.role==="admin"&&requestedId===undefined)return {state:"choose",choices};
  const owned=actor.role==="student"?data.students.filter(s=>s.userId===actor.id):data.students;
  if(actor.role==="student"&&!owned.length)return {state:"unlinked"};
  if(actor.role==="student"&&owned.length!==1)throw new StudentAccessError("여러 학생이 계정에 연결되어 있습니다. 관리자에게 연결 확인을 요청하세요.");
  const selected=requestedId===undefined?owned[0]:owned.find(s=>s.id===requestedId);
  if(!selected)throw new StudentAccessError();
  return {state:"ready",data:studentProjection(data,selected.id),readOnly:actor.role==="admin",storage:connection?.state??"legacy",choices};
}
export async function saveStudentGuidance(viewer:Viewer,body:Record<string,unknown>) {
  const {actor,data}=await currentStudent(viewer);
  if(actor.role!=="student")throw new StudentAccessError("관리자 학생 화면은 열람용입니다. 지도 내용은 관리자·교사 화면에서 작성하세요.");
  const owned=data.students.filter(s=>s.userId===actor.id);
  if(owned.length!==1)throw new StudentAccessError();
  const studentId=owned[0].id;
  if(body.studentId!==undefined&&body.studentId!==studentId)throw new StudentAccessError();
  if(body.audience!==undefined&&body.audience!=="student")throw new StudentAccessError("교직원 전용 기록은 학생이 작성할 수 없습니다.");
  if(body.action!==undefined||!["action","question","reflection","correction","student_plan"].includes(String(body.kind))||!["save","submit"].includes(String(body.intent??"save")))throw new StudentAccessError("학생이 작성하거나 제출할 수 있는 기록만 저장할 수 있습니다.");
  return saveGuidance(actor,{...body,studentId,audience:"student"});
}
export async function getStudentHistory(viewer:Viewer,key:string,studentId?:number) {
  const report=await getStudentReport(viewer,studentId);
  if(report.state!=="ready"||!report.data.guidance.some(e=>e.studentId===report.data.students[0].id&&e.entityKey===key))throw new StudentAccessError();
  return (await guidanceHistory(viewer,key)).filter(e=>e.audience==="student"&&e.studentId===report.data.students[0].id);
}
