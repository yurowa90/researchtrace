import type { ProfileSection } from "@/lib/portal-types";

export const activityAreas: Record<string, string> = { creative_activity: "창체활동", subject_detail: "교과 세특", course_selection: "교과 선택", reading: "독서", career: "진로", other: "기타" };
export type ActivityGrouping = "area" | "year" | "subject";
export function activityReview(sections: ProfileSection[], options: { studentId: number; snapshotId: number; grouping: ActivityGrouping; year: string; area: string; state: string; query: string }) {
  const own = sections.filter(s => s.studentId === options.studentId && s.snapshotId === options.snapshotId);
  const words = options.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = own.filter(s => (options.year === "all" || String(s.schoolYear) === options.year) && (options.area === "all" || s.sectionType === options.area) && (options.state === "all" || (s.sourceState ?? "unknown") === options.state) && words.every(word => [s.title, s.summary, s.subject, ...s.keywords, ...s.evidence, ...s.competencies].join(" ").toLocaleLowerCase().includes(word)));
  const grouped = new Map<string, ProfileSection[]>();
  for (const section of filtered) {
    const label = options.grouping === "year" ? `${section.schoolYear}학년도` : options.grouping === "subject" ? section.subject || "교과 미지정 활동" : activityAreas[section.sectionType] || "기타";
    grouped.set(label, [...(grouped.get(label) ?? []), section]);
  }
  const order = Object.values(activityAreas);
  const groups = [...grouped].sort(([a], [b]) => options.grouping === "area" ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b, "ko")).map(([label, items]) => ({ label, items: items.sort((a, b) => a.schoolYear - b.schoolYear || a.sortOrder - b.sortOrder || a.id - b.id) }));
  return { own, filtered, groups, years: [...new Set(own.map(s => s.schoolYear))].sort((a, b) => a - b), areas: [...new Set(own.map(s => s.sectionType))] };
}
