"use client";

import * as React from "react";
import {
  BarChart3,
  BookOpenText,
  FileJson,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListFilter,
  CircleHelp,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { QuickStart, UsageGuide } from "@/app/usage-guide";
import { WorkImportView } from "@/app/work-import-view";
import { StudentProfiles } from "@/app/student-profiles-view";
import { RecordsView } from "@/app/student-records-view";
import { ReferenceMaterialsView } from "@/app/reference-materials-view";
import { GuidanceView } from "@/app/guidance-view";
import { PlanningView } from "@/app/planning-view";
import { ActivityReviewView } from "@/app/activity-review-view";
import { StorageSettings } from "@/app/storage-settings";
import { SchoolBackupPanel } from "@/app/school-backup-panel";
import { SchoolBaselinePanel } from "@/app/school-baseline-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { BulkStudentDialog } from "@/app/bulk-student-dialog";
import { ClassDialog, PendingAccess, PortalError, PortalSkeleton, StudentDialog } from "@/app/portal-views";
import {
  AcademicsView,
  EvaluationView,
  FingerprintView,
  RecordOverview,
  SchoolSettings,
  WikiView,
} from "@/app/student-record-views";
import type { PortalData, ViewId } from "@/lib/portal-types";

const navItems: Array<{ id: ViewId; label: string; icon: LucideIcon; staffOnly?: boolean }> = [
  { id: "guidance", label: "다음 행동·피드백", icon: CircleHelp },
  { id: "planning", label: "진학·과목 계획", icon: GraduationCap },
  { id: "overview", label: "통합 현황", icon: LayoutDashboard },
  { id: "students", label: "학생 프로필", icon: Users },
  { id: "records", label: "학생부 원본", icon: FileText },
  { id: "academics", label: "교과·성적", icon: GraduationCap },
  { id: "activityReview", label: "활동 모아보기", icon: ListFilter },
  { id: "fingerprint", label: "연구지문", icon: Network },
  { id: "evaluation", label: "역량 점검", icon: BarChart3 },
  { id: "wiki", label: "LLM 위키", icon: BookOpenText },
  { id: "import", label: "Work 결과", icon: FileJson, staffOnly: true },
  { id: "references", label: "공용 평가 자료실", icon: BookOpenText, staffOnly: true },
  { id: "settings", label: "학교 설정", icon: Settings2, staffOnly: true },
  { id: "guide", label: "사용 안내", icon: CircleHelp },
];

async function apiAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json() as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(body.error ?? "요청을 처리하지 못했습니다.");
  return body;
}

