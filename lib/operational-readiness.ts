import { tableNames, type SchoolRows } from "@/lib/school-tables";

export type ReadinessCheck = { id: string; title: string; state: "pass" | "action" | "manual"; detail: string; next: string };
export type ReadinessReport = {
  checkedAt: string; portal: string; storage: "legacy" | "migrating" | "google";
  checks: ReadinessCheck[]; roleLinks: { student: number; teacher: number };
  links: { student: string | null; teacher: string | null }; tableCount: number;
};
export function accountReadiness(t: SchoolRows) {
  const active = t.students.filter(row => !row.isExample && row.status === "active");
  const approved = t.users.filter(row => row.status === "approved");
  const studentIds = new Set(approved.filter(row => row.role === "student").map(row => row.id));
  const staffIds = new Set(approved.filter(row => row.role === "teacher" || row.role === "admin").map(row => row.id));
  const unlinked = active.filter(row => row.userId == null || !studentIds.has(row.userId)).length;
  const classIds = new Set(active.map(row => row.classId));
  const unassigned = [...classIds].filter(id => { const c = t.classes.find(row => row.id === id); return !c || !staffIds.has(c.teacherId); }).length;
  const linked = (mode: "student" | "teacher") => new Set(t.schoolIdentities.filter(row => row.portalMode === mode && row.status === "approved" && approved.some(user => user.id === row.userId && user.role === mode)).map(row => row.userId)).size;
  return { activeStudents: active.length, unlinked, unassigned, pending: t.schoolIdentities.filter(row => row.status === "pending").length,
    roleLinks: { student: linked("student"), teacher: linked("teacher") }, tableCount: tableNames.length };
}
