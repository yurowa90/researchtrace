"use client";

import * as React from "react";
import { ArrowRight, ListFilter, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Choice as SelectChoice } from "@/app/guidance-view";
import { SourceCard } from "@/app/evidence-panel";
import { activityAreas, activityReview, type ActivityGrouping } from "@/lib/activity-review";
import { sourceStates } from "@/lib/guidance";
import type { PortalData, Student, ViewId } from "@/lib/portal-types";

type Props = { data: PortalData; students: Student[]; selectedStudentId: number | null; onSelect: (id: number) => void; onNavigate: (view: ViewId) => void };

export function ActivityReviewView(p: Props) {
  const student = p.students.find(s => s.id === p.selectedStudentId) ?? p.students[0];
  const profile = p.data.profileSnapshots.find(s => s.studentId === student?.id && s.isActive);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">활동 모아보기</h1><p className="mt-3 max-w-3xl text-base leading-7 text-[#65768b]">창체·세특·독서·진로를 묶어 읽고, 여러 학년도에 걸쳐 이어지는 관심과 근거를 확인합니다.</p></div>{student && p.students.length>1 && <div className="w-full sm:w-64"><Choice label="학생 선택" value={String(student.id)} onChange={v => p.onSelect(Number(v))} items={p.students.map(s => [String(s.id), `${s.name} · ${s.studentNumber}`])} /></div>}</div>
    {profile && student ? <ActivityReader key={`${student.id}:${profile.id}`} data={p.data} studentId={student.id} snapshotId={profile.id} versionLabel={profile.versionLabel} onNavigate={p.onNavigate} /> : <p className="rounded-2xl border border-dashed bg-white p-8 text-base leading-7 text-[#65768b]">활동 분석이 아직 없습니다. 담당 선생님이 학생부 영역별 분석 결과를 반영하면 이곳에서 모아 볼 수 있습니다.</p>}
  </div>;
}

function ActivityReader({ data, studentId, snapshotId, versionLabel, onNavigate }: { data: PortalData; studentId: number; snapshotId: number; versionLabel: string; onNavigate: Props["onNavigate"] }) {
  const [grouping, setGrouping] = React.useState<ActivityGrouping>("area");
  const [year, setYear] = React.useState("all"), [area, setArea] = React.useState("all"), [state, setState] = React.useState("all"), [query, setQuery] = React.useState("");
  const [sectionId, setSectionId] = React.useState<number | null>(null);
  const result = React.useMemo(() => activityReview(data.profileSections, { studentId, snapshotId, grouping, year, area, state, query }), [data.profileSections, studentId, snapshotId, grouping, year, area, state, query]);
  const selected = result.filtered.find(s => s.id === sectionId) ?? result.groups[0]?.items[0];
  const reset = () => { setYear("all"); setArea("all"); setState("all"); setQuery(""); setSectionId(null); };
  const nodes = selected?.sectionKey ? data.ontologyNodes.filter(n => n.studentId === studentId && n.snapshotId === snapshotId && n.evidenceRefs.includes(selected.sectionKey!)) : [];
  const related = selected ? result.own.filter(s => s.id !== selected.id && s.keywords.some(k => selected.keywords.includes(k))).slice(0, 6) : [];
  return <>
    <section className="rounded-2xl border border-[#dfe6ef] bg-white p-4 sm:p-5" aria-label="활동 검색과 필터">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#65768b]">활성 분석 · {versionLabel} · {result.own.length}개 항목</p><Button variant="ghost" size="sm" onClick={reset}>검색·필터 초기화</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <label className="block text-sm font-medium">내용·키워드 검색<div className="relative mt-2"><Search className="absolute left-3 top-3 size-4 text-[#78889d]" /><Input className="pl-9" value={query} onChange={e => setQuery(e.target.value)} placeholder="예: 생명 윤리, 실험, 협력" /></div></label>
        <Choice label="활동 학년도" value={year} onChange={setYear} items={[["all", "모든 학년도"], ...result.years.map(y => [String(y), `${y}학년도`] as [string, string])]} />
        <Choice label="학생부 영역" value={area} onChange={setArea} items={[["all", "모든 영역"], ...result.areas.map(a => [a, activityAreas[a] || "기타"] as [string, string])]} />
        <Choice label="자료의 상태" value={state} onChange={setState} items={[["all", "모든 근거 상태"], ...Object.entries(sourceStates)]} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4"><ListFilter className="mr-1 size-4 text-[#65768b]" aria-hidden="true" />{([["area", "영역별"], ["year", "학년도별"], ["subject", "교과별"]] as const).map(([value, label]) => <Button key={value} size="sm" variant={grouping === value ? "default" : "outline"} aria-pressed={grouping === value} onClick={() => setGrouping(value)}>{label} 묶기</Button>)}<p className="ml-auto text-sm text-[#65768b]" role="status">{result.filtered.length}개 항목 · {result.groups.length}개 묶음</p></div>
    </section>
    {!selected ? <div className="rounded-2xl border border-dashed bg-white p-8"><p className="text-base leading-7 text-[#65768b]">이 조건에 해당하는 분석 항목이 없습니다. 현재 분석에 자료가 없다는 뜻이며, 실제 활동 여부를 확정하지 않습니다.</p><Button className="mt-4" variant="outline" onClick={reset}>전체 항목 보기</Button></div> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(290px,.8fr)_minmax(0,1.2fr)]">
      <section className="min-w-0 rounded-2xl border border-[#dfe6ef] bg-white" aria-label="묶음별 활동 목록">
        <div className="border-b p-4"><h2 className="font-bold">활동 목록</h2><p className="mt-1 text-sm text-[#65768b]">항목을 누르면 근거와 연결된 개념을 읽을 수 있습니다.</p></div>
        <div className="max-h-[480px] overflow-y-auto p-3 xl:max-h-[760px]">{result.groups.map(group => <section key={group.label} className="mb-4 last:mb-0"><h3 className="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-[#edf2f9] px-3 py-2 text-sm font-semibold">{group.label}<span className="text-xs font-normal text-[#65768b]">{group.items.length}개</span></h3><div className="mt-2 space-y-2">{group.items.map(s => <button key={s.id} type="button" aria-pressed={selected.id === s.id} aria-controls="activity-reading-panel" onClick={() => setSectionId(s.id)} className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-[#2457b8] ${selected.id === s.id ? "border-[#819fce] bg-[#edf4ff]" : "border-transparent bg-[#f8fafc] hover:border-[#d0dbeb]"}`}><div className="mb-2 flex flex-wrap gap-2 text-xs text-[#5c7190]"><span>{s.schoolYear}학년도</span><span>{s.subject || activityAreas[s.sectionType] || "활동"}</span><span>{sourceStates[s.sourceState ?? "unknown"]}</span></div><h4 className="font-semibold leading-6">{s.title}</h4><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#65768b]">{s.summary}</p>{s.keywords.length > 0 && <p className="mt-2 truncate text-xs text-[#466da4]">{s.keywords.slice(0, 4).map(k => `#${k}`).join("  ")}</p>}</button>)}</div></section>)}</div>
      </section>
      <article id="activity-reading-panel" className="min-w-0 space-y-4" aria-label="선택한 활동 상세" aria-live="polite">
        <div className="rounded-2xl border border-[#dfe6ef] bg-white p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">기록과 근거 함께 읽기</h2><Badge variant="outline">{activityAreas[selected.sectionType] || "기타"}</Badge></div><SourceCard section={selected} data={data} />
          {(selected.keywords.length > 0 || selected.competencies.length > 0) && <div className="mt-4 space-y-3">{selected.keywords.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">분석된 키워드 · 누르면 전체 활동에서 검색</h3><div className="flex flex-wrap gap-2">{selected.keywords.map(k => <Button key={k} size="sm" variant="outline" onClick={() => { reset(); setQuery(k); }}>#{k}</Button>)}</div></div>}{selected.competencies.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">연결된 역량 해석</h3><div className="flex flex-wrap gap-2">{selected.competencies.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}</div></div>}</div>}
        </div>
        {nodes.length > 0 && <section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">이 근거를 사용하는 개념·질문</h3><div className="mt-3 space-y-3">{nodes.slice(0, 8).map(n => <div key={n.id} className="border-l-2 border-[#80bcad] pl-3"><p className="text-sm font-semibold">{n.label}</p><p className="mt-1 text-sm leading-6 text-[#65768b]">{n.description}</p></div>)}</div><Button variant="ghost" size="sm" className="mt-3" onClick={() => onNavigate("fingerprint")}>연구지문에서 연결 보기<ArrowRight /></Button></section>}
        {related.length > 0 && <section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">같은 키워드가 있는 활동</h3><p className="mt-1 text-sm leading-6 text-[#65768b]">분석에 붙은 키워드를 기준으로 연결합니다.</p><div className="mt-3 space-y-2">{related.map(s => <Button key={s.id} variant="outline" className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => { reset(); setSectionId(s.id); }}><span><span className="text-xs text-[#65768b]">{s.schoolYear} · {s.subject || activityAreas[s.sectionType]}</span><span className="mt-1 block">{s.title}</span></span><ArrowRight className="ml-auto shrink-0" /></Button>)}</div></section>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onNavigate("guidance")}>{data.viewer.role === "student" ? "질문·정정 요청 남기기" : "관찰·검토 기록 남기기"}<ArrowRight /></Button><Button variant="ghost" onClick={() => onNavigate("evaluation")}>역량 점검 보기</Button></div>
      </article>
    </div>}
  </>;
}

function Choice(props: React.ComponentProps<typeof SelectChoice>) {
  return <div className="space-y-2"><p className="text-sm font-medium">{props.label}</p><SelectChoice {...props} /></div>;
}
