"use client";

import * as React from "react";
import { BulkRecordUpload } from "@/app/bulk-record-upload";
import { CheckCircle2, Download, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { recordCoverage } from "@/lib/record-coverage";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PortalData, Student } from "@/lib/portal-types";
import { studentReadiness, suggestedRecordYear } from "@/lib/portal-workflow";

export function RecordsView({ data, students, staff, selectedStudentId, onSelect, onUploaded }: {
  data: PortalData; students: Student[]; staff: boolean; selectedStudentId: number | null; onSelect: (id: number) => void; onUploaded: () => Promise<void>;
}) {
  const [bulkOpen,setBulkOpen]=React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [studentId, setStudentId] = React.useState(0);
  const [coverage, setCoverage] = React.useState<Array<{grade:number;schoolYear:number}>>([{grade:1,schoolYear:new Date().getFullYear()-1}]);
  const latest = [...coverage].sort((a,b)=>a.grade-b.grade).at(-1);
  const recordGrade = latest?.grade ?? 1;
  const schoolYear = latest?.schoolYear ?? 0;
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const lock = React.useRef(false);
  const student = students.find((item) => item.id === studentId);
  const classroom = data.classes.find((item) => item.id === student?.classId);
  const selectStudent = (id: number) => {
    const target = students.find((item) => item.id === id);
    if (!target) return;
    const readiness = studentReadiness(data, target);
    const grade = readiness.missingGrades[0] ?? 1;
    setStudentId(id); onSelect(id); setFile(null); setError("");
    setCoverage([{grade,schoolYear:suggestedRecordYear(readiness.classroom?.schoolYear ?? new Date().getFullYear(), readiness.classroom?.grade ?? 2, grade)}]);
  };
  const beginUpload = (id: number) => { selectStudent(id); setOpen(true); };
  const selectFile = (next: File | undefined) => {
    setError("");
    if (!next) { setFile(null); return; }
    if (!/\.(pdf|hwp|hwpx|docx)$/i.test(next.name) || next.size > 20 * 1024 * 1024 || next.size === 0) { setFile(null); setError("20MB 이하의 PDF·HWP·HWPX·DOCX 파일을 선택하세요. 빈 파일은 저장할 수 없습니다."); return; }
    setFile(next);
  };
  const upload = async () => {
    if (!file || !student || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("studentId", String(student.id)); form.set("recordGrade", String(recordGrade)); form.set("schoolYear", String(schoolYear)); form.set("file", file); form.set("coverage", JSON.stringify(coverage));
      const response = await fetch("/api/student-records", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "원본을 저장하지 못했습니다.");
      setOpen(false); setFile(null); toast.success(`${student.name} 학생의 ${coverage.map(x=>x.grade).join("·")}학년 원본을 보관했습니다.`); await onUploaded();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "업로드하지 못했습니다."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">학생부 원본 관리</h1><p className="mt-3 text-base leading-7 text-[#65768b]">2학년은 1학년, 3학년은 1·2학년 원본이 기본입니다. 현재 학년 기록이 있으면 함께 등록해 추가 분석할 수 있습니다.</p></div>{staff && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!students.length} onClick={()=>setBulkOpen(true)}>여러 원본 등록</Button><Button disabled={!students.length} className="bg-[#173a73]" onClick={() => beginUpload(selectedStudentId ?? students[0]?.id)}><Upload />학생부 업로드</Button></div>}</div>
    {students.length === 0 && <p className="rounded-xl border bg-white p-6 text-base text-[#65768b]">등록된 학생이 없습니다. 학교 설정에서 학생 명단을 먼저 등록하세요.</p>}
    {students.map((item) => { const status = studentReadiness(data, item); const records = data.records.filter((record) => record.studentId === item.id); return <Card key={item.id} className={selectedStudentId === item.id ? "border-[#7197cc]" : "border-[#dfe6ef]"}><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold">{item.name} {item.isExample && <Badge variant="outline">예시</Badge>}</h2><p className="mt-1 text-sm text-[#65768b]">{status.classroom?.name} · {item.studentNumber}</p></div><div className="flex flex-wrap items-center gap-2">{status.requiredGrades.map((grade) => <Badge key={grade} variant="outline" className={status.missingGrades.includes(grade) ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}>{!status.missingGrades.includes(grade) && <CheckCircle2 className="size-3" />}{grade}학년 {status.missingGrades.includes(grade) ? "필요" : "보관"}</Badge>)}{status.currentGradeIncluded && <Badge variant="outline" className="bg-blue-50 text-blue-800">현재 학년 포함</Badge>}{staff && <Button size="sm" variant="outline" onClick={() => beginUpload(item.id)}><Upload />원본 추가</Button>}</div></div>
      {records.length ? <div className="mt-4 space-y-2">{records.map((record) => <a key={record.id} href={`/api/student-records/${record.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e5eaf1] bg-[#f9fbfd] p-3 text-sm hover:border-[#aac0df]"><FileText className="size-4 text-[#2457d6]" /><span className="min-w-0 break-all font-medium">{record.originalName}</span><span className="text-[#65768b]">{recordCoverage(record).map(item => `${item.grade}학년(${item.schoolYear})`).join(" · ")} · {(record.sizeBytes / 1024 / 1024).toFixed(1)}MB</span><Download className="ml-auto size-4" /></a>)}</div> : <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">원본 추가를 누르면 이 학생과 필요한 학년이 미리 선택됩니다.</p>}
    </CardContent></Card>; })}
    {bulkOpen&&<BulkRecordUpload data={data} students={students} onClose={()=>setBulkOpen(false)} onUploaded={onUploaded}/>}
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[92vh] overflow-y-auto" showCloseButton={!busy}><DialogHeader><DialogTitle>학생부 원본 업로드</DialogTitle><DialogDescription>대상 학생과 파일에 실제로 포함된 학년을 모두 선택하세요. 기존 파일은 보존됩니다.</DialogDescription></DialogHeader><div className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="record-student">학생</Label><Select value={String(studentId)} disabled={busy} onValueChange={(value) => value && selectStudent(Number(value))}><SelectTrigger id="record-student" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{students.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name} · {item.studentNumber}</SelectItem>)}</SelectContent></Select></div>
      <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-semibold">이 파일에 포함된 학년 · 여러 개 선택 가능</legend>{Array.from({length:classroom?.grade ?? 2},(_,i)=>i+1).map(grade=>{const item=coverage.find(row=>row.grade===grade);return <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" key={grade}><label className="flex items-center gap-2 text-sm"><Checkbox disabled={busy} checked={Boolean(item)} onCheckedChange={value=>setCoverage(rows=>value===true?[...rows,{grade,schoolYear:suggestedRecordYear(classroom?.schoolYear??new Date().getFullYear(),classroom?.grade??2,grade)}]:rows.filter(row=>row.grade!==grade))}/>{grade}학년 {grade===classroom?.grade?"· 현재 학년 기록이 있을 때":""}</label>{item&&<Input aria-label={`${grade}학년 학년도`} type="number" min={2022} max={2100} disabled={busy} value={item.schoolYear} className="ml-auto w-28" onChange={event=>setCoverage(rows=>rows.map(row=>row.grade===grade?{...row,schoolYear:Number(event.target.value)}:row))}/>}</div>;})}</fieldset><p className="text-sm leading-6 text-[#65768b]">한 파일에 1·2·3학년 기록이 함께 있으면 해당 학년을 모두 선택하세요. 일부 학기만 있어도 현재 학년을 선택할 수 있습니다. 학년도는 실제 원본을 확인하세요.</p>
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) { if (event.dataTransfer.files.length !== 1) { setError("파일을 하나씩 등록하세요."); return; } selectFile(event.dataTransfer.files[0]); } }} className="rounded-xl border border-dashed border-[#b9c7d8] p-4"><Label htmlFor="record-file">파일 선택 또는 끌어 놓기</Label><Input id="record-file" key={studentId} className="mt-2" type="file" disabled={busy} accept=".pdf,.hwp,.hwpx,.docx" onChange={(event) => { selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />{file && <p className="mt-2 break-all text-sm">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</p>}</div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    </div><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>취소</Button><Button disabled={busy || !file || !student || !coverage.length || coverage.some(item=>!Number.isInteger(item.schoolYear)||item.schoolYear<2022||item.schoolYear>2100)} onClick={() => void upload()} className="bg-[#173a73]">{busy ? "업로드 중…" : "원본 보관"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
