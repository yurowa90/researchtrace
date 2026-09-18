import type { PortalData } from "@/lib/portal-types";
import { studentReadiness } from "@/lib/portal-workflow";

export type AdminSection = "overview" | "students" | "classes" | "accounts" | "references" | "storage" | "guide";
export const adminSections: { id: AdminSection; label: string }[] = [
  { id: "overview", label: "학교 운영 현황" }, { id: "students", label: "학생 관리" },
  { id: "classes", label: "학급·담임 배정" }, { id: "accounts", label: "계정·접근 관리" },
  { id: "references", label: "공용 평가 자료" }, { id: "storage", label: "저장소·백업" },
  { id: "guide", label: "관리자 사용 안내" },
];
export function adminOverview(data: PortalData) {
  const real = data.students.filter(s => !s.isExample);
  const active = real.filter(s => s.status === "active");
  const readiness = active.map(student => ({ student, ...studentReadiness(data, student) }));
  return {
    active: active.length, graduated: real.filter(s => s.status === "graduated").length,
    archived: real.filter(s => s.status === "archived").length,
    missingRecords: readiness.filter(r => r.missingGrades.length > 0).map(r => r.student.id),
    missingProfiles: readiness.filter(r => !r.profile).map(r => r.student.id),
    unlinked: active.filter(s => !s.userId).map(s => s.id),
    ready: readiness.filter(r => !r.missingGrades.length && r.profile).length,
  };
}
export function studentWorkspaceUrl(studentId?: number, view = "fingerprint") {
  const query = new URLSearchParams({ view });
  if (studentId !== undefined) query.set("student", String(studentId));
  return `/workspace?${query}`;
}
