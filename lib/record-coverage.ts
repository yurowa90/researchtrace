import type { RecordCoverage } from "@/lib/portal-types";
import type { ProfileImport } from "@/lib/profile-import";

type RecordLike = { recordGrade: number; schoolYear: number; coverage?: RecordCoverage[]; coverageJson?: string };

export function recordCoverage(record: RecordLike): RecordCoverage[] {
  let value: unknown = record.coverage;
  if (!value && record.coverageJson) { try { value = JSON.parse(record.coverageJson); } catch { value = null; } }
  if (Array.isArray(value) && value.length && value.every((item) => item && Number.isInteger(item.grade) && item.grade >= 1 && item.grade <= 3 && Number.isInteger(item.schoolYear))) return value;
  return [{ grade: record.recordGrade, schoolYear: record.schoolYear }];
}

export function validateRecordCoverage(input: unknown, currentGrade: number): RecordCoverage[] {
  if (!Array.isArray(input) || !input.length || input.length > currentGrade) throw new Error("파일에 실제로 포함된 학년을 선택하세요.");
  const grades = new Set<number>(), years = new Set<number>();
  const result = input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("학생부 학년·학년도를 확인하세요.");
    const grade = Number(item.grade), schoolYear = Number(item.schoolYear);
    if (!Number.isInteger(grade) || grade < 1 || grade > currentGrade) throw new Error(`현재 ${currentGrade}학년까지의 기록만 등록할 수 있습니다.`);
    if (!Number.isInteger(schoolYear) || schoolYear < 2022 || schoolYear > 2100) throw new Error("학생부 학년도를 확인하세요.");
    if (grades.has(grade) || years.has(schoolYear)) throw new Error("학년 또는 학년도가 중복됩니다.");
    grades.add(grade); years.add(schoolYear); return { grade, schoolYear };
  });
  return result.sort((a, b) => a.grade - b.grade);
}

export function profileCoverageIssues(profile: ProfileImport, currentGrade: number, records: RecordLike[], isExample = false): string[] {
  const required = currentGrade === 3 ? [1, 2] : [1];
  const issues: string[] = [];
  if (profile.sourceYears.length < required.length || profile.sourceYears.length > currentGrade) issues.push(`${currentGrade}학년은 ${required.length}~${currentGrade}개 학년도까지 분석할 수 있습니다. 현재 학년은 실제 기록이 있을 때 포함하세요.`);
  const covered = records.flatMap(recordCoverage);
  if (!isExample) {
    const missing = required.filter((grade) => !covered.some((item) => item.grade === grade));
    if (missing.length) issues.push(`${missing.join("·")}학년 학생부 원본을 먼저 등록하세요. 통합 파일은 포함된 학년을 모두 선택합니다.`);
    const unreflected = [...new Set(covered.filter((item) => item.grade <= currentGrade).map((item) => item.schoolYear))].filter((year) => !profile.sourceYears.includes(year));
    if (unreflected.length) issues.push(`보관된 ${unreflected.join("·")}학년도 기록을 sourceYears와 분석에 포함하세요.`);
  }
  if (profile.sections.some((section) => !profile.sourceYears.includes(section.schoolYear))) issues.push("학생부 근거 항목의 학년도가 sourceYears에 없습니다.");
  if (profile.academicAnalysis.courses.some((course) => course.selectionStatus === "completed" && (course.gradeLevel > currentGrade || !profile.sourceYears.includes(course.schoolYear)))) issues.push("이수한 교과의 학년·학년도가 분석 범위를 벗어납니다. 계획 과목은 이수 과목과 구분하세요.");
  return issues;
}
