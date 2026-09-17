import type { AcademicCourse, PortalData } from "@/lib/portal-types";
import { profileImportSchema, type ProfileImport } from "@/lib/profile-import";

export function hydrateProfileDetails<T extends { profileSnapshots: PortalData["profileSnapshots"]; profileSections: PortalData["profileSections"]; ontologyEdges: PortalData["ontologyEdges"]; academicCourses: PortalData["academicCourses"]; creditSummaries: PortalData["creditSummaries"]; competencyEvaluations: PortalData["competencyEvaluations"]; evaluationReferences: PortalData["evaluationReferences"]; records: PortalData["records"] }>(data: T, raws: Array<{ id: number; rawJson: string }>): T {
  const profiles = new Map<number, ProfileImport>();
  for (const row of raws) { try { const parsed = profileImportSchema.safeParse(JSON.parse(row.rawJson)); if (parsed.success) profiles.set(row.id, parsed.data); } catch { /* Older results stay visible with unknown provenance. */ } }
  return { ...data,
    profileSnapshots: data.profileSnapshots.map(row => ({ ...row, analysisContext: profiles.get(row.id)?.analysisContext })),
    profileSections: data.profileSections.map(row => {
      const source = profiles.get(row.snapshotId)?.sections[row.sortOrder];
      const ownRecord = data.records.find(r => r.id === source?.recordId && r.studentId === row.studentId);
      return { ...row, sectionKey: source?.id ?? `legacy-${row.id}`, sourceState: source?.sourceState ?? "unknown", recordId: ownRecord?.id ?? null, page: ownRecord ? source?.page : null, sourceLocation: source?.sourceLocation ?? "" };
    }),
    ontologyEdges: data.ontologyEdges.map(row => {
      const source = profiles.get(row.snapshotId)?.ontology.edges.find(e => e.source === row.sourceKey && e.target === row.targetKey && e.relation === row.relation);
      return { ...row, evidenceRefs: source?.evidenceRefs ?? [], sourceState: source?.sourceState ?? "unknown" };
    }),
    academicCourses: data.academicCourses.map((row, index, all) => {
      const profile = profiles.get(row.snapshotId);
      const source = profile?.academicAnalysis.courses[all.slice(0, index).filter(c => c.snapshotId === row.snapshotId).length];
      return { ...row, credits: source ? (profile?.schemaVersion !== "1.2" && source.credits === 0 ? null : source.credits) : (row.credits || null), gradingSystem: source?.gradingSystem ?? "unknown", evidenceRefs: source?.evidenceRefs ?? [] };
    }),
    creditSummaries: data.creditSummaries.map(row => {
      const p = profiles.get(row.snapshotId), source = p?.academicAnalysis.creditSummary.find(c => c.subjectGroup === row.subjectGroup);
      const known = (n: number | null | undefined) => n == null || (p?.schemaVersion !== "1.2" && n === 0) ? null : n;
      return { ...row, completedCredits: known(source ? source.completedCredits : row.completedCredits), selectedCredits: known(source ? source.selectedCredits : row.selectedCredits), plannedCredits: known(source ? source.plannedCredits : row.plannedCredits) };
    }),
    competencyEvaluations: data.competencyEvaluations.map(row => {
      const source = profiles.get(row.snapshotId)?.evaluationAnalysis.competencies.find(c => c.sourceId === row.sourceKey && c.competency === row.competency);
      return { ...row, score: source?.score ?? null, scoreMethod: source?.scoreMethod, evidenceState: source?.evidenceState ?? "partial" };
    }),
    evaluationReferences: data.evaluationReferences.map(row => {
      const source = profiles.get(row.snapshotId)?.evaluationAnalysis.references.find(r => r.id === row.sourceKey);
      return { ...row, sha256: source?.sha256, materialRevision: source?.materialRevision, department: source?.department ?? "" };
    }),
  };
}

export function profileEvidenceIssues(profile: ProfileImport, records: Array<{ id: number; studentId: number; coverage?: Array<{schoolYear: number}>; schoolYear: number }>, studentId: number) {
  const issues: string[] = [];
  for (const section of profile.sections) {
    if (section.page && !section.recordId) issues.push(`${section.title}: 쪽수를 연결할 원본 ID가 필요합니다.`);
    if (!section.recordId) continue;
    const record = records.find(r => r.id === section.recordId && r.studentId === studentId);
    if (!record) issues.push(`${section.title}: 이 학생에게 등록된 원본만 연결할 수 있습니다.`);
    else if (!(record.coverage ?? [{schoolYear:record.schoolYear}]).some(c => c.schoolYear === section.schoolYear)) issues.push(`${section.title}: 근거 원본의 학년도와 항목의 학년도가 다릅니다.`);
  }
  for (const item of profile.evaluationAnalysis.competencies) {
    if (item.scoreMethod && (item.score == null || item.score > item.scoreMethod.maximum)) issues.push(`${item.competency}: 점수와 출처 척도의 최댓값을 확인하세요.`);
    if (item.evidenceState === "documented" && !item.evidenceRefs.length) issues.push(`${item.competency}: 근거가 확인된 항목에는 연결 근거가 필요합니다.`);
  }
  return issues;
}

export function calculateCredits(courses: AcademicCourse[]) {
  const groups = new Map<string, { subjectGroup: string; completed: number; selected: number; planned: number; unknown: number; duplicates: number; conflicts: number }>();
  const seen = new Map<string, AcademicCourse[]>();
  for (const course of courses) {
    const key = `${course.schoolYear}:${course.gradeLevel}:${course.semester}:${course.subject.trim().replace(/\s+/g, "").normalize("NFKC")}`;
    seen.set(key, [...(seen.get(key) ?? []), course]);
  }
  for (const rows of seen.values()) {
    const c = rows[0], group = groups.get(c.subjectGroup) ?? { subjectGroup:c.subjectGroup, completed:0, selected:0, planned:0, unknown:0, duplicates:0, conflicts:0 };
    const conflict = rows.some(r => r.credits !== c.credits || r.selectionStatus !== c.selectionStatus || r.subjectGroup !== c.subjectGroup);
    if (conflict) group.conflicts++;
    else if (c.credits === null) group.unknown++;
    else group[c.selectionStatus] += c.credits;
    group.duplicates += rows.length - 1;
    groups.set(c.subjectGroup, group);
  }
  return [...groups.values()];
}

export function profileDifference(before: ProfileImport, after: ProfileImport) {
  const keyed = (p: ProfileImport) => new Map(p.sections.map(s => [s.id, s]));
  const old = keyed(before), next = keyed(after);
  return {
    added: [...next.values()].filter(s => !old.has(s.id)),
    removed: [...old.values()].filter(s => !next.has(s.id)),
    evidenceChanged: [...next.values()].filter(s => old.has(s.id) && JSON.stringify([s.evidence,s.recordId,s.page,s.sourceState]) !== JSON.stringify([old.get(s.id)!.evidence,old.get(s.id)!.recordId,old.get(s.id)!.page,old.get(s.id)!.sourceState])),
    wordingChanged: [...next.values()].filter(s => old.has(s.id) && s.summary !== old.get(s.id)!.summary && JSON.stringify(s.evidence) === JSON.stringify(old.get(s.id)!.evidence)),
    academicChanged: JSON.stringify(before.academicAnalysis.courses) !== JSON.stringify(after.academicAnalysis.courses),
    criteriaChanged: JSON.stringify(before.evaluationAnalysis.references) !== JSON.stringify(after.evaluationAnalysis.references),
  };
}
