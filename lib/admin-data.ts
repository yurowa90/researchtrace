import { getPortalData, performPortalAction, type Viewer } from "@/lib/data";
import { getStorageConnection, readGoogleState } from "@/lib/google-bridge";
import { googlePortalData } from "@/lib/google-school";
import { currentIdentityActor, readLegacyIdentityData } from "@/lib/school-identities";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { portalLink, schoolSite } from "@/lib/site-runtime";
import type { PortalData } from "@/lib/portal-types";

export class AdminAccessError extends Error { constructor() { super("학교 관리자만 이 화면을 사용할 수 있습니다."); } }
export type AdminReport = {
  data: PortalData;
  storage: "legacy" | "migrating" | "google";
  isHome: boolean;
  teacherUrl: string | null;
  studentUrl: string | null;
  pendingConnections: number;
  accounts: { id:number; displayName:string; email:string; role:string; status:string }[];
};
export async function currentAdmin(viewer: Viewer) {
  // Check stored identity and role, including revocation, before returning data.
  const connection = await getStorageConnection();
  const state = connection?.state === "google" ? await readGoogleState() : null;
  const tables = state?.tables ?? await readLegacyIdentityData();
  const actor = currentIdentityActor(tables, viewer);
  if (!isSchoolAdmin(actor)) throw new AdminAccessError();
  return { actor, connection, state, tables };
}
export async function getAdminReport(viewer: Viewer): Promise<AdminReport> {
  const { actor, connection, state, tables } = await currentAdmin(viewer);
  return {
    data: state ? googlePortalData(state, actor) : await getPortalData(actor),
    storage: connection?.state ?? "legacy", isHome: schoolSite().isHome, teacherUrl:portalLink("TRACE_TEACHER_PORTAL_URL"),studentUrl:portalLink("TRACE_STUDENT_PORTAL_URL"),
    pendingConnections: tables.schoolIdentities.filter(r => r.status === "pending").length,
    accounts: tables.users.map(({id,displayName,email,role,status})=>({id,displayName,email,role,status})),
  };
}
const adminActions = new Set(["addClass","addStudent","bulkAddStudents","assignClassTeacher","updateStudentStatus","approveUser","approveTeacher","setReferenceStatus","setReferenceSelection"]);
export async function performAdminAction(viewer: Viewer, body: Record<string,unknown>) {
  const { actor } = await currentAdmin(viewer);
  if (!adminActions.has(String(body.action))) throw new Error("관리 화면에서 지원하지 않는 작업입니다.");
  return performPortalAction(actor, body);
}
