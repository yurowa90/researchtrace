import { z } from "zod";
import { approvedSchoolRole, isSchoolStaff } from "@/lib/school-permissions";
import type { PortalData, Viewer } from "@/lib/portal-types";

export const guidanceKinds = { action: "다음 할 일", question: "질문 성장", observation: "교사 관찰", reflection: "읽기·설명·성찰", correction: "분석 정정 요청", record_review: "학생부 검토", reference: "평가 자료 판본", course_offering: "학교 개설 과목", student_plan: "진학·과목 계획", enrollment: "학급 이동" } as const;
export type GuidanceKind = keyof typeof guidanceKinds;
export const workKinds: GuidanceKind[] = ["action", "question", "observation", "reflection", "correction", "record_review"];
export const guidanceStatuses = { draft: "작성 중", active: "진행 중", submitted: "교사 확인 대기", revision_requested: "보완 요청", confirmed: "교사 확인", closed: "마침" } as const;
export const questionOrigins = { daily: "일상에서 생긴 질문", concept: "교과 개념을 배운 뒤", followup: "기존 활동의 다음 질문" } as const;
export const questionPerspectives = ["어린이의 호기심", "의문사", "맥락", "핵심 어휘", "의도·목적", "범위·조건"];
export const sourceStates = { recorded: "원문에 기록됨", self_report: "학생 자기보고", interpretation: "분석 해석", planned: "계획", unknown: "자료 미확인", not_applicable: "해당 없음" } as const;
export const documentStages = { preliminary: "사전 안내", research: "연구 보고서", plan: "시행계획", final: "모집요강", correction: "정정 공지", teaching: "교사 참고 자료", testimony: "사례·수기", ai_summary: "AI 요약" } as const;
export const gradingSystems = { five: "5등급 체계", nine: "9등급 체계", achievement: "성취도", mixed: "여러 평가 체계", unknown: "확인 필요" } as const;
const text = (max: number) => z.string().trim().max(max).default("");
const date = z.string().refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), "날짜를 확인하세요.").default("");
const optionalId = z.number().int().positive().nullable().default(null);
const year = z.number().int().min(2022).max(2100);
const safeUrl = z.string().trim().max(1500).refine(v => !v || /^https?:\/\/[^\s]+$/i.test(v), "http 또는 https 원문 주소만 사용할 수 있습니다.").default("");

