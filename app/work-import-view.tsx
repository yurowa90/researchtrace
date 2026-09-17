"use client";
import { profileEvidenceIssues } from "@/lib/profile-evidence";

import * as React from "react";
import { CheckCircle2, Copy, Download, FileJson } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PortalData, Student } from "@/lib/portal-types";
import type { ProfileImport } from "@/lib/profile-import";
import { readWorkResult, workRequestText } from "@/lib/work-result";
import { studentReadiness } from "@/lib/portal-workflow";
import { profileCoverageIssues } from "@/lib/record-coverage";
import { libraryReferenceIssues } from "@/lib/reference-materials";

export function WorkImportView({ data, students, selectedStudentId, onSelect, onRecords, onImport, busy }: {
  data: PortalData; students: Student[]; selectedStudentId: number | null; onSelect: (id: number) => void;
  onRecords: () => void; onImport: (studentId: number, profile: unknown) => Promise<void>; busy: boolean;
}) {
  const student = students.find((item) => item.id === selectedStudentId) ?? students[0];
  const [json, setJson] = React.useState("");
  const [preview, setPreview] = React.useState<ProfileImport | null>(null);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [confirmed, setConfirmed] = React.useState(false);
  const [fileName, setFileName] = React.useState("");
  const [reading, setReading] = React.useState(false);
  const [copyFallback, setCopyFallback] = React.useState(false);
  const saveLock = React.useRef(false);
  if (!student) return <div className="rounded-2xl border bg-white p-8"><h1 className="text-2xl font-bold">Work 결과 가져오기</h1><p className="mt-3 text-base text-[#65768b]">학생 등록이 먼저 필요합니다. 학교 설정에서 학생을 등록하세요.</p></div>;
  const readiness = studentReadiness(data, student);
  const missingOriginal = !student.isExample && readiness.missingGrades.length > 0;
  const materials = data.referenceMaterials.filter((item) => item.status === "active" && data.selectedReferenceMaterialIds.includes(item.id));
  const requestText = workRequestText(student, readiness.classroom, data.records, materials, data.guidance);
  const changeText = (value: string) => { setJson(value); setPreview(null); setIssues([]); setConfirmed(false); };
  const selectFile = async (file: File | undefined) => {
    if (!file || busy || reading) return;
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 10 * 1024 * 1024) { setIssues(["10MB 이하의 .json 파일을 선택하세요."]); setPreview(null); return; }
    setReading(true); setPreview(null); setConfirmed(false);
    try { changeText(await file.text()); setFileName(file.name); }
    catch { setIssues(["파일을 읽지 못했습니다. 결과를 직접 붙여넣으세요."]); }
    finally { setReading(false); }
  };
  const review = () => {
    const result = readWorkResult(json);
    const errors = [...result.issues];
    const profile = result.profile;
    if (profile) {
      errors.push(...profileCoverageIssues(profile, readiness.classroom?.grade ?? 2, data.records.filter((item) => item.studentId === student.id), student.isExample));
      errors.push(...libraryReferenceIssues(profile, data.referenceMaterials, data.guidance));
      errors.push(...profileEvidenceIssues(profile,data.records,student.id));
      if (profile.studentReference && (profile.studentReference.studentNumber !== student.studentNumber || profile.studentReference.name !== student.name)) errors.push("결과에 적힌 학생 정보가 현재 선택한 학생과 다릅니다.");
      if (data.profileSnapshots.some((item) => item.studentId === student.id && item.versionLabel === profile.versionLabel)) errors.push("이미 저장된 버전명입니다. Work 결과의 versionLabel을 새 이름으로 변경하세요.");
    }
    setIssues(errors); setPreview(errors.length ? null : profile); setConfirmed(false);
  };
  const save = async () => {
    if (saveLock.current || busy || !preview || !confirmed || missingOriginal) return;
    saveLock.current = true;
    try { await onImport(student.id, preview); }
    catch (caught) { setIssues([caught instanceof Error ? caught.message : "저장하지 못했습니다. 입력 내용은 유지됩니다."]); }
    finally { saveLock.current = false; }
  };
  return <div className="space-y-5">
    <div><h1 className="text-3xl font-bold tracking-tight">Work 분석 결과 가져오기</h1><p className="mt-3 text-base leading-7 text-[#65768b]">분석은 Work에서, 검토와 누적 관리는 이 사이트에서 진행합니다.</p></div>
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Card className="h-fit border-[#dfe6ef]"><CardContent className="space-y-5 p-5">
        <div className="grid gap-2"><Label htmlFor="work-student">1. 대상 학생</Label><Select value={String(student.id)} disabled={busy || reading} onValueChange={(value) => { if (value) onSelect(Number(value)); }}><SelectTrigger id="work-student" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{students.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name} · {item.studentNumber}</SelectItem>)}</SelectContent></Select><p className="text-sm text-[#65768b]">학생을 바꾸면 입력 중인 결과는 비워집니다.</p></div>
        <div className={`rounded-xl border p-4 ${missingOriginal ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><p className="text-sm font-semibold">{missingOriginal ? `${readiness.missingGrades.join("·")}학년 학생부 원본이 필요합니다.` : student.isExample ? "예시 학생입니다. 실제 학생 자료와 구분하세요." : "필수 학생부 원본이 준비되어 있습니다."}</p>{missingOriginal && <Button variant="outline" size="sm" className="mt-3 bg-white" onClick={onRecords}>원본 등록으로 이동</Button>}</div>
        <div><h2 className="font-bold">2. Work에 자료와 요청문 전달</h2><p className="mt-2 text-sm leading-6 text-[#65768b]">학생부와 요청문을 Work에 전달합니다. 공용 평가 자료는 자료실에서 한 번 받아 같은 Work 공간에서 재사용하세요. 현재 학년 기록이 있으면 함께 분석합니다.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(requestText); toast.success("분석 요청문을 복사했습니다."); } catch { setCopyFallback(true); } }}><Copy />분석 요청문 복사</Button><Button asChild variant="outline"><a href={`/api/work-bundle?studentId=${student.id}`}><Download />Work 자료 묶음 받기</a></Button><Button asChild variant="outline"><a href="/api/profile-template"><Download />JSON 예시</a></Button></div>{copyFallback && <div className="mt-3"><Label htmlFor="work-request-fallback">복사 권한이 없어 요청문을 표시합니다. 선택해서 복사하세요.</Label><Textarea id="work-request-fallback" readOnly value={requestText} className="mt-2 min-h-52" /></div>}</div>
        <div className="rounded-xl bg-[#f4f7fb] p-4 text-sm leading-6"><p>선택한 공용 평가 자료: {materials.length}건</p><p className="text-[#65768b]">{materials.map(item => item.title).join(" · ") || "공용 평가 자료실에서 사용할 자료를 선택하세요. 선택하지 않으면 학생부 분석만 요청합니다."}</p>{materials.length > 0 && <Button asChild variant="outline" size="sm" className="mt-2"><a href="/api/reference-materials/bundle">선택 자료 한 번에 받기</a></Button>}</div><p className="border-t pt-4 text-sm leading-6 text-[#65768b]">사이트에 등록된 파일은 Work로 자동 전송되지 않습니다. Work가 읽을 수 있도록 처음 한 번 파일을 전달해야 합니다. 불필요한 개인정보는 제외하고 학교에서 허용한 자료만 사용합니다.</p>
      </CardContent></Card>
      <Card className="border-[#dfe6ef]"><CardContent className="space-y-4 p-5">
        <h2 className="font-bold">3. 결과 파일 또는 내용 입력</h2>
        <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length !== 1) { setIssues(["JSON 파일 하나만 올리세요."]); setPreview(null); return; } void selectFile(event.dataTransfer.files[0]); }} className="rounded-xl border border-dashed border-[#b9c7d8] bg-[#f8fafc] p-4"><Label htmlFor="work-json-file">JSON 파일을 끌어 놓거나 선택하세요</Label><Input id="work-json-file" type="file" accept=".json,application/json" disabled={busy || reading} className="mt-2" onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />{fileName && <p className="mt-2 break-all text-sm text-[#65768b]">{fileName}</p>}</div>
        <Label htmlFor="work-json">또는 Work에서 받은 JSON 전체 붙여넣기</Label><Textarea id="work-json" value={json} disabled={busy || reading} onChange={(event) => { changeText(event.target.value); setFileName(""); }} className="min-h-64 font-mono text-sm leading-6" placeholder={'{\n  "schemaVersion": "1.2",\n  "versionLabel": "새 버전 이름",\n  ...\n}'} />
        <Button variant="outline" disabled={busy || reading || !json.trim()} onClick={review}><CheckCircle2 />{reading ? "파일 읽는 중…" : "검증·미리보기"}</Button>
        {issues.length > 0 && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-800"><p className="font-semibold">확인이 필요합니다</p><ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
        {preview && <section className="space-y-4 rounded-xl border border-[#bcd8cf] bg-[#f2faf7] p-4"><div className="flex flex-wrap gap-2"><Badge variant="outline">{student.studentNumber} {student.name}</Badge><Badge variant="outline">{preview.versionLabel}</Badge><Badge variant="outline">{preview.sourceYears.join("·")}학년도</Badge></div><p className="font-bold leading-6">{preview.overview.oneLineProfile}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[["학생부 근거", preview.sections.length], ["교과 기록", preview.academicAnalysis.courses.length], ["키워드", preview.researchFingerprint.length], ["개념 노드", preview.ontology.nodes.length], ["평가 기준", preview.evaluationAnalysis.references.length], ["위키", preview.wikiPages.length]].map(([label, count]) => <p key={label} className="rounded-lg bg-white p-3 text-sm">{label} <span className="font-bold">{count}개</span></p>)}</div>{!preview.studentReference && <p className="text-sm text-amber-900">이 결과에는 학생 식별정보가 없어 자동 대조할 수 없습니다. 원본과 대상 학생을 직접 확인하세요.</p>}<div className="flex items-start gap-2"><Checkbox id="work-confirm" checked={confirmed} disabled={busy} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-1" /><Label htmlFor="work-confirm" className="text-sm leading-6">이 결과가 {student.studentNumber} {student.name} 학생의 자료이며, 원본과 분석 근거를 검토했습니다.</Label></div><Button className="w-full bg-[#0d7b68] hover:bg-[#0b6758]" disabled={busy || !confirmed || missingOriginal} onClick={() => void save()}><FileJson />{busy ? "새 버전 저장 중…" : "검토한 결과 저장"}</Button><p className="text-sm text-[#65768b]">새 버전이 활성화되고 기존 버전은 삭제하지 않습니다.</p></section>}
      </CardContent></Card>
    </div>
  </div>;
}
