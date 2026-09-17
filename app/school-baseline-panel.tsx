"use client";
import * as React from "react";
import { ClipboardCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { schoolDataContract, phaseOneInventory } from "@/lib/school-contract";
import { schoolPermissionMatrix } from "@/lib/school-permissions";
import type { auditSchoolData } from "@/lib/school-audit";

type Report = { capturedAt: string; storage: "legacy" | "google"; revision: number | null; audit: ReturnType<typeof auditSchoolData> };
const tableLabels: Record<string, string> = { schoolIdentities:"사이트 계정 연결", identityEvents:"계정 연결 이력", users:"계정", classes:"학급", students:"학생", subjects:"과목", activities:"활동", fingerprints:"활동 연구지문", activityFiles:"활동 원본", inquiryThreads:"탐구 흐름", threadActivities:"탐구 활동 연결", studentRecords:"학생부 원본", profileSnapshots:"분석 버전", profileSections:"분석 근거 항목", researchKeywords:"연구 키워드", ontologyNodes:"온톨로지 항목", ontologyEdges:"온톨로지 연결", wikiPages:"위키", academicCourseRecords:"교과 성적", academicTrends:"성적 변화", creditSummaries:"학점 요약", evaluationReferences:"적용 평가 자료", competencyEvaluations:"역량 점검", referenceMaterials:"공용 평가 자료", referenceSelections:"Work 자료 선택", guidanceEntries:"지도 이력" };

export function SchoolBaselinePanel() {
  const [report, setReport] = React.useState<Report | null>(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const lock = React.useRef(false);
  const inspect = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setReport(null);
    try {
      const response = await fetch("/api/school-baseline", { cache: "no-store" });
      const body = await response.json() as Report & {error?:string};
      if (!response.ok) throw new Error(body.error || "자료를 점검하지 못했습니다.");
      setReport(body);
    } catch (e) { setError(e instanceof Error ? e.message : "자료를 점검하지 못했습니다."); }
    finally { lock.current = false; setBusy(false); }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)], {type:"application/json"}));
    const a = document.createElement("a"); a.href=url; a.download=`TRACE-data-audit-${report.capturedAt.slice(0,10)}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60_000);
  };
  return <Card className="mb-5 border-[#c5d5e7]"><CardContent className="space-y-5 p-5">
    <div><p className="mb-1 text-sm font-semibold text-[#2457d6]">사이트 분리 준비 · 1단계</p><h2 className="text-xl font-bold">자료·권한 점검</h2><p className="mt-2 text-base leading-7 text-[#65768b]">학생·학급·분석 자료가 올바르게 연결되어 있는지 확인합니다. 점검은 기존 자료를 수정하지 않습니다.</p></div>
    <div className="flex flex-wrap gap-3"><Button onClick={()=>void inspect()} disabled={busy}><ClipboardCheck />{busy?"자료 연결 확인 중…":"자료 연결 점검하기"}</Button>{report&&<Button variant="outline" onClick={download}><Download />점검 결과 저장</Button>}</div>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {report&&<section aria-label="자료 점검 결과" className="space-y-4">
      <div role="status" className={`rounded-xl border p-4 ${report.audit.errorCount?"border-rose-200 bg-rose-50":"border-emerald-200 bg-emerald-50"}`}><p className="font-semibold">점검 완료 · 연결 오류 {report.audit.errorCount}건 · 확인 사항 {report.audit.warningCount}건</p><p className="mt-1 text-sm">{new Date(report.capturedAt).toLocaleString("ko-KR")} 기준 · {report.storage==="google"?"구글 Drive·Sheets 사용 중":"기존 사이트 저장소 사용 중 · 구글 이전 전"}</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["실제 학생",report.audit.counts.realStudents],["예시 학생",report.audit.counts.exampleStudents],["등록 원본",report.audit.counts.originalFiles],["분석 버전",report.audit.counts.profileVersions]].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-sm text-[#65768b]">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
      <p className="text-sm leading-6 text-[#65768b]">{report.audit.limits} 점검 결과 저장 파일은 자료 백업이 아닙니다.</p>
      {report.audit.issues.length>0&&<div className="max-h-80 overflow-auto rounded-xl border"><table className="w-full min-w-[560px] text-left text-sm"><caption className="p-3 text-left font-semibold">확인이 필요한 자료</caption><thead className="bg-slate-50"><tr><th className="p-3">구분</th><th className="p-3">자료</th><th className="p-3">내용</th></tr></thead><tbody>{report.audit.issues.map((issue,i)=><tr key={i} className="border-t"><td className="whitespace-nowrap p-3">{issue.severity==="error"?"연결 오류":"확인 사항"}</td><td className="p-3">{tableLabels[issue.table]??issue.table} #{issue.row}</td><td className="p-3 leading-6">{issue.message}</td></tr>)}</tbody></table></div>}
      {report.audit.omittedIssueCount>0&&<p className="text-sm text-amber-800">앞의 200건을 표시했습니다. {report.audit.omittedIssueCount}건은 생략되었습니다. 표시된 오류를 확인한 뒤 다시 점검하세요.</p>}
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">자료별 기록 수 확인</summary><dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">{Object.entries(report.audit.tableCounts).map(([key,count])=><div key={key} className="flex justify-between gap-4 text-sm"><dt>{tableLabels[key]??key}</dt><dd>{count}건</dd></div>)}</dl></details>
    </section>}
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">학생·담임·관리자 권한표</summary><p className="mt-3 text-sm leading-6 text-[#65768b]">승인된 계정에 적용합니다. 교사 전용 메모는 학생에게 공개하지 않으며, 담당 학급은 현재 배정을 기준으로 확인합니다.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50"><tr>{["기능","학생","담임","관리자"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{schoolPermissionMatrix.map(r=><tr key={r.feature} className="border-t"><th scope="row" className="p-3 font-medium">{r.feature}</th><td className="p-3">{r.student}</td><td className="p-3">{r.teacher}</td><td className="p-3">{r.admin}</td></tr>)}</tbody></table></div></details>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">공통 데이터 기준</summary><dl className="mt-4 space-y-4">{schoolDataContract.map(r=><div key={r.entity}><dt className="font-semibold">{r.entity}</dt><dd className="mt-1 text-sm leading-6 text-[#65768b]">{r.rule}</dd></div>)}</dl></details>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">기존 기능과 후속 작업</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">영역</th><th className="p-3">현재 기능</th><th className="p-3">후속 작업</th></tr></thead><tbody>{phaseOneInventory.map(r=><tr key={r.feature} className="border-t"><th scope="row" className="p-3 font-medium">{r.feature}</th><td className="p-3 leading-6">{r.current}</td><td className="p-3 leading-6">{r.next}</td></tr>)}</tbody></table></div></details>
  </CardContent></Card>;
}