export const guidancePayloadSchema = z.object({
  ownerId: z.number().int().nonnegative().default(0),
  title: z.string().trim().min(1).max(180), text: text(8000), subject: text(150),
  achievementStandard: text(1000), observationInterpretation: text(2500), learningRoutine: text(1500), contribution: text(1500),
  origin: z.enum(["daily", "concept", "followup"]).default("daily"), perspective: text(100),
  originalQuestion: text(1500), method: text(2000), result: text(3000), remainingQuestion: text(1500),
  parentKey: text(100), recordId: optionalId, snapshotId: optionalId, sectionKey: text(100),
  page: z.number().int().min(1).max(10000).nullable().default(null), sourceNote: text(2500),
  sourceUrl: safeUrl, dueDate: date,
  status: z.enum(["draft", "active", "submitted", "revision_requested", "confirmed", "closed"]).default("active"),
  response: text(8000), feedback: text(5000), reviewedBy: text(100), reviewedAt: text(40),
  reference: z.object({
    materialId: z.number().int().positive(), stage: z.enum(["preliminary", "research", "plan", "final", "correction", "teaching", "testimony", "ai_summary"]),
    approval: z.enum(["draft", "approved"]).default("draft"), versionLabel: z.string().trim().min(1).max(150),
    publishedOn: date, checkedOn: date, sourceUrl: safeUrl, department: text(300), curriculum: text(150),
    supersedesMaterialId: optionalId, changeSummary: text(3000),
    rules: z.array(z.object({
      label: z.string().trim().min(1).max(200), sourcePage: z.number().int().positive(),
      subjectNames: z.array(z.string().trim().min(1).max(150)).max(30),
      match: z.enum(["all", "any"]).default("all"),
      minCredits: z.number().min(0).max(200).nullable().default(null),
      semesterThrough: z.enum(["3-1", "3-2"]).default("3-1"),
      description: text(2000),
    })).max(30).default([]),
  }).optional(),
  offering: z.object({
    schoolYear: year, grade: z.number().int().min(1).max(3), semester: z.number().int().min(1).max(2),
    subjectGroup: z.string().trim().min(1).max(100), curriculum: z.string().trim().min(1).max(150),
    credits: z.number().min(0).max(20).nullable(),
    availability: z.enum(["offered", "unavailable", "shared", "unknown"]), prerequisites: text(1500),
  }).optional(),
  plan: z.object({
    admissionsYear: year.nullable(), curriculum: text(150),
    gradingSystem: z.enum(["five", "nine", "achievement", "mixed", "unknown"]).default("unknown"),
    institution: text(150), admissionTrack: text(150), department: text(300),
    directionGoal: text(1500), careerGoal: text(1500), semesterGoal: text(1500), immediateGoal: text(1500),
    materialIds: z.array(z.number().int().positive()).max(20).default([]),
    offeringKeys: z.array(z.string().trim().min(1).max(100)).max(40).default([]),
  }).optional(),
  enrollment: z.object({ fromClassId: z.number().int().positive(), toClassId: z.number().int().positive(), previousNumber: z.string().max(30), studentNumber: z.string().trim().min(1).max(30) }).optional(),
});
export type GuidancePayload = z.infer<typeof guidancePayloadSchema>;
export type GuidanceEntry = { id: number; entityKey: string; revision: number; kind: GuidanceKind; studentId: number | null; audience: "student" | "staff"; includeInWork: boolean; payload: GuidancePayload; createdBy: number; actorName: string; actorRole: string; createdAt: string };
export type StoredGuidance = Omit<GuidanceEntry, "payload" | "kind"> & { kind: string; payloadJson: string };
export type AppliedCriterion = { title:string; materialId:number; revision:number; institution:string; admissionsYear:number|null; admissionTrack:string; reference:NonNullable<GuidancePayload["reference"]> };
export function appliedCriteria(entries:GuidanceEntry[], data:Pick<PortalData,"evaluationReferences"|"students"|"referenceMaterials">):AppliedCriterion[]{
  const ids=new Set(data.evaluationReferences.map(r=>Number(/^LIB-(\d+)$/.exec(r.sourceKey)?.[1])));
  const students=new Set(data.students.map(s=>s.id));
  entries.filter(e=>e.kind==="student_plan"&&e.studentId&&students.has(e.studentId)).forEach(e=>e.payload.plan?.materialIds.forEach(id=>ids.add(id)));
  return entries.filter(e=>e.kind==="reference"&&e.payload.reference?.approval==="approved"&&ids.has(e.payload.reference.materialId)&&data.referenceMaterials.some(m=>m.id===e.payload.reference!.materialId&&m.status==="active")).map(e=>{const m=data.referenceMaterials.find(m=>m.id===e.payload.reference!.materialId)!;return {title:e.payload.title,materialId:m.id,revision:e.revision,institution:m.institution,admissionsYear:m.admissionsYear,admissionTrack:m.admissionTrack,reference:e.payload.reference!};});
}
export function decodeGuidance(row: StoredGuidance): GuidanceEntry {
  return { ...row, kind: row.kind as GuidanceKind, payload: guidancePayloadSchema.parse(JSON.parse(row.payloadJson)) };
}
export function latestGuidance<T extends { entityKey: string; revision: number }>(rows: T[]): T[] {
  const current = new Map<string, T>();
  for (const row of rows) if (!current.has(row.entityKey) || current.get(row.entityKey)!.revision < row.revision) current.set(row.entityKey, row);
  return [...current.values()];
}
export function isStaff(viewer: Viewer) { return isSchoolStaff(viewer); }
export function guidanceVisible(row: Pick<GuidanceEntry, "studentId" | "kind" | "audience">, viewer: Viewer, allowedStudents: Set<number>) {
  if (!approvedSchoolRole(viewer)) return false;
  if (row.studentId === null) return row.kind === "course_offering" || (row.kind === "reference" && isStaff(viewer));
  return allowedStudents.has(row.studentId) && (isStaff(viewer) || row.audience === "student");
}
export function referenceEntry(entries: GuidanceEntry[], materialId: number) { return entries.find(e => e.kind === "reference" && e.payload.reference?.materialId === materialId); }
export function studentPlan(entries: GuidanceEntry[], studentId: number) { return entries.find(e => e.kind === "student_plan" && e.studentId === studentId); }
export type ReferenceCheck = { studentId: number; snapshotId: number; sourceKey: string; title: string; reasons: string[] };
export function referenceChecks(data: Pick<PortalData, "evaluationReferences" | "referenceMaterials" | "profileSnapshots">, entries: GuidanceEntry[]): ReferenceCheck[] {
  const activeIds = new Set(data.profileSnapshots.filter(p => p.isActive).map(p => p.id));
  return data.evaluationReferences.filter(r => activeIds.has(r.snapshotId)).flatMap(ref => {
    const id = /^LIB-(\d+)$/.exec(ref.sourceKey)?.[1];
    if (!id) return [];
    const material = data.referenceMaterials.find(m => m.id === Number(id));
    const metadata = referenceEntry(entries, Number(id));
    const replacement = entries.find(e => e.kind === "reference" && e.payload.reference?.approval === "approved" && e.payload.reference?.supersedesMaterialId === Number(id));
    const reasons: string[] = [];
    if (material?.status === "archived") reasons.push("이전 자료로 보관된 판본입니다.");
    if (replacement) reasons.push(`개정 자료가 승인되었습니다: ${replacement.payload.title}`);
    if (!metadata || metadata.payload.reference?.approval !== "approved") reasons.push("관리자의 적용 판본 확인이 필요합니다.");
    else if (ref.materialRevision !== metadata.revision) reasons.push("분석에 적용된 판본 정보와 현재 검토 판본이 다릅니다.");
    if (material && ref.sha256 && material.sha256 !== ref.sha256) reasons.push("분석의 출처 파일과 현재 파일이 다릅니다.");
    const plan = studentPlan(entries, ref.studentId)?.payload.plan;
    if (plan?.admissionsYear && ref.admissionsYear && plan.admissionsYear !== ref.admissionsYear) reasons.push("학생의 목표 입학연도와 자료의 모집 학년도가 다릅니다.");
    return reasons.length ? [{ studentId: ref.studentId, snapshotId: ref.snapshotId, sourceKey: ref.sourceKey, title: ref.title, reasons }] : [];
  });
}

export function guidanceWorkContext(entries: GuidanceEntry[], studentId: number) {
  return entries.filter(e => e.studentId === studentId && e.includeInWork && e.kind !== "enrollment").map(e => ({
    id: e.entityKey, revision: e.revision, type: guidanceKinds[e.kind], authorRole: e.actorRole,
    status: guidanceStatuses[e.payload.status], title: e.payload.title, originalQuestion: e.payload.originalQuestion,
    text: e.payload.text, method: e.payload.method, result: e.payload.result, remainingQuestion: e.payload.remainingQuestion,
    studentResponse: e.payload.response, teacherFeedback: e.payload.feedback,
    achievementStandard:e.payload.achievementStandard, observationInterpretation:e.payload.observationInterpretation, learningRoutine:e.payload.learningRoutine, contribution:e.payload.contribution,
    evidence: { recordId: e.payload.recordId, page: e.payload.page, note: e.payload.sourceNote },
  }));
}
