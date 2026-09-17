"use client";

import * as React from "react";
import { recordCoverage } from "@/lib/record-coverage";
import {
  ArrowRight,
  BookOpenText,
  FileJson,
  FileText,
  GraduationCap,
  Network,
  Plus,
  School,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CompetencyEvaluation, OntologyEdge, OntologyNode, PortalData, Student } from "@/lib/portal-types";

function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#2457d6]">{eyebrow}</p><h1 className="mt-1.5 text-[clamp(1.65rem,3vw,2.35rem)] font-bold tracking-[-.045em] text-[#102342]">{title}</h1><p className="mt-2 max-w-3xl text-[15px] leading-6 text-[#68788d]">{description}</p></div>{action}</div>;
}

function Empty({ title, description, icon: Icon = FileText }: { title: string; description: string; icon?: typeof FileText }) {
  return <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#cfd9e6] bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eaf0fb] text-[#2457d6]"><Icon className="size-6" /></span><h2 className="mt-4 font-bold text-[#17345e]">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#718095]">{description}</p></div></div>;
}

function StudentPicker({ students, value, onChange }: { students: Student[]; value: number | null; onChange: (value: number) => void }) {
  if (!students.length) return null;
  const current = value && students.some((student) => student.id === value) ? value : students[0].id;
  return <Select value={String(current)} onValueChange={(next) => onChange(Number(next))}><SelectTrigger className="h-11 min-w-[210px] bg-white"><SelectValue /></SelectTrigger><SelectContent>{students.map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.name} · {student.studentNumber}{student.status === "graduated" ? " · 졸업" : ""}</SelectItem>)}</SelectContent></Select>;
}

function activeProfile(data: PortalData, studentId: number) {
  return data.profileSnapshots.find((item) => item.studentId === studentId && item.isActive) ?? null;
}

function roleStatus(student: Student) {
  if (student.status === "graduated") return <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">{student.graduatedYear ?? ""} 졸업</Badge>;
  if (student.status === "archived") return <Badge variant="outline">보관</Badge>;
  return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">재학</Badge>;
}

