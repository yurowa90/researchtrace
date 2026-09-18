import type { PortalData } from "@/lib/portal-types";
import { latestGuidance, workKinds } from "@/lib/guidance";
import { koreanToday } from "@/lib/teacher-overview";

export const studentViews=["home","journal","feedback","fingerprint","academics","activityReview","evaluation","wiki","planning","records","guide"] as const;
export type StudentView=typeof studentViews[number];
export type StudentKind="action"|"question"|"reflection"|"correction";
export const studentKinds:Record<StudentKind,string>={question:"질문",action:"다음 할 일",reflection:"읽기·성찰",correction:"분석 정정 요청"};
export function isStudentView(value:unknown):value is StudentView {return studentViews.includes(value as StudentView);}
export function studentUrl(view:StudentView,studentId?:number,entryKey?:string) {
  const params=new URLSearchParams({view});
  if(studentId)params.set("student",String(studentId));
  if(entryKey)params.set("entry",entryKey);
  return `/?${params}`;
}
export function studentOverview(data:PortalData,today=koreanToday()) {
  const student=data.students[0];
  const entries=latestGuidance(data.guidance).filter(e=>e.studentId===student?.id&&e.audience==="student"&&workKinds.includes(e.kind)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id);
  const actionable=entries.filter(e=>["action","question","reflection","correction"].includes(e.kind));
  const next=actionable.filter(e=>["active","revision_requested","draft"].includes(e.payload.status)).sort((a,b)=>Number(b.payload.status==="revision_requested")-Number(a.payload.status==="revision_requested")||(a.payload.dueDate||"9999").localeCompare(b.payload.dueDate||"9999")||a.id-b.id);
  return {student,entries,next,feedback:entries.filter(e=>e.payload.feedback.trim()),submitted:actionable.filter(e=>e.payload.status==="submitted"),revisions:actionable.filter(e=>e.payload.status==="revision_requested"),overdue:next.filter(e=>e.payload.status!=="draft"&&e.payload.dueDate&&e.payload.dueDate<today),profile:data.profileSnapshots.find(p=>p.studentId===student?.id&&p.isActive),keywords:data.researchKeywords.filter(k=>k.studentId===student?.id).slice(0,6)};
}

// Applied to both student reads and administrator previews. Private notes never
// enter the student interface, even when the requesting administrator can read them.
export function studentProjection(data:PortalData,studentId:number):PortalData {
  const selected=data.students.find(s=>s.id===studentId);
  if(!selected)throw new Error("학생 연결을 확인하세요.");
  const forStudent=<T extends {studentId:number}>(rows:T[])=>rows.filter(r=>r.studentId===studentId);
  const activities=forStudent(data.activities),activityIds=new Set(activities.map(r=>r.id));
  const threads=forStudent(data.threads),threadIds=new Set(threads.map(r=>r.id));
  const profileSnapshots=forStudent(data.profileSnapshots),snapshotIds=new Set(profileSnapshots.filter(s=>s.isActive).map(s=>s.id));
  const active=<T extends {studentId:number;snapshotId:number}>(rows:T[])=>forStudent(rows).filter(r=>snapshotIds.has(r.snapshotId));
  const guidance=latestGuidance(data.guidance).filter(e=>e.audience==="student"&&(e.studentId===studentId||(e.studentId===null&&e.kind==="course_offering")));
  const evaluationReferences=active(data.evaluationReferences);
  const materialIds=new Set(evaluationReferences.map(r=>Number(/^LIB-(\d+)$/.exec(r.sourceKey)?.[1])));
  guidance.filter(e=>e.kind==="student_plan").forEach(e=>e.payload.plan?.materialIds.forEach(id=>materialIds.add(id)));
  const {id,email,displayName,role,status}=data.viewer;
  return {...data,viewer:{id,email,displayName,role,status},students:[selected],classes:data.classes.filter(c=>c.id===selected.classId).map(c=>({...c,inviteCode:""})),subjects:data.subjects.filter(s=>s.classId===selected.classId),activities,threads,
    fingerprints:forStudent(data.fingerprints).filter(r=>activityIds.has(r.activityId)),threadActivities:data.threadActivities.filter(r=>threadIds.has(r.threadId)&&activityIds.has(r.activityId)),files:data.files.filter(r=>activityIds.has(r.activityId)),records:forStudent(data.records),profileSnapshots,
    profileSections:active(data.profileSections),researchKeywords:active(data.researchKeywords),ontologyNodes:active(data.ontologyNodes),ontologyEdges:active(data.ontologyEdges),wikiPages:active(data.wikiPages),academicCourses:active(data.academicCourses),academicTrends:active(data.academicTrends),creditSummaries:active(data.creditSummaries),competencyEvaluations:active(data.competencyEvaluations),evaluationReferences,
    guidance,referenceChecks:data.referenceChecks.filter(c=>c.studentId===studentId),appliedCriteria:data.appliedCriteria.filter(c=>materialIds.has(c.materialId)),referenceMaterials:[],selectedReferenceMaterialIds:[],pendingUsers:[],staffUsers:[]};
}
