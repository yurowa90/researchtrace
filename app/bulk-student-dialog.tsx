"use client";

import * as React from "react";
import { CircleAlert, Download, FileSpreadsheet, LoaderCircle, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Classroom, Student } from "@/lib/portal-types";
import { parseStudentWorkbook } from "@/lib/student-xlsx";
import { normalizeStudentRow, parsePastedStudents, validateStudentRows, type BulkStudentRow } from "@/lib/student-registration";

export function BulkStudentDialog({ open, onOpenChange, classrooms, existingStudents, defaultClassId, busy, onSave }: {
  open: boolean; onOpenChange: (open: boolean) => void; classrooms: Classroom[]; existingStudents: Student[];
  defaultClassId: number | null; busy: boolean;
  onSave: (payload: { classId: number; students: BulkStudentRow[] }) => Promise<void>;
}) {
  const [classId, setClassId] = React.useState(String(defaultClassId ?? classrooms[0]?.id ?? ""));
  const [rows, setRows] = React.useState<BulkStudentRow[]>([]);
  const [paste, setPaste] = React.useState("");
  const [source, setSource] = React.useState("");
  const [error, setError] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const readSequence = React.useRef(0);
  const saveLock = React.useRef(false);
  const locked = busy || parsing;
  const issues = validateStudentRows(rows, existingStudents, Number(classId));
  const errorRows = new Set(issues.flatMap((issue) => issue.rowNumber ? [issue.rowNumber] : []));
  const classroom = classrooms.find((item) => item.id === Number(classId));

  const readFile = async (file: File | undefined) => {
    if (!file || locked) return;
    const sequence = ++readSequence.current;
    setError(""); setParsing(true);
    try {
      const result = await parseStudentWorkbook(file);
      if (readSequence.current === sequence) { setRows(result.rows); setSource(file.name); }
    } catch (caught) { setRows([]); setSource(""); setError(caught instanceof Error ? caught.message : "파일을 읽지 못했습니다."); }
    finally { if (readSequence.current === sequence) setParsing(false); }
  };
  const fromPaste = () => {
    try { const next = parsePastedStudents(paste); setRows(next); setSource("복사·붙여넣기"); setError(""); }
    catch (caught) { setRows([]); setSource(""); setError(caught instanceof Error ? caught.message : "붙여넣기 내용을 확인하세요."); }
  };
  const editRow = (rowNumber: number, field: "studentNumber" | "name" | "email", value: string) => {
    setError(""); setRows((current) => current.map((row) => row.rowNumber === rowNumber ? { ...row, [field]: value } : row));
  };
  const save = async () => {
    if (saveLock.current || locked || !classroom || issues.length) return;
    saveLock.current = true; setError("");
    try { await onSave({ classId: classroom.id, students: rows.map(normalizeStudentRow) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다. 입력 내용은 유지됩니다."); }
    finally { saveLock.current = false; }
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!locked) onOpenChange(next); }}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl" showCloseButton={!locked}>
      <DialogHeader><DialogTitle>학생 엑셀 일괄 등록</DialogTitle><DialogDescription>파일을 올리거나 엑셀의 세 열을 복사해 붙여넣으세요. 오류는 아래 표에서 바로 수정할 수 있습니다.</DialogDescription></DialogHeader>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-0 flex-1 gap-2"><Label htmlFor="bulk-class">등록할 학급</Label><Select value={classId} disabled={locked} onValueChange={(value) => { setClassId(value ?? ""); setError(""); }}><SelectTrigger id="bulk-class" className="w-full"><SelectValue placeholder="학급 선택" /></SelectTrigger><SelectContent>{classrooms.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name} · {item.schoolYear}학년도</SelectItem>)}</SelectContent></Select></div>
          <Button asChild variant="outline"><a href="/templates/trace-student-bulk-template.xlsx" download><Download />엑셀 양식</a></Button>
        </div>
        {!classrooms.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">학교 설정에서 학급을 먼저 만들거나, 관리자에게 담당 학급 배정을 요청하세요.</p>}
        <Tabs defaultValue="file">
          <TabsList><TabsTrigger value="file" disabled={locked}>엑셀 파일</TabsTrigger><TabsTrigger value="paste" disabled={locked}>복사·붙여넣기</TabsTrigger></TabsList>
          <TabsContent value="file">
            <div onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length !== 1) { setError("한 번에 파일 하나만 올리세요."); return; } void readFile(event.dataTransfer.files[0]); }} className={`rounded-xl border-2 border-dashed p-4 ${dragging ? "border-[#2457d6] bg-blue-50" : "border-[#cbd7e6] bg-[#f8fafc]"}`}>
              <Label htmlFor="bulk-student-file" className="mb-3 flex items-center gap-2"><FileSpreadsheet className="size-5 text-[#173a73]" />파일을 끌어 놓거나 선택하세요</Label>
              <Input id="bulk-student-file" type="file" accept=".xlsx" disabled={locked} onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              <p className="mt-2 text-sm text-[#65768b]">XLSX · 최대 5MB · 최대 300명 · 학번·이름·이메일 모두 필수</p>
            </div>
          </TabsContent>
          <TabsContent value="paste" className="space-y-3">
            <Label htmlFor="bulk-paste">엑셀에서 학번·이름·이메일 세 열을 선택해 복사한 뒤 붙여넣으세요.</Label>
            <Textarea id="bulk-paste" value={paste} disabled={locked} onChange={(event) => setPaste(event.target.value)} className="min-h-28" placeholder={"20301\t김하늘\tstudent01@example.kr\n20302\t이서연\tstudent02@example.kr"} />
            <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={locked || !paste.trim()} onClick={fromPaste}>붙여넣은 내용 검토</Button><p className="text-sm text-[#65768b]">머리글 포함·미포함 모두 가능 · 다시 검토하면 아래 표가 교체됩니다.</p></div>
          </TabsContent>
        </Tabs>
        {parsing && <p role="status" className="flex items-center gap-2 text-sm text-blue-800"><LoaderCircle className="size-4 animate-spin" />파일을 읽고 있습니다.</p>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800"><CircleAlert className="mb-1 size-4" />{error}</div>}
        {(source || rows.length > 0) && <div className="overflow-hidden rounded-xl border border-[#dbe4ef]">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#edf3fc] p-3"><p className="text-sm font-semibold">{source} · {rows.length}명</p><Badge variant="outline" className={issues.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}>{issues.length ? `수정할 항목 ${issues.length}개` : "입력 검증 완료"}</Badge></div>
          <p className="border-b px-3 py-2 text-sm text-[#65768b]">입력칸을 눌러 수정하세요. 행 제외는 이 등록 목록에만 적용되며 기존 학생은 삭제하지 않습니다.</p>
          <div className="max-h-72 overflow-auto"><Table><TableHeader><TableRow><TableHead>행</TableHead><TableHead>학번</TableHead><TableHead>이름</TableHead><TableHead>이메일</TableHead><TableHead>제외</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.rowNumber} className={errorRows.has(row.rowNumber) ? "bg-amber-50/70" : ""}>
            <TableCell className="align-top">{row.rowNumber}</TableCell>
            {(["studentNumber", "name", "email"] as const).map((field, index) => { const problems = issues.filter((issue) => issue.rowNumber === row.rowNumber && issue.field === field); return <TableCell key={field} className="align-top"><Input aria-label={`${row.rowNumber}행 ${["학번", "이름", "이메일"][index]}`} aria-invalid={problems.length > 0} value={row[field]} disabled={locked} onChange={(event) => editRow(row.rowNumber, field, event.target.value)} className={field === "email" ? "min-w-56" : "min-w-28"} />{problems.map((problem) => <p key={problem.message} className="mt-1 max-w-64 text-sm text-amber-900">{problem.message}</p>)}</TableCell>; })}
            <TableCell className="align-top"><Button variant="ghost" size="icon" aria-label={`${row.rowNumber}행 등록 목록에서 제외`} disabled={locked} onClick={() => { setRows((current) => current.filter((item) => item.rowNumber !== row.rowNumber)); setError(""); }}><Trash2 className="size-4" /></Button></TableCell>
          </TableRow>)}</TableBody></Table></div>
          {issues.filter((issue) => !issue.rowNumber).map((issue) => <p key={issue.message} className="p-3 text-sm text-amber-900">{issue.message}</p>)}
        </div>}
      </div>
      <DialogFooter className="items-center gap-3"><p className="mr-auto text-sm text-[#65768b]">기존 학생을 덮어쓰지 않습니다. 서버에서 권한·중복을 다시 확인합니다.</p><Button variant="outline" disabled={locked} onClick={() => onOpenChange(false)}>취소</Button><Button disabled={locked || !classroom || issues.length > 0} onClick={() => void save()} className="bg-[#0d7b68] hover:bg-[#0b6758]"><Upload />{busy ? "등록 중…" : `${rows.length}명 등록`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