export function RecordOverview({ data, students, staff, admin, onSelect, onNavigate }: { data: PortalData; students: Student[]; staff: boolean; admin: boolean; onSelect: (id: number) => void; onNavigate: (view: "students" | "records" | "import") => void }) {
  const studentIds = new Set(students.map((item) => item.id));
  const profiles = data.profileSnapshots.filter((item) => item.isActive && studentIds.has(item.studentId));
  const records = data.records.filter((item) => studentIds.has(item.studentId));
  const keywords = data.researchKeywords.filter((item) => studentIds.has(item.studentId));
  const keywordCounts = new Map<string, number>();
  keywords.forEach((item) => keywordCounts.set(item.keyword, (keywordCounts.get(item.keyword) ?? 0) + 1));
  const topKeywords = [...keywordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const completed = students.filter((student) => {
    const classroom = data.classes.find((item) => item.id === student.classId);
    const required = classroom?.grade === 3 ? [1, 2] : [1];
    return required.every((grade) => records.some((record) => record.studentId === student.id && recordCoverage(record).some(c=>c.grade === grade)));
  }).length;
  const stats = [
    { label: admin ? "전체 학생" : staff ? "담당 학생" : "내 프로필", value: students.length, detail: `${students.filter((item) => item.status === "graduated").length}명 졸업 보존`, icon: Users, color: "#2457d6" },
    { label: "원본 준비", value: `${completed}/${students.length}`, detail: "학년별 필수 학생부", icon: FileText, color: "#0d8b72" },
    { label: "활성 프로필", value: profiles.length, detail: "Work 결과 반영", icon: Sparkles, color: "#7a4cc5" },
    { label: "LLM 위키", value: data.wikiPages.filter((item) => studentIds.has(item.studentId)).length, detail: "근거 연결 문서", icon: BookOpenText, color: "#d56e24" },
  ];
  return <>
    <Heading eyebrow={admin ? "School intelligence" : "Student record intelligence"} title={admin ? "학교 전체의 누적 연구 흐름입니다." : staff ? "담당 학급의 학생부 흐름을 봅니다." : "내 학생부가 만든 연구 프로필입니다."} description="원본 학생부는 증빙으로 보관하고, Work에서 만든 구조화 분석 결과를 버전별로 누적합니다." action={staff ? <Button className="bg-[#173a73]" onClick={() => onNavigate("import")}><FileJson className="size-4" /> Work 결과 가져오기</Button> : undefined} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <Card key={stat.label} className="overflow-hidden border-[#dfe6ef] shadow-[0_6px_24px_rgba(29,55,90,.05)]"><CardContent className="relative p-5"><span className="absolute inset-x-0 top-0 h-1" style={{ background: stat.color }} /><div className="flex justify-between"><div><p className="text-sm text-[#6c7b8f]">{stat.label}</p><p className="mt-2 text-3xl font-bold tracking-[-.04em]">{stat.value}</p><p className="mt-1 text-xs text-[#8794a5]">{stat.detail}</p></div><span className="grid size-10 place-items-center rounded-xl" style={{ background: `${stat.color}14`, color: stat.color }}><stat.icon className="size-5" /></span></div></CardContent></Card>)}</section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_.8fr]">
      <Card className="border-[#dfe6ef]"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>학생 프로필 현황</CardTitle><p className="mt-1 text-sm text-[#77869a]">졸업 후에도 버전과 근거가 유지됩니다.</p></div><Button variant="outline" size="sm" onClick={() => onNavigate("students")}>전체 보기 <ArrowRight className="size-4" /></Button></CardHeader><CardContent>{students.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>학생</TableHead><TableHead>상태</TableHead><TableHead>원본</TableHead><TableHead>프로필</TableHead></TableRow></TableHeader><TableBody>{students.slice(0, 8).map((student) => { const snapshot = activeProfile(data, student.id); const count = records.filter((item) => item.studentId === student.id).length; return <TableRow key={student.id} className="cursor-pointer" onClick={() => onSelect(student.id)}><TableCell><p className="font-semibold">{student.name}</p><p className="text-xs text-[#8290a2]">{student.studentNumber}</p></TableCell><TableCell>{roleStatus(student)}</TableCell><TableCell>{count}개</TableCell><TableCell>{snapshot ? <span className="text-sm font-medium text-[#173a73]">{snapshot.oneLineProfile}</span> : <span className="text-sm text-[#96a1af]">분석 전</span>}</TableCell></TableRow>; })}</TableBody></Table></div> : <Empty title="등록된 학생이 없습니다." description="학급 설정에서 학생을 먼저 등록하세요." icon={Users} />}</CardContent></Card>
      <Card className="border-[#dfe6ef]"><CardHeader><CardTitle>학교 연구 키워드</CardTitle><p className="text-sm text-[#77869a]">현재 활성 프로필 기준</p></CardHeader><CardContent>{topKeywords.length ? <div className="flex flex-wrap gap-2">{topKeywords.map(([keyword, count], index) => <span key={keyword} className={`rounded-full px-3 py-1.5 text-sm ${index < 3 ? "bg-[#173a73] text-white" : "bg-[#edf2fa] text-[#355071]"}`}>{keyword} <small className="ml-1 opacity-70">{count}</small></span>)}</div> : <div className="rounded-xl bg-[#f7f9fc] p-5 text-sm leading-6 text-[#758397]">Work 분석 결과를 가져오면 학생·학급·학교 단위 키워드가 집계됩니다.</div>}</CardContent></Card>
    </section>
  </>;
}

export { AcademicsView, FingerprintView, EvaluationView, WikiView } from "@/app/analysis-views";

