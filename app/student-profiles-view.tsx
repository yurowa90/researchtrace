"use client";

import * as React from "react";
import { ArrowRight, FileJson, FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PortalData, Student, ViewId } from "@/lib/portal-types";
import { studentReadiness } from "@/lib/portal-workflow";

export function StudentProfiles({ data, students, query, staff, onOpen, onClearQuery }: {
  data: PortalData; students: Student[]; query: string; staff: boolean; onOpen: (id: number, view?: ViewId) => void; onClearQuery: () => void;
}) {
  const [filter, setFilter] = React.useState("all");
  const normalized = query.trim().toLowerCase();
  const filtered = students.filter((student) => {
    const status = studentReadiness(data, student);
    const keywords = data.researchKeywords.filter((item) => item.studentId === student.id).map((item) => item.keyword).join(" ");
    const matches = `${student.name} ${student.studentNumber} ${status.classroom?.name ?? ""} ${status.profile?.oneLineProfile ?? ""} ${keywords}`.toLowerCase().includes(normalized);
    const active = student.status === "active";
    return matches && (filter === "all" || (filter === "records" && active && status.missingGrades.length > 0) || (filter === "analysis" && active && !status.missingGrades.length && !status.profile) || (filter === "ready" && !!status.profile) || (filter === "graduated" && student.status === "graduated"));
  });
  return <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">학생별 누적 프로필</h1><p className="mt-3 text-base text-[#65768b]">필요한 작업만 골라 보고 해당 학생의 다음 단계로 이동합니다.</p></div><Select value={filter} onValueChange={(value) => value && setFilter(value)}><SelectTrigger aria-label="학생 진행 상태 필터" className="w-full bg-white sm:w-60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="records">원본 미등록·부족</SelectItem><SelectItem value="analysis">Work 분석 대기</SelectItem><SelectItem value="ready">프로필 반영 완료</SelectItem><SelectItem value="graduated">졸업생</SelectItem></SelectContent></Select></div>
    <div className="flex flex-wrap items-center gap-3 text-sm text-[#62748b]"><Search className="size-4" /><span>{query ? `‘${query}’ · ` : ""}{filtered.length}명 표시 / {students.length}명</span>{(query || filter !== "all") && <Button size="sm" variant="ghost" onClick={() => { setFilter("all"); onClearQuery(); }}>검색·필터 초기화</Button>}</div>
    {filtered.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((student) => {
      const { classroom, missingGrades, profile } = studentReadiness(data, student);
      const keywords = data.researchKeywords.filter((item) => item.studentId === student.id).slice(0, 5);
      return <article key={student.id} className="flex flex-col rounded-2xl border border-[#dfe6ef] bg-white p-5 shadow-[0_6px_24px_rgba(29,55,90,.04)]"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-bold">{student.name}</h2><p className="mt-1 text-sm text-[#65768b]">{student.studentNumber} · {classroom?.name}</p></div><div className="flex gap-1">{student.isExample && <Badge variant="outline">예시</Badge>}<Badge variant="outline">{student.status === "graduated" ? `${student.graduatedYear ?? ""} 졸업` : student.status === "archived" ? "보관" : "재학"}</Badge></div></div>
        <p className="mt-4 min-h-12 text-base leading-7 text-[#2f4e77]">{profile?.oneLineProfile ?? "아직 반영된 분석 결과가 없습니다."}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{keywords.map((item) => <Badge key={item.id} variant="secondary">{item.keyword}</Badge>)}</div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm"><span className={`rounded-lg px-2 py-1 ${missingGrades.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{missingGrades.length ? `${missingGrades.join("·")}학년 원본 필요` : "원본 준비"}</span><span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-900">{data.profileSnapshots.filter((item) => item.studentId === student.id).length}개 버전</span></div>
        <div className="mt-auto flex flex-wrap gap-2 border-t border-[#edf0f4] pt-4"><Button variant="outline" className="mt-4" onClick={() => onOpen(student.id)}>{profile ? "프로필 열기" : "연구지문"}<ArrowRight /></Button>{staff && <Button className="mt-4 bg-[#173a73]" onClick={() => onOpen(student.id, missingGrades.length ? "records" : "import")}>{missingGrades.length ? <FileText /> : <FileJson />}{missingGrades.length ? "원본 등록" : "Work 결과"}</Button>}</div>
      </article>;
    })}</div> : <div className="rounded-2xl border border-dashed border-[#cbd7e6] bg-white p-8 text-center"><h2 className="font-bold">표시할 학생이 없습니다.</h2><p className="mt-3 text-base leading-7 text-[#65768b]">검색어·진행 상태·학급 범위를 확인하세요. 신규 사용자는 학교 설정에서 학생을 등록합니다. 예시 자료는 상단 ‘예시 학생 표시’로 확인할 수 있습니다.</p></div>}
  </div>;
}
