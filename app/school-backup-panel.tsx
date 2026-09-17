"use client";
import * as React from "react";
import { Download, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { verifySchoolBackup } from "@/lib/verify-school-backup";

export function SchoolBackupPanel() {
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof verifySchoolBackup>> | null>(null);
  const lock = React.useRef(false);
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setResult(null);
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "백업을 확인하지 못했습니다."); }
    finally { lock.current = false; setBusy(false); }
  };
  const download = () => run(async () => {
    const response = await fetch("/api/school-backup", { cache: "no-store" });
    if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error || "백업을 만들지 못했습니다."); }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const verified = await verifySchoolBackup(bytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    const a = document.createElement("a"); a.href = url; a.download = `TRACE-school-backup-${verified.capturedAt.replace(/[^0-9TZ-]/g, "-")}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000); setResult(verified);
  });
  return <Card className="mb-5 border-[#c5d5e7]"><CardContent className="space-y-4 p-5">
    <div><h2 className="text-xl font-bold">원본 포함 전체 백업</h2><p className="mt-2 text-base leading-7 text-[#65768b]">학생·학급·성적·분석 버전·지도 기록과 등록된 원본 파일을 함께 보관합니다. 기존 저장소와 구글 저장소에서 모두 사용할 수 있습니다.</p></div>
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void download()}><Download />{busy ? "백업 처리·검증 중…" : "전체 백업 받기"}</Button><label className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium ${busy ? "pointer-events-none opacity-50" : "hover:bg-slate-50"}`}><FileCheck2 className="size-4" />백업 파일 검증<input type="file" accept=".zip,application/zip" aria-label="백업 ZIP 파일 검증" className="sr-only" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void run(async () => { if (file.size > 251 * 1024 * 1024) throw new Error("251MB 이하의 TRACE 백업 파일을 선택하세요."); setResult(await verifySchoolBackup(new Uint8Array(await file.arrayBuffer()))); }); }} /></label></div>
    <p className="text-sm leading-6 text-[#65768b]">최대 250MB. 백업 파일을 받기 전에 데이터·원본의 해시와 개수를 검사합니다. 연결 비밀키는 제외합니다. 기존 백업 검증은 이 브라우저에서만 처리하며 파일을 업로드하지 않습니다.</p>
    {result && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><p className="font-semibold">백업 파일 검증 완료</p><p>데이터 {result.tableCount}개 표 · {result.rowCount}개 기록 · 원본 {result.fileCount}개</p><p>백업 기준: {result.capturedAt} · {result.storage === "google" ? "구글 저장소" : "기존 사이트 저장소"}</p><p>데이터와 등록 원본의 내용·개수가 일치합니다. 보관 위치는 내려받기 설정에서 확인하세요.</p></div>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <p className="text-sm leading-6 text-[#65768b]">백업에는 학생 개인정보가 포함됩니다. 학교에서 승인한 비공개 위치에 보관합니다. 복원은 별도 단계에서 처리합니다.</p>
  </CardContent></Card>;
}
