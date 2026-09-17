import type { AcademicCourse } from "@/lib/portal-types";

export type GradeMetric = "raw" | "five" | "nine";
export type GradeGrouping = "group" | "subject";
export type GradeAverage = "simple" | "credits";
export const gradeMetrics: Record<GradeMetric, string> = { raw: "원점수", five: "석차등급 · 5등급제", nine: "석차등급 · 9등급제" };
export type ChartTerm = { key: string; label: string; schoolYear: number; semester: number };
export type ChartSeries = { key: string; label: string };
export type GradePoint = { term: ChartTerm; series: ChartSeries; value: number; courses: AcademicCourse[] };

// Parse a complete numeric field, never a number embedded in an explanation.
export function courseGradeValue(course: AcademicCourse, metric: GradeMetric): number | null {
  if (metric !== "raw" && course.gradingSystem !== metric) return null;
  const match = (metric === "raw" ? course.rawScore : course.rankGrade).trim().match(metric === "raw" ? /^(\d+(?:\.\d+)?)\s*(?:점)?$/ : /^(\d+)\s*(?:등급)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  const max = metric === "raw" ? 100 : metric === "five" ? 5 : 9;
  return Number.isFinite(value) && value >= (metric === "raw" ? 0 : 1) && value <= max ? value : null;
}

export function academicChart(courses: AcademicCourse[], options: { studentId: number; snapshotId: number; metric: GradeMetric; grouping: GradeGrouping; average: GradeAverage }) {
  const own = courses.filter(c => c.studentId === options.studentId && c.snapshotId === options.snapshotId);
  const completed = own.filter(c => c.selectionStatus === "completed");
  const excluded: { course: AcademicCourse; reason: string }[] = [];
  const terms: ChartTerm[] = [];
  const validTerms = completed.filter(c => Number.isInteger(c.schoolYear) && c.schoolYear >= 2022 && c.schoolYear <= 2100 && [1, 2].includes(c.semester));
  const indexes = validTerms.map(c => c.schoolYear * 2 + c.semester - 1);
  if (indexes.length) for (let index = Math.min(...indexes); index <= Math.max(...indexes); index++) {
    const schoolYear = Math.floor(index / 2), semester = index % 2 + 1;
    terms.push({ key: `${schoolYear}-${semester}`, label: `${schoolYear} · ${semester}학기`, schoolYear, semester });
  }
  const identities = new Map<string, AcademicCourse[]>();
  for (const c of own) {
    const key = `${c.schoolYear}:${c.gradeLevel}:${c.semester}:${c.subject.normalize("NFKC").replace(/\s+/g, "")}`;
    identities.set(key, [...(identities.get(key) ?? []), c]);
  }
  let duplicates = 0;
  const eligible: { course: AcademicCourse; value: number; label: string }[] = [];
  for (const rows of identities.values()) {
    if (!rows.some(c => c.selectionStatus === "completed")) continue;
    const c = rows.find(r => r.selectionStatus === "completed")!;
    const value = courseGradeValue(c, options.metric);
    const conflict = rows.some(r => r.selectionStatus !== c.selectionStatus || r.subjectGroup !== c.subjectGroup || r.gradingSystem !== c.gradingSystem || courseGradeValue(r, options.metric) !== value || (options.average === "credits" && r.credits !== c.credits));
    if (conflict) { excluded.push({ course: c, reason: "같은 학기·과목의 기록이 충돌함" }); continue; }
    duplicates += rows.length - 1;
    if (!validTerms.includes(c)) { excluded.push({ course: c, reason: "학년도·학기 확인 필요" }); continue; }
    if (value === null) { excluded.push({ course: c, reason: options.metric !== "raw" && c.gradingSystem !== options.metric ? "선택한 등급제에 해당하지 않거나 체계 미확인" : "숫자 성적 미확인 또는 범위 오류" }); continue; }
    if (options.average === "credits" && (c.credits === null || !Number.isFinite(c.credits) || c.credits <= 0)) { excluded.push({ course: c, reason: "학점 가중 평균에 필요한 양수 학점 미확인" }); continue; }
    eligible.push({ course: { ...c, evidenceRefs: [...new Set(rows.flatMap(r => r.evidenceRefs ?? []))] }, value, label: options.grouping === "group" ? c.subjectGroup || "교과군 미분류" : c.subject || "과목 미분류" });
  }
  const series = [...new Set(eligible.map(e => e.label))].sort((a, b) => a.localeCompare(b, "ko")).map((label, index) => ({ key: `series${index}`, label }));
  const points: GradePoint[] = [];
  const rows = terms.map(term => {
    const row: Record<string, string | number | null> = { termKey: term.key, label: term.label };
    for (const s of series) {
      const values = eligible.filter(e => e.label === s.label && e.course.schoolYear === term.schoolYear && e.course.semester === term.semester);
      const weight = (e: typeof eligible[number]) => options.average === "credits" ? e.course.credits! : 1;
      const denominator = values.reduce((n, e) => n + weight(e), 0);
      const value = denominator ? Math.round(values.reduce((n, e) => n + e.value * weight(e), 0) / denominator * 100) / 100 : null;
      row[s.key] = value;
      if (value !== null) points.push({ term, series: s, value, courses: values.map(e => e.course) });
    }
    return row;
  });
  return { terms, series, rows, points, excluded, duplicates, includedCount: eligible.length, nonCompletedCount: own.length - completed.length };
}
