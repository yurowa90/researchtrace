"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ReadinessReport } from "@/lib/operational-readiness";

const badges = { pass: { text: "확인됨", color: "bg-emerald-50 text-emerald-800" }, action: { text: "작업 필요", color: "bg-amber-50 text-amber-900" }, manual: { text: "직접 확인", color: "bg-slate-100 text-slate-700" } };
export function OperationalReadinessPanel() {
  const [report, setReport] = React.useState<ReadinessReport | null>(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const lock = React.useRef(false);
  const inspect = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setReport(null);
    try { const response = await fetch("/api/admin/readiness", { cache: "no-store" }); const value = await response.json() as ReadinessReport & { error?: string }; if (!response.ok) throw new Error(value.error || "점검하지 못했습니다."); setReport(value); }
    catch (e) { setError(e instanceof Error ? e.message : "점검하지 못했습니다."); }
    finally { lock.current = false; setBusy(false); }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `TRACE-connection-check-${report.checkedAt.slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return <Card className="mb-5 border-[#c5d5e7]"><CardContent className="space-y-4 p-5">
    <div><p className="mb-2 text-sm font-semibold text-[#2457d6]">학교 운영 시작</p><h2 className="text-xl font-bold">세 사이트 연결 점검</h2><p className="mt-2 text-sm leading-6 text-[#65768b]">현재 저장 위치·자료 연결·계정 준비 상태를 확인합니다. 실제 학생·교사 로그인과 백업 보관은 별도로 확인합니다.</p></div>
    <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void inspect()}>{busy ? "연결 상태 확인 중…" : "지금 연결 점검"}</Button>{report && <Button variant="outline" onClick={download}>점검 결과 받기</Button>}</div>
    {busy && <p role="status" className="text-sm">Google 저장소 응답을 기다리는 경우 잠시 걸릴 수 있습니다.</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {report && <div aria-live="polite" className="space-y-3">
      <p className="text-sm text-[#65768b]">{report.portal} 기준 · {new Date(report.checkedAt).toLocaleString("ko-KR")}에 점검</p>
      {report.checks.map(check => <section key={check.id} className="rounded-xl border border-[#dfe6ef] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{check.title}</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${badges[check.state].color}`}>{badges[check.state].text}</span></div><p className="mt-2 text-sm leading-6">{check.detail}</p><p className="mt-1 text-sm leading-6 text-[#65768b]">{check.next}</p></section>)}
      <div className="flex flex-wrap gap-2">{report.links.teacher && <Button asChild variant="outline"><a href={report.links.teacher} target="_blank" rel="noreferrer">교사 사이트 열기</a></Button>}{report.links.student && <Button asChild variant="outline"><a href={report.links.student} target="_blank" rel="noreferrer">학생 사이트 열기</a></Button>}</div>
      <p className="text-sm leading-6 text-[#65768b]">학생·교사 사이트 각각의 공통 저장소 설정과 공유 대상은 해당 사이트에서 확인합니다. 점검 결과 파일에는 학생 이름·이메일·원문·연결 키를 담지 않습니다.</p>
    </div>}
  </CardContent></Card>;
}
