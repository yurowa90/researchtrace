import type { PortalData, Student } from "@/lib/portal-types";
import { latestGuidance, workKinds } from "@/lib/guidance";
import { studentReadiness } from "@/lib/portal-workflow";

export const teacherViews = ["home", "students", "inbox", "guidance", "planning", "records", "academics", "activityReview", "fingerprint", "evaluation", "wiki", "import", "references", "guide"] as const;
export type TeacherView = typeof teacherViews[number];
export type TeacherFilter = "all" | "missingRecords" | "analysis" | "unlinked";
export function isTeacherView(value: unknown): value is TeacherView { return teacherViews.includes(value as TeacherView); }
export function teacherUrl(view: TeacherView, studentId?: number, entryKey?: string) {
  const p = new URLSearchParams({view});
  if (studentId) p.set("student", String(studentId));
  if (entryKey) p.set("entry", entryKey);
  return `/?${p}`;
}
export function koreanToday(now = new Date()) { return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(now); }
export function needsTeacherAnalysis(data: PortalData, student: Student) {
  return !studentReadiness(data,student).profile || data.records.some(r => r.studentId === student.id && r.processingStatus === "source_only");
}
export function teacherStudents(data: PortalData, options: {classId?: number|null; status?: string; examples?: boolean; query?: string; filter?: TeacherFilter} = {}) {
  const query = (options.query ?? "").trim().toLocaleLowerCase();
  return data.students.filter(s => (!options.classId || s.classId === options.classId) && (options.examples || !s.isExample) && (options.status === "all" || s.status === (options.status ?? "active")))
    .filter(s => !query || [s.name,s.studentNumber,s.email ?? "",...data.researchKeywords.filter(k=>k.studentId===s.id).map(k=>k.keyword),...data.profileSnapshots.filter(p=>p.studentId===s.id&&p.isActive).map(p=>p.oneLineProfile)].join(" ").toLocaleLowerCase().includes(query))
    .filter(s => options.filter === "missingRecords" ? studentReadiness(data,s).missingGrades.length > 0 : options.filter === "analysis" ? needsTeacherAnalysis(data,s) : options.filter === "unlinked" ? !s.userId : true)
    .sort((a,b)=>a.classId-b.classId||a.studentNumber.localeCompare(b.studentNumber,"ko",{numeric:true})||a.id-b.id);
}
export function teacherOverview(data: PortalData, students: Student[], today = koreanToday()) {
  const active = students.filter(s=>s.status==="active"), ids = new Set(active.map(s=>s.id));
  const queue = latestGuidance(data.guidance).filter(e=>e.studentId && ids.has(e.studentId) && workKinds.includes(e.kind)).flatMap(entry=>{
    const status=entry.payload.status;
    const submitted=status==="submitted";
    const correction=entry.kind==="correction" && ["active","submitted","revision_requested"].includes(status);
    const overdue=["active","revision_requested"].includes(status) && !!entry.payload.dueDate && entry.payload.dueDate<today;
    return submitted||correction||overdue ? [{entry,submitted,correction,overdue,priority:submitted?0:correction?1:2}] : [];
  }).sort((a,b)=>a.priority-b.priority || (a.entry.payload.dueDate||"9999").localeCompare(b.entry.payload.dueDate||"9999") || a.entry.createdAt.localeCompare(b.entry.createdAt) || a.entry.id-b.entry.id);
  return {active:active.length,missingRecords:active.filter(s=>studentReadiness(data,s).missingGrades.length>0),analysis:active.filter(s=>needsTeacherAnalysis(data,s)),unlinked:active.filter(s=>!s.userId),queue,submitted:queue.filter(q=>q.submitted).length,corrections:queue.filter(q=>q.correction).length,overdue:queue.filter(q=>q.overdue).length,referenceChecks:data.referenceChecks.filter(c=>ids.has(c.studentId))};
}
