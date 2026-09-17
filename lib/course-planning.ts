import type { AcademicCourse } from "@/lib/portal-types";
import type { GuidancePayload, AppliedCriterion } from "@/lib/guidance";
import { calculateCredits } from "@/lib/profile-evidence";

const normalized=(s:string)=>s.normalize("NFKC").replace(/\s+/g,"").toLowerCase();
export function courseRuleCheck(rule:NonNullable<GuidancePayload["reference"]>["rules"][number],courses:AcademicCourse[],sameCurriculum:boolean){
  if(!sameCurriculum)return {state:"교육과정 확인 필요",detail:"학생과 기준 자료의 적용 교육과정을 먼저 확인하세요."};
  if(!rule.subjectNames.length)return {state:"교사 확인 필요",detail:"원문 조건을 해석하여 대상 과목을 등록해야 합니다."};
  const eligible=courses.filter(c=>c.gradeLevel<3||(c.gradeLevel===3&&c.semester<=(rule.semesterThrough==="3-1"?1:2)));
  const matched=eligible.filter(c=>rule.subjectNames.some(s=>normalized(s)===normalized(c.subject)));
  const totals=calculateCredits(matched),conflict=totals.some(g=>g.conflicts>0),unknown=totals.some(g=>g.unknown>0);
  if(conflict)return {state:"중복 기록 확인 필요",detail:"같은 학기 과목의 상태 또는 학점이 서로 다릅니다."};
  const complete=matched.filter(c=>c.selectionStatus==="completed");
  const missing=rule.subjectNames.filter(s=>!complete.some(c=>normalized(c.subject)===normalized(s)));
  const namesSatisfied=rule.match==="all"?missing.length===0:complete.length>0;
  if(!namesSatisfied)return {state:"추가 확인 필요",detail:`현재 이수 기록에서 조건을 확인하지 못했습니다. 미확인 과목: ${missing.join(", ")||rule.subjectNames.join(", ")}. 선택·계획은 이수로 세지 않습니다.`};
  if(rule.minCredits!==null&&unknown)return {state:"학점 자료 확인 필요",detail:"대상 과목의 일부 학점이 미확인입니다."};
  const credits=totals.reduce((n,g)=>n+g.completed,0);
  if(rule.minCredits!==null&&credits<rule.minCredits)return {state:"학점 추가 확인",detail:`확인된 이수 ${credits}학점 / 자료의 참고 기준 ${rule.minCredits}학점`};
  return {state:"이수 근거 확인",detail:`등록된 과목명 조건${rule.minCredits!==null?`과 ${credits} 이수학점`:""}을 확인했습니다. 원문의 예외와 모집단위 적용 여부는 별도로 확인하세요.`};
}

export function criterionApplicability(c:AppliedCriterion,plan:NonNullable<GuidancePayload["plan"]>):string|null {
  if (!c.institution || !c.admissionsYear || !c.admissionTrack || !plan.institution || !plan.admissionsYear || !plan.admissionTrack) return "대학·입학연도·전형 확인 필요";
  if (normalized(c.institution)!==normalized(plan.institution) || c.admissionsYear!==plan.admissionsYear || normalized(c.admissionTrack)!==normalized(plan.admissionTrack)) return "목표 대학·입학연도·전형과 다른 자료";
  if (c.reference.department && normalized(c.reference.department)!==normalized(plan.department)) return "모집단위 적용 여부 확인 필요";
  if (!c.reference.curriculum || normalized(c.reference.curriculum)!==normalized(plan.curriculum)) return "교육과정 적용 여부 확인 필요";
  return null;
}