export function ResearchPortal() {
  const [data, setData] = React.useState<PortalData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ViewId>("overview");
  React.useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [view]);
  const [query, setQuery] = React.useState("");
  const [classId, setClassId] = React.useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = React.useState<number | null>(null);
  const [studentDialog, setStudentDialog] = React.useState(false);
  const [bulkStudentDialog, setBulkStudentDialog] = React.useState(false);
  const [classDialog, setClassDialog] = React.useState(false);
  const guidanceLock = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [showExamples, setShowExamples] = React.useState(false);
  const dataRef = React.useRef<PortalData | null>(null);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/portal", { cache: "no-store" });
      const body = await response.json() as PortalData & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "자료를 불러오지 못했습니다.");
      setData(body); dataRef.current = body;
      setClassId((current) => current ?? (body.viewer.role === "admin" ? null : body.classes[0]?.id ?? null));
      setSelectedStudentId((current) => current ?? body.students[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "자료를 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  React.useEffect(() => {
    const doc = document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } };
    if (!doc.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(doc.modelContext.registerTool({
      name: "search_student_profiles",
      title: "학생 연구 프로필 검색",
      description: "현재 사용자가 열람할 수 있는 학생 이름, 학번, 연구 키워드, 프로필 문장을 검색합니다.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) {
        const value = typeof input === "object" && input && "query" in input ? String((input as { query: unknown }).query) : "";
        setQuery(value); setView("students");
        const current = dataRef.current;
        const matched = current?.students.filter((student) => `${student.name} ${student.studentNumber}`.includes(value)).map((student) => student.name) ?? [];
        return { query: value, matchedStudents: matched };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const execute = React.useCallback(async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try { const result = await apiAction(payload); await load(); toast.success(success); return result; }
    catch (caught) { const message = caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다."; toast.error(message); throw caught; }
    finally { setBusy(false); }
  }, [load]);

  if (loading) return <PortalSkeleton />;
  if (!data) return <PortalError message={error ?? "자료가 없습니다."} retry={load} />;
  if (data.viewer.status !== "approved") return <PendingAccess viewer={data.viewer} />;

  const admin = data.viewer.role === "admin";
  const staff = admin || data.viewer.role === "teacher";
  const currentClass = data.classes.find((item) => item.id === classId) ?? (admin && classId === null ? undefined : data.classes[0]);
  const visibleStudents = data.students.filter((student) => (!currentClass || student.classId === currentClass.id) && (!staff || showExamples || !student.isExample));
  const selectedVisibleId = selectedStudentId && visibleStudents.some((item) => item.id === selectedStudentId) ? selectedStudentId : visibleStudents[0]?.id ?? null;
  const openStudent = (id: number, destination: ViewId = "fingerprint") => { setSelectedStudentId(id); setView(destination); };

  const guideProps = { data, students: visibleStudents, onNavigate: setView, onAddClass: () => setClassDialog(true), onAddStudents: () => setBulkStudentDialog(true) };
  const saveGuidance = async (payload: Record<string,unknown>) => {
    if (busy || guidanceLock.current) throw new Error("저장 중입니다. 잠시 후 다시 시도하세요.");
    guidanceLock.current=true;setBusy(true);
    try { const response=await fetch("/api/guidance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??"저장하지 못했습니다.");await load();toast.success("기록과 변경 이력을 저장했습니다."); }
    finally {guidanceLock.current=false;setBusy(false);}
  };
  const content: Record<ViewId, React.ReactNode> = {
    guidance: <GuidanceView data={data} students={visibleStudents} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} busy={busy} onSave={saveGuidance}/>,
    planning: <PlanningView data={data} students={visibleStudents} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} busy={busy} onSave={saveGuidance}/>,
    references: <ReferenceMaterialsView data={data} busy={busy} onGuidanceSave={saveGuidance} onUploaded={load} onAction={(payload)=>execute(payload,"공용 평가 자료 설정을 저장했습니다.")} />,
    guide: <UsageGuide {...guideProps} />,
    overview: <><div className="mb-5 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{staff ? "학급 지도와 피드백" : "내가 이어갈 질문과 다음 행동"}</h2><Button onClick={()=>setView("guidance")}>다음 행동·피드백 열기</Button></div><p className="mt-3 text-sm text-[#65768b]">질문과 실행 결과를 남기고 교사의 피드백을 확인합니다. 근거를 확인할 자료는 연구지문에서 원문과 대조할 수 있습니다.</p></div><QuickStart {...guideProps} /><RecordOverview data={data} students={visibleStudents} staff={staff} admin={admin} onSelect={(id) => openStudent(id)} onNavigate={setView} /></>,
    students: <StudentProfiles data={data} students={visibleStudents} query={query} staff={staff} onOpen={openStudent} onClearQuery={() => setQuery("")} />,
    records: <RecordsView key={currentClass?.id ?? "all"} data={data} students={visibleStudents} staff={staff} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} onUploaded={load} />,
    academics: <AcademicsView data={data} students={visibleStudents} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} />,
    activityReview: <ActivityReviewView data={data} students={visibleStudents} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} onNavigate={setView} />,
    fingerprint: <FingerprintView data={data} students={visibleStudents} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} staff={staff} busy={busy} onActivate={async (snapshotId) => { await execute({ action: "activateProfileVersion", snapshotId }, "선택한 프로필 버전을 활성화했습니다.").catch(() => undefined); }} />,
    evaluation: <EvaluationView data={data} students={visibleStudents} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} />,
    wiki: <WikiView data={data} students={visibleStudents} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} />,
    import: <WorkImportView key={selectedVisibleId ?? "empty"} data={data} students={visibleStudents} onRecords={() => setView("records")} selectedStudentId={selectedVisibleId} onSelect={setSelectedStudentId} busy={busy} onImport={async (studentId, profile) => { await execute({ action: "importProfile", studentId, profile }, "Work 분석 결과를 새 버전으로 반영했습니다."); setSelectedStudentId(studentId); setView("fingerprint"); }} />,
    settings: <>{admin && <><SchoolBaselinePanel /><SchoolBackupPanel /><StorageSettings onChanged={load} /></>}<SchoolSettings data={data} students={visibleStudents} staff={staff} admin={admin} busy={busy} onAddClass={() => setClassDialog(true)} onAddStudent={() => setStudentDialog(true)} onBulkAddStudent={() => setBulkStudentDialog(true)} onStatus={async (studentId, status, graduatedYear) => { await execute({ action: "updateStudentStatus", studentId, status, graduatedYear }, status === "graduated" ? "졸업생으로 보존 처리했습니다." : "재학 상태로 복원했습니다.").catch(() => undefined); }} onApproveStudent={async (userId, studentId) => { await execute({ action: "approveUser", userId, studentId }, "학생 계정을 연결했습니다.").catch(() => undefined); }} onApproveTeacher={async (userId) => { await execute({ action: "approveTeacher", userId }, "담임 계정을 승인했습니다.").catch(() => undefined); }} onAssignClassTeacher={async (targetClassId, teacherId) => { await execute({ action: "assignClassTeacher", classId: targetClassId, teacherId }, "학급 담당자를 변경했습니다.").catch(() => undefined); }} /></>,
  };

  return <div className="min-h-screen bg-[#f4f7fb] text-[#102342]">
    <Toaster position="top-right" richColors />
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col bg-[#102b55] px-4 py-5 text-white lg:flex"><Brand /><div className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-[.14em] text-blue-200/70">Student intelligence</div><nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4" aria-label="주요 메뉴">{navItems.filter((item) => !item.staffOnly || staff).map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition ${view === item.id ? "bg-white text-[#153b75] shadow-sm" : "text-blue-50/80 hover:bg-white/10 hover:text-white"}`}><item.icon className="size-[17px]" />{item.label}</button>)}</nav><div className="mt-3 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-[#77e0c2]" /> 3단계 열람 권한</div><p className="mt-2 text-xs leading-5 text-blue-100/70">학생은 본인, 담임은 담당 학급, 관리자는 학교 전체와 졸업생을 조회합니다.</p></div></aside>
    <div className="lg:pl-[252px]"><header className="sticky top-0 z-20 border-b border-[#dde5f0] bg-white/95 backdrop-blur"><div className="flex min-h-[72px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 xl:px-9"><div className="lg:hidden"><Brand compact /></div><div className="relative ml-auto w-full max-w-[520px] lg:ml-0"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#78889d]" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setView("students"); }} onFocus={() => query && setView("students")} aria-label="학생·학번·연구 키워드 검색" className="h-11 bg-[#f8fafc] pl-10" placeholder="학생, 학번, 연구 키워드 검색" /></div>{staff && data.classes.length > 0 && <Select value={classId === null ? "all" : String(currentClass?.id ?? "all")} onValueChange={(value) => { const next = value === "all" ? null : Number(value); setClassId(next); const first = data.students.find((student) => next === null || student.classId === next); setSelectedStudentId(first?.id ?? null); }}><SelectTrigger aria-label="학급 범위 선택" className="h-11 w-full bg-white sm:w-[210px]"><SelectValue /></SelectTrigger><SelectContent>{admin && <SelectItem value="all">학교 전체</SelectItem>}{data.classes.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select>}<div className="hidden items-center gap-3 border-l border-[#e5eaf1] pl-4 md:flex"><span className="grid size-9 place-items-center rounded-full bg-[#dfe9fb] text-sm font-bold text-[#18458c]">{data.viewer.displayName.slice(0, 1)}</span><div><p className="max-w-28 truncate text-sm font-semibold">{data.viewer.displayName}</p><p className="text-xs text-[#77869a]">{admin ? "학교 관리자" : staff ? "학급 담임" : "학생"}</p></div></div></div><nav className="flex gap-1 overflow-x-auto border-t border-[#edf0f4] px-3 py-2 lg:hidden">{navItems.filter((item) => !item.staffOnly || staff).map((item) => <Button key={item.id} size="sm" variant={view === item.id ? "default" : "ghost"} onClick={() => setView(item.id)} className={view === item.id ? "bg-[#173a73]" : "text-[#5f6f83]"}><item.icon className="size-4" />{item.label}</Button>)}</nav>{staff && <div className="flex flex-wrap items-center gap-3 border-t border-[#edf0f4] px-4 py-2 text-sm sm:px-6 xl:px-9"><span className="text-[#62748b]">{currentClass?.name ?? "학교 전체"} · 표시 학생 {visibleStudents.length}명</span><label className="ml-auto flex items-center gap-2"><Checkbox checked={showExamples} onCheckedChange={(value) => setShowExamples(value === true)} />예시 학생 표시</label></div>}</header><main className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 xl:px-9 xl:py-8">{error && <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="flex-1">최신 자료를 다시 불러오지 못했습니다. 이전 화면과 입력 내용은 유지됩니다. {error}</p><Button variant="outline" size="sm" onClick={() => void load()}>다시 불러오기</Button></div>}{content[view]}</main></div>
    <StudentDialog open={studentDialog} onOpenChange={setStudentDialog} classrooms={data.classes} defaultClassId={currentClass?.id ?? null} busy={busy} onSave={async (payload) => { try { await execute({ action: "addStudent", ...payload }, "학생을 등록했습니다."); setStudentDialog(false); } catch { /* execute에서 오류를 표시하고 입력을 유지합니다. */ } }} />
    {bulkStudentDialog && <BulkStudentDialog existingStudents={data.students} open={bulkStudentDialog} onOpenChange={setBulkStudentDialog} classrooms={data.classes} defaultClassId={currentClass?.id ?? null} busy={busy} onSave={async (payload) => { await execute({ action: "bulkAddStudents", ...payload }, `${payload.students.length}명의 학생을 등록했습니다.`); setBulkStudentDialog(false); }} />}
    <ClassDialog open={classDialog} onOpenChange={setClassDialog} busy={busy} admin={admin} staffUsers={data.staffUsers} onSave={async (payload) => { try { await execute({ action: "addClass", ...payload }, "2·3학년 학급을 만들었습니다."); setClassDialog(false); } catch { /* execute에서 오류를 표시하고 입력을 유지합니다. */ } }} />
  </div>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`flex items-center ${compact ? "gap-2" : "gap-3 px-2"}`}><span className={`grid place-items-center rounded-xl bg-[#77e0c2] text-[#0d3f3a] ${compact ? "size-9" : "size-10"}`}><BookOpenText className="size-5" /></span>{!compact && <div><p className="text-lg font-bold tracking-[-.03em]">TRACE</p><p className="text-[11px] text-blue-100/70">학생부 연구 프로파일</p></div>}</div>;
}