export function SchoolSettings({ data, students, staff, admin, onAddClass, onAddStudent, onBulkAddStudent, onStatus, onApproveStudent, onApproveTeacher, onAssignClassTeacher, busy }: { data: PortalData; students: Student[]; staff: boolean; admin: boolean; onAddClass: () => void; onAddStudent: () => void; onBulkAddStudent: () => void; onStatus: (studentId: number, status: "active" | "graduated", year?: number) => Promise<void>; onApproveStudent: (userId: number, studentId: number) => Promise<void>; onApproveTeacher: (userId: number) => Promise<void>; onAssignClassTeacher: (classId: number, teacherId: number) => Promise<void>; busy: boolean }) {
  const year = new Date().getFullYear();
  const accountStudents = admin ? data.students : students;
  return <><Heading eyebrow="Access & retention" title={admin ? "학교 권한과 졸업생 보존" : "학급 설정"} description="학생은 본인 자료만, 담임은 담당 학급만, 학교 관리자는 전체 학급과 졸업생 자료를 조회합니다." action={staff ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onAddClass}><Plus className="size-4" /> 학급</Button><Button variant="outline" onClick={onAddStudent}><Plus className="size-4" /> 학생 1명</Button><Button className="bg-[#173a73]" onClick={onBulkAddStudent}><Upload className="size-4" /> 엑셀 일괄 등록</Button></div> : undefined} />
    <div className="space-y-5">
      {admin && <Card className="border-[#dfe6ef]"><CardHeader><CardTitle>학급 담당자</CardTitle><p className="text-sm text-[#77869a]">승인된 담임에게 학급을 배정하면 해당 학급 학생만 조회할 수 있습니다.</p></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>학급</TableHead><TableHead>학년도·학년</TableHead><TableHead>담당 교사</TableHead></TableRow></TableHeader><TableBody>{data.classes.map((classroom) => <TableRow key={classroom.id}><TableCell className="font-semibold">{classroom.name}</TableCell><TableCell>{classroom.schoolYear} · {classroom.grade}학년</TableCell><TableCell><Select value={String(classroom.teacherId)} disabled={busy} onValueChange={(value) => value && void onAssignClassTeacher(classroom.id, Number(value))}><SelectTrigger className="w-full max-w-72"><SelectValue placeholder="담당 교사 선택" /></SelectTrigger><SelectContent>{data.staffUsers.map((user) => <SelectItem key={user.id} value={String(user.id)}>{user.displayName} · {user.role === "admin" ? "관리자" : "담임"}</SelectItem>)}</SelectContent></Select></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>}
      <Card className="border-[#dfe6ef]"><CardHeader><CardTitle>승인 대기 계정 <Badge variant="secondary">{data.pendingUsers.length}</Badge></CardTitle><p className="text-sm text-[#77869a]">학생 연결은 등록 이메일이 일치할 때만 가능하며, 담임 승인은 학교 관리자만 처리합니다.</p></CardHeader><CardContent>{data.pendingUsers.length ? <div className="space-y-3">{data.pendingUsers.map((user) => { const student = accountStudents.find((item) => item.email?.toLowerCase() === user.email.toLowerCase()); return <div key={user.id} className="flex flex-col gap-3 rounded-xl border border-[#e3e8ef] p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold">{user.displayName}</p><p className="truncate text-xs text-[#7e8c9e]">{user.email}</p>{student && <p className="mt-1 text-xs text-emerald-700">학생 일치: {student.studentNumber} {student.name}</p>}</div><div className="flex flex-wrap gap-2">{student && <Button size="sm" variant="outline" disabled={busy} onClick={() => void onApproveStudent(user.id, student.id)}>학생으로 연결</Button>}{admin && <Button size="sm" className="bg-[#173a73]" disabled={busy} onClick={() => void onApproveTeacher(user.id)}>담임으로 승인</Button>}</div></div>; })}</div> : <p className="py-6 text-center text-sm text-[#8794a5]">승인 대기 중인 계정이 없습니다.</p>}</CardContent></Card>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]"><Card className="border-[#dfe6ef]"><CardHeader><CardTitle>학생 상태</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>학생</TableHead><TableHead>학급</TableHead><TableHead>계정</TableHead><TableHead>상태</TableHead><TableHead className="text-right">처리</TableHead></TableRow></TableHeader><TableBody>{students.map((student) => <TableRow key={student.id}><TableCell><p className="font-semibold">{student.name}</p><p className="text-xs text-[#8390a1]">{student.studentNumber}</p></TableCell><TableCell>{data.classes.find((item) => item.id === student.classId)?.name}</TableCell><TableCell><Badge variant="outline" className={student.userId ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{student.userId ? "연결됨" : "미연결"}</Badge></TableCell><TableCell>{roleStatus(student)}</TableCell><TableCell className="text-right">{student.status === "active" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onStatus(student.id, "graduated", year)}>졸업 처리</Button> : student.status === "graduated" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onStatus(student.id, "active")}>재학으로 복원</Button> : "—"}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card><Card className="h-fit border-[#dfe6ef]"><CardHeader><CardTitle>권한 원칙</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="rounded-xl bg-blue-50 p-3"><p className="font-bold text-blue-800">학생</p><p className="mt-1 text-xs leading-5 text-blue-700">본인 자료 조회 · 질문·자기보고·정정 요청 작성. 확정 성적과 교사 관찰은 직접 수정할 수 없습니다.</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="font-bold text-emerald-800">학급 담임</p><p className="mt-1 text-xs leading-5 text-emerald-700">본인이 담당하는 학급의 학생만 조회·관리</p></div><div className="rounded-xl bg-violet-50 p-3"><p className="font-bold text-violet-800">학교 관리자</p><p className="mt-1 text-xs leading-5 text-violet-700">전체 학급·계정·재학생·졸업생 누적 자료 관리</p></div><div className="border-t border-[#e5eaf1] pt-4 text-xs leading-5 text-[#78869a]"><ShieldCheck className="mb-2 size-4 text-[#2457d6]" />졸업 처리는 삭제가 아닙니다. 학생 상태만 바뀌며 원본, 프로필 버전, 연구 흐름, 위키가 계속 남습니다.</div></CardContent></Card></div>
    </div>
  </>;
}
