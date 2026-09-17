"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Choice as SelectChoice } from "@/app/guidance-view";
import { EvidenceButton } from "@/app/evidence-panel";
import { academicChart, courseGradeValue, gradeMetrics, type GradeAverage, type GradeGrouping, type GradeMetric } from "@/lib/academic-chart";
import type { AcademicCourse, PortalData } from "@/lib/portal-types";

const colors = ["#2457b8", "#137c70", "#b45309", "#8551ad", "#ba3e62", "#466779"];
const dashes = [undefined, "7 3", "3 3", "10 3 2 3", "2 4", "9 4"];
const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

export function AcademicTrendChart({ data, studentId, snapshotId }: { data: PortalData; studentId: number; snapshotId: number }) {
  const own = data.academicCourses.filter(c => c.studentId === studentId && c.snapshotId === snapshotId && c.selectionStatus === "completed");
  const [metric, setMetric] = React.useState<GradeMetric>(() => own.some(c => courseGradeValue(c, "five") !== null) ? "five" : own.some(c => courseGradeValue(c, "nine") !== null) ? "nine" : "raw");
  const [grouping, setGrouping] = React.useState<GradeGrouping>("group");
  const [average, setAverage] = React.useState<GradeAverage>("simple");
  const [chosen, setChosen] = React.useState<string[] | null>(null);
  const [termKey, setTermKey] = React.useState("");
  const model = React.useMemo(() => academicChart(data.academicCourses, { studentId, snapshotId, metric, grouping, average }), [data.academicCourses, studentId, snapshotId, metric, grouping, average]);
  const visible = model.series.filter(s => (chosen ?? model.series.slice(0, 6).map(s => s.label)).includes(s.label));
  const term = model.terms.find(t => t.key === termKey) ?? model.terms.at(-1);
  const raw = metric === "raw", unit = raw ? "점" : "등급";
  const termPoints = model.points.filter(p => p.term.key === term?.key && visible.some(s => s.key === p.series.key));
  const courses = termPoints.flatMap(point => point.courses.map(course => ({ course, series: point.series.label })));
  const changeMetric = (value: string) => { setMetric(value as GradeMetric); setChosen(null); };

  return <div className="space-y-5">
    <section className="min-w-0 rounded-2xl border border-[#dfe6ef] bg-white p-4 sm:p-6" aria-label="학기별 성적 추이">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold tracking-wide text-[#557092]">학기별 비교</p><h2 className="mt-1 text-xl font-bold">교과의 흐름을 한눈에</h2></div>
        <p className="rounded-lg bg-[#edf3ff] px-3 py-2 text-sm text-[#254d86]">{raw ? "원점수 0–100점" : `${metric === "five" ? "5" : "9"}등급제 · 1등급이 위쪽`}</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Choice label="성적 지표" value={metric} onChange={changeMetric} items={Object.entries(gradeMetrics)} />
        <Choice label="선 묶음" value={grouping} onChange={value => { setGrouping(value as GradeGrouping); setChosen(null); }} items={[["group", "교과군별"], ["subject", "개별 과목별"]]} />
        <Choice label="평균 계산" value={average} onChange={value => setAverage(value as GradeAverage)} items={[["simple", "단순 평균"], ["credits", "학점 가중 평균"]]} />
      </div>
      {model.series.length > 0 && <fieldset className="mt-5"><legend className="mb-2 text-sm text-[#596d85]">표시할 {grouping === "group" ? "교과군" : "과목"} · 최대 6개</legend><div className="flex flex-wrap gap-2">
        {model.series.map((s, index) => {
          const checked = visible.some(v => v.key === s.key);
          return <label key={s.key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-[#bdd0eb] bg-[#f5f8fd]" : "text-[#65768b]"}`}>
            <Checkbox checked={checked} disabled={!checked && visible.length >= 6} onCheckedChange={value => setChosen(value ? [...visible.map(v => v.label), s.label] : visible.filter(v => v.key !== s.key).map(v => v.label))} />
            <svg width="20" height="6" aria-hidden="true"><line x1="0" y1="3" x2="20" y2="3" stroke={colors[index % colors.length]} strokeWidth="3" strokeDasharray={dashes[index % dashes.length]} /></svg>{s.label}
          </label>;
        })}
        <Button variant="ghost" size="sm" onClick={() => setChosen(visible.length ? [] : null)}>{visible.length ? "선택 해제" : "기본 선택"}</Button>
      </div></fieldset>}
      {model.includedCount && visible.length ? <>
        <div className="mt-6 h-[320px] min-w-0" role="img" aria-label={`${gradeMetrics[metric]}, ${average === "credits" ? "학점 가중" : "단순"} 평균 꺾은선 그래프. 정확한 값은 아래 성적 수치 표에서 확인할 수 있습니다.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 720, height: 320 }}>
            <LineChart data={model.rows} margin={{ top: 12, right: 18, left: -18, bottom: 5 }} accessibilityLayer>
              <CartesianGrid stroke="#e5ebf3" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5b6e88" }} tickMargin={12} axisLine={false} tickLine={false} minTickGap={15} />
              <YAxis domain={raw ? [0, 100] : [1, metric === "five" ? 5 : 9]} reversed={!raw} ticks={raw ? [0, 20, 40, 60, 80, 100] : metric === "five" ? [1, 2, 3, 4, 5] : [1, 3, 5, 7, 9]} tick={{ fontSize: 12, fill: "#5b6e88" }} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-xl border bg-white p-3 text-sm shadow-lg"><p className="mb-2 font-semibold">{String(label)}</p>{payload.map(p => <p key={String(p.dataKey)} className="py-1" style={{ color: p.color }}>{p.name} · {typeof p.value === "number" ? number(p.value) : "미확인"}{unit}</p>)}</div> : null} />
              {visible.map(s => { const index = model.series.indexOf(s); return <Line key={s.key} dataKey={s.key} name={s.label} type="linear" stroke={colors[index % colors.length]} strokeDasharray={dashes[index % dashes.length]} strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: "white" }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />; })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#65768b]">각 점은 해당 학기·{grouping === "group" ? "교과군" : "과목"}의 {average === "credits" ? "Σ(성적 × 학점) ÷ Σ학점" : "성적 합계 ÷ 과목 수"}입니다. 자료가 없는 학기는 선을 끊어 표시합니다.</p>
        <details className="mt-4 rounded-xl border"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">성적 수치 표 보기</summary><div className="overflow-x-auto border-t"><Table><caption className="sr-only">그래프에 표시한 {gradeMetrics[metric]} 평균. —는 자료 미확인입니다.</caption><TableHeader><TableRow><TableHead>학년도·학기</TableHead>{visible.map(s => <TableHead key={s.key}>{s.label} ({unit})</TableHead>)}</TableRow></TableHeader><TableBody>{model.rows.map(row => <TableRow key={String(row.termKey)}><TableCell>{row.label}</TableCell>{visible.map(s => <TableCell key={s.key}>{typeof row[s.key] === "number" ? number(row[s.key] as number) : "—"}</TableCell>)}</TableRow>)}</TableBody></Table></div></details>
      </> : <div className="my-6 rounded-xl border border-dashed p-8 text-base leading-7 text-[#65768b]">{model.includedCount ? "표시할 교과군이나 과목을 선택하세요." : "이 지표로 그릴 수 있는 이수 성적이 아직 없습니다. 원점수를 선택하거나, Work 결과에서 과목별 성적·등급제·학점을 확인하세요."}</div>}
      <div className="mt-4 border-t pt-4 text-sm leading-6 text-[#65768b]"><p>현재 지표로 계산 가능한 전체 과목 {model.includedCount}개 · 선택·계획 제외 {model.nonCompletedCount}건 · 동일 기록 중복 제거 {model.duplicates}건</p><p>{raw ? "원점수는 시험 난도와 수강 집단에 따라 의미가 달라집니다." : "5등급제와 9등급제는 환산하거나 한 평균에 섞지 않습니다."} 교과군 평균은 학기별 과목 구성이 다를 수 있습니다.</p></div>
      {model.excluded.length > 0 && <details className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><summary className="cursor-pointer font-semibold">계산에서 제외된 기록 {model.excluded.length}개 확인</summary><ul className="mt-3 space-y-2">{model.excluded.map(({ course: c, reason }) => <li key={c.id}>{c.schoolYear} {c.semester}학기 · {c.subject}: {reason}</li>)}</ul></details>}
    </section>
    {term && <section className="rounded-2xl border border-[#dfe6ef] bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">평균에 들어간 과목과 근거</h2><p className="mt-1 text-sm text-[#65768b]">선택한 선에 포함된 실제 과목을 확인합니다.</p></div><div className="w-full sm:w-52"><Choice label="확인할 학기" value={term.key} onChange={setTermKey} items={model.terms.map(t => [t.key, t.label])} /></div></div>
      {courses.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow>{["과목·교과군", "학년·학기", gradeMetrics[metric], "학점", "성취도", "근거"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{courses.map(({ course: c }) => <TableRow key={c.id}><TableCell><p className="font-semibold">{c.subject}</p><p className="text-xs text-[#65768b]">{c.subjectGroup}</p></TableCell><TableCell>{c.gradeLevel}학년 {c.semester}학기</TableCell><TableCell>{number(courseGradeValue(c, metric)!)}{unit}</TableCell><TableCell>{c.credits ?? "미확인"}</TableCell><TableCell>{c.achievement || "—"}</TableCell><TableCell><CourseEvidence course={c} data={data} /></TableCell></TableRow>)}</TableBody></Table></div> : <p className="rounded-xl bg-[#f5f8fc] p-4 text-sm text-[#65768b]">이 학기에서 선택한 조건으로 계산된 과목이 없습니다.</p>}
    </section>}
  </div>;
}

function CourseEvidence({ course: c, data }: { course: AcademicCourse; data: PortalData }) {
  return <><EvidenceButton data={data} studentId={c.studentId} snapshotId={c.snapshotId} refs={c.evidenceRefs ?? []} />{c.evidenceText && <details className="mt-2 max-w-72"><summary className="cursor-pointer text-sm">추출 문장</summary><p className="mt-2 whitespace-normal text-sm leading-6">{c.evidenceText}</p></details>}</>;
}

function Choice(props: React.ComponentProps<typeof SelectChoice>) {
  return <div className="space-y-2"><p className="text-sm font-medium">{props.label}</p><SelectChoice {...props} /></div>;
}
