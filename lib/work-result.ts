import { profileImportSchema, type ProfileImport } from "@/lib/profile-import";
import type { Classroom, Student, StudentRecord, ReferenceMaterial } from "@/lib/portal-types";
import { recordCoverage } from "@/lib/record-coverage";
import { referenceContextText } from "@/lib/reference-materials";

export function profileReferenceIssues(profile: ProfileImport): string[] {
  const issues: string[] = [];
  const sections = new Set<string>();
  for (const item of profile.sections) {
    if (sections.has(item.id)) issues.push(`근거 항목 ID가 중복됩니다: ${item.id}`);
    sections.add(item.id);
  }
  const evidence = (refs: string[], label: string) => {
    const missing = refs.filter((id) => !sections.has(id));
    if (missing.length) issues.push(`${label}: 연결한 학생부 근거를 찾을 수 없습니다 (${missing.join(", ")}).`);
  };
  profile.researchFingerprint.forEach((item) => evidence(item.evidenceRefs, item.keyword));
  profile.ontology.nodes.forEach((item) => evidence(item.evidenceRefs, item.label));
  profile.academicAnalysis.trends.forEach((item) => evidence(item.evidenceRefs, item.subjectGroup));
  profile.academicAnalysis.creditSummary.forEach((item) => evidence(item.evidenceRefs, item.subjectGroup));
  const nodes = new Set<string>();
  for (const item of profile.ontology.nodes) {
    if (nodes.has(item.id)) issues.push(`온톨로지 노드 ID가 중복됩니다: ${item.id}`);
    nodes.add(item.id);
  }
  profile.ontology.edges.forEach((item) => { if (!nodes.has(item.source) || !nodes.has(item.target)) issues.push(`온톨로지 연결 노드를 찾을 수 없습니다: ${item.source} → ${item.target}`); });
  const slugs = new Set<string>();
  profile.wikiPages.forEach((item) => {
    if (slugs.has(item.slug)) issues.push(`위키 주소가 중복됩니다: ${item.slug}`);
    slugs.add(item.slug);
    if (item.linkedNodeIds.some((id) => !nodes.has(id))) issues.push(`${item.title}: 위키에 연결한 노드를 찾을 수 없습니다.`);
  });
  const sourceIds = new Set<string>();
  profile.evaluationAnalysis.references.forEach((item) => {
    if (sourceIds.has(item.id)) issues.push(`평가 기준 ID가 중복됩니다: ${item.id}`);
    sourceIds.add(item.id);
  });
  profile.evaluationAnalysis.competencies.forEach((item) => {
    if (!sourceIds.has(item.sourceId)) issues.push(`${item.competency}: 연결한 평가 기준이 없습니다.`);
    evidence(item.evidenceRefs, item.competency);
  });
  if (new Set(profile.sourceYears).size !== profile.sourceYears.length) issues.push("분석 대상 학년도가 중복됩니다.");
  return issues;
}

export function readWorkResult(text: string): { profile: ProfileImport | null; issues: string[] } {
  let input: unknown;
  try {
    const clean = text.trim().replace(/^\uFEFF/, "");
    const fence = clean.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    input = JSON.parse(fence ? fence[1] : clean);
  } catch { return { profile: null, issues: ["JSON을 읽지 못했습니다. Work에서 받은 JSON 전체만 붙여넣거나 .json 파일을 선택하세요."] }; }
  const result = profileImportSchema.safeParse(input);
  if (!result.success) return {
    profile: null,
    issues: result.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "결과 전체"}: ${issue.code === "invalid_type" ? "필수 항목 또는 값의 자료형을 확인하세요." : issue.code === "invalid_enum_value" ? "허용된 선택값인지 확인하세요." : "값의 범위·길이·형식을 JSON 예시와 대조하세요."}`),
  };
  const issues = profileReferenceIssues(result.data);
  return { profile: issues.length ? null : result.data, issues };
}

export function workRequestText(student: Student, classroom: Classroom | undefined, records: StudentRecord[] = [], materials: ReferenceMaterial[] = []) {
  const grades = classroom?.grade === 3 ? "1·2학년" : "1학년";
  const currentGrade = classroom?.grade ?? 2;
  const registered = records.filter((row) => row.studentId === student.id).map((row) => `${row.originalName}: ${recordCoverage(row).map((item) => `${item.grade}학년(${item.schoolYear}학년도)`).join(", ")}`).join("\n");
  return `첨부한 학생부와 평가 자료를 분석하여 TRACE 사이트에 가져올 JSON 파일을 작성해 주세요.

대상 학생: 학번 ${student.studentNumber}, 이름 ${student.name}
학급: ${classroom?.name ?? "미지정"} / 현재 ${classroom?.grade ?? 2}학년
기본 원본: ${grades} 학생부. 원본에 현재 ${currentGrade}학년의 기록이 있으면 해당 부분까지 모두 추가 분석하세요. 한 파일에 여러 학년이 포함될 수 있습니다. 실제 존재하는 기록의 학년도를 sourceYears에 중복 없이 기록하고, 아직 없는 학기·학년의 내용을 만들지 마세요. 현재 학년의 일부 기록은 진행 중인 기록으로 구분하세요.
등록된 원본 범위(내용은 실제 파일에서 확인):
${registered || "등록 목록 없음. 제공받은 실제 원본을 확인하세요."}

이번 학생의 자료: 학생부 원본과 trace-work-result-example.json. 동일 Work 공간에서 이미 접근 가능한 형식 예시와 공용 자료는 재첨부하지 않아도 됩니다.
사이트의 업로드 목록만으로 원문을 읽었다고 간주하지 마세요. 실제 접근 가능한 파일만 근거로 사용하세요.
${referenceContextText(materials)}

작성 원칙:
1. 첨부한 JSON 예시의 키·자료형·선택값을 따르되 예시 학생의 내용을 복사하지 마세요. schemaVersion은 "1.1"입니다.
2. studentReference를 {"studentNumber": ${JSON.stringify(student.studentNumber)}, "name": ${JSON.stringify(student.name)}}로 포함하세요. versionLabel은 이전 버전과 다른 이름으로 만드세요.
3. 창체·세특·교과선택 등 학생부 근거를 sections에 구분하고, 고유 ID로 키워드·온톨로지·위키를 연결하세요. 실제 기록과 해석을 분리하고 근거가 없는 활동·성적·역량은 만들지 마세요.
4. 과목별 성적, 학기별 변화, 과목군별 이수·선택·계획 학점을 분리하세요. 성취도와 석차등급 등 서로 다른 척도를 임의로 합치지 마세요.
5. 평가 자료가 있으면 대학·전형·학년도를 구분해 역량 근거와 보완점을 작성하세요. 자료가 없으면 evaluationAnalysis의 references와 competencies를 빈 배열로 두세요. 분석 보조점수를 공식 점수나 합격 확률로 표현하지 마세요.
6. 연결 ID와 중복을 검증하고, 미확인 정보는 불확실성을 명시하세요. 필수 문자열은 자료 부족 상태를 설명하고 선택적 목록은 빈 배열을 사용하세요.
7. 최종 결과를 UTF-8 .json 파일로 제공하세요. 파일이 불가능하면 JSON만 담긴 코드 블록 하나로 제공하세요.`;
}
