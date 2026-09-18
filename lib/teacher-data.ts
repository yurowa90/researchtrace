import { getPortalData, performPortalAction, type Viewer } from "@/lib/data";
import { getStorageConnection, readGoogleState } from "@/lib/google-bridge";
import { googlePortalData } from "@/lib/google-school";
import { currentIdentityActor, readLegacyIdentityData } from "@/lib/school-identities";
import { isSchoolStaff } from "@/lib/school-permissions";
import type { PortalData } from "@/lib/portal-types";

export class TeacherAccessError extends Error { constructor() { super("승인된 교사 또는 관리자 계정이 필요합니다."); } }
export type TeacherReport = {state:"ready";data:PortalData;storage:"legacy"|"migrating"|"google"};
async function currentTeacher(viewer:Viewer) {
  const connection=await getStorageConnection();
  const state=connection?.state==="google"?await readGoogleState():null;
  const actor=currentIdentityActor(state?.tables??await readLegacyIdentityData(),viewer);
  if (!isSchoolStaff(actor)) throw new TeacherAccessError();
  return {actor,state,connection};
}
export async function getTeacherReport(viewer:Viewer):Promise<TeacherReport> {
  const {actor,state,connection}=await currentTeacher(viewer);
  const data=state?googlePortalData(state,actor):await getPortalData(actor);
  const {id,email,displayName,role,status}=data.viewer;
  // Only the scoped school data needed by the teaching workspace leaves the server.
  return {state:"ready",storage:connection?.state??"legacy",data:{...data,viewer:{id,email,displayName,role,status},pendingUsers:[],staffUsers:[]}};
}
const actions=new Set(["addStudent","bulkAddStudents","importProfile","activateProfileVersion","setReferenceSelection"]);
export async function performTeacherAction(viewer:Viewer,body:Record<string,unknown>) {
  const {actor}=await currentTeacher(viewer);
  if(!actions.has(String(body.action))) throw new TeacherAccessError();
  return performPortalAction(actor,body);
}
