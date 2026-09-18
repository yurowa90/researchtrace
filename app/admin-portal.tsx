"use client";

import * as React from "react";
import { BookOpenText, ClipboardList, Database, GraduationCap, LayoutDashboard, RefreshCw, ShieldCheck, Users, Plus, Upload, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { ClassDialog, StudentDialog } from "@/app/portal-views";
import { BulkStudentDialog } from "@/app/bulk-student-dialog";
import { ReferenceMaterialsView } from "@/app/reference-materials-view";
import { SchoolAccessPanel } from "@/app/school-access-panel";
import { SchoolBaselinePanel } from "@/app/school-baseline-panel";
import { SchoolBackupPanel } from "@/app/school-backup-panel";
import { StorageSettings } from "@/app/storage-settings";
import { AdminAccounts, AdminClasses, AdminGuide, StudentStatusDialog } from "@/app/admin-panels";
import { adminOverview, adminSections, studentWorkspaceUrl, type AdminSection } from "@/lib/admin-overview";
import { studentReadiness } from "@/lib/portal-workflow";
import type { AdminReport } from "@/lib/admin-data";
import type { Student } from "@/lib/portal-types";

const icons = { overview:LayoutDashboard, students:Users, classes:GraduationCap, accounts:ShieldCheck, references:BookOpenText, storage:Database, guide:ClipboardList };
const descriptions: Record<AdminSection,string> = {
  overview:"등록·자료 준비·계정 연결 상태를 확인하고 필요한 작업으로 이동합니다.",
  students:"학생을 등록하고 재학생·졸업생의 누적 자료를 관리합니다.",
  classes:"학년도별 학급을 만들고 승인된 교사에게 담당 학급을 배정합니다.",
  accounts:"학교 계정을 승인하고 사이트별 로그인 연결을 관리합니다.",
  references:"모집요강·평가 기준을 등록하고 적용 판본과 승인 상태를 관리합니다.",
  storage:"저장 위치를 확인하고 자료 점검·원본 포함 백업을 진행합니다.",
  guide:"학교 운영을 시작하는 순서와 학생·교사 사이트 연결 절차입니다.",
};
export type AdminExecute = (payload:Record<string,unknown>, message:string)=>Promise<void>;
export const nativeSelect = "h-11 min-w-0 rounded-lg border border-[#d8e1ec] bg-white px-3 text-sm text-[#102342] focus:outline-2 focus:outline-[#2457d6]";

export function AdminPortal() {
  const [report,setReport]=React.useState<AdminReport|null>(null);
  const [loading,setLoading]=React.useState(true), [error,setError]=React.useState("");
  const [section,setSection]=React.useState<AdminSection>("overview");
  const [busy,setBusy]=React.useState(false), [refreshing,setRefreshing]=React.useState(false);
  const lock=React.useRef(false), reloadLock=React.useRef(false);
  const [classDialog,setClassDialog]=React.useState(false), [studentDialog,setStudentDialog]=React.useState(false), [bulkDialog,setBulkDialog]=React.useState(false);
  const [statusStudent,setStatusStudent]=React.useState<Student|null>(null);
  const [query,setQuery]=React.useState(""), [year,setYear]=React.useState("all"), [classId,setClassId]=React.useState("all");
  const [status,setStatus]=React.useState("active"), [task,setTask]=React.useState("all"), [showExamples,setShowExamples]=React.useState(false), [page,setPage]=React.useState(1);
  const load=React.useCallback(async()=>{
    if(reloadLock.current)return false;
    reloadLock.current=true;setRefreshing(true);
    try {
      const response=await fetch("/api/admin",{cache:"no-store"});
      const result=await response.json() as AdminReport&{error?:string};
      if(!response.ok){if(response.status===401||response.status===403)setReport(null);throw new Error(result.error||"관리 자료를 불러오지 못했습니다.");}
      setReport(result);setError("");return true;
    } catch(e){setError(e instanceof Error?e.message:"관리 자료를 불러오지 못했습니다.");return false;}
    finally{setLoading(false);setRefreshing(false);reloadLock.current=false;}
  },[]);
  React.useEffect(()=>{void load();},[load]);
  React.useEffect(()=>{
    const sync=()=>{const value=new URLSearchParams(window.location.search).get("tab");setSection(adminSections.find(s=>s.id===value)?.id??"overview");};
    sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);
  },[]);
  React.useEffect(()=>{setPage(1);},[query,year,classId,status,task,showExamples]);
  const navigate=(next:AdminSection)=>{setSection(next);window.history.pushState(null,"",next==="overview"?"/":`/?tab=${next}`);window.scrollTo({top:0});};
  const execute:AdminExecute=async(payload,message)=>{
    if(lock.current||refreshing||error)throw new Error("최신 목록을 불러온 뒤 다시 처리하세요.");
    lock.current=true;setBusy(true);
    try {
      const response=await fetch("/api/admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"저장하지 못했습니다.");
      if(await load())toast.success(message);else toast.warning("저장은 완료됐습니다. 목록을 새로고침하여 결과를 확인하세요.");
    } catch(e){toast.error(e instanceof Error?e.message:"저장하지 못했습니다.");throw e;}
    finally{lock.current=false;setBusy(false);}
  };
  const refreshed=async()=>{await load();};
  const saveGuidance=async(payload:Record<string,unknown>)=>{
    if(lock.current||refreshing||error)throw new Error("최신 목록을 불러온 뒤 다시 처리하세요.");
    lock.current=true;setBusy(true);
    try{const response=await fetch("/api/guidance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"저장하지 못했습니다.");if(await load())toast.success("자료 기준을 저장했습니다.");else toast.warning("저장은 완료됐습니다. 목록을 다시 확인하세요.");}
    finally{lock.current=false;setBusy(false);}
  };
  if(loading)return <main className="mx-auto max-w-3xl p-8" aria-busy="true"><p className="text-sm text-[#65768b]">TRACE · 학교 관리자</p><h1 className="mt-3 text-2xl font-bold">학교 운영 현황을 불러옵니다</h1></main>;
  if(!report)return <main className="mx-auto max-w-xl space-y-5 p-8"><p className="text-sm text-[#65768b]">TRACE · 학교 관리자</p><h1 className="text-2xl font-bold">관리자 접근 확인</h1><p role="alert" className="leading-7">{error}</p><Button onClick={()=>void load()} disabled={refreshing}>다시 확인</Button><a className="ml-4 text-sm underline" href="/signout-with-chatgpt?return_to=%2F" target="_top">다른 계정으로 로그인</a></main>;

  const {data}=report, metrics=adminOverview(data), disabled=busy||refreshing||Boolean(error)||report.storage==="migrating";
  const showStudents=(nextStatus="active",nextTask="all")=>{setTask(nextTask);setQuery("");setYear("all");setClassId("all");setStatus(nextStatus);setShowExamples(false);navigate("students");};
  const openTask=(next:string)=>showStudents("active",next);
  const years=[...new Set(data.classes.map(c=>c.schoolYear))].sort((a,b)=>b-a);
  const matching=data.students.filter(s=>{
    if(!showExamples&&s.isExample)return false;
    const cls=data.classes.find(c=>c.id===s.classId);
    if(year!=="all"&&cls?.schoolYear!==Number(year))return false;
    if(classId!=="all"&&s.classId!==Number(classId))return false;
    if(status!=="all"&&s.status!==status)return false;
    if(query&&!`${s.studentNumber} ${s.name} ${s.email??""}`.toLowerCase().includes(query.trim().toLowerCase()))return false;
    const ready=studentReadiness(data,s);
    return task==="records"?ready.missingGrades.length>0:task==="profiles"?!ready.profile:task==="accounts"?!s.userId:task==="ready"?!ready.missingGrades.length&&Boolean(ready.profile):true;
  }).sort((a,b)=>a.studentNumber.localeCompare(b.studentNumber, "ko", {numeric:true})||a.id-b.id);
  const pageCount=Math.max(1,Math.ceil(matching.length/50)), currentPage=Math.min(page,pageCount), rows=matching.slice((currentPage-1)*50,currentPage*50);
  return <div className="admin-surface min-h-screen bg-[#f4f7fb] text-[#102342]">
    <Toaster position="top-right" richColors/>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#102b55] p-5 text-white lg:flex">
      <a href="/" className="flex items-center gap-3 py-2"><BookOpenText className="size-6 text-[#77e0c2]"/><span><span className="block text-xl font-bold tracking-tight">TRACE</span><span className="text-sm text-blue-100/80">학교 관리자</span></span></a>
      <nav aria-label="관리자 메뉴" className="mt-8 flex-1 space-y-1">{adminSections.map(item=>{const Icon=icons[item.id];return <button type="button" key={item.id} aria-current={section===item.id?"page":undefined} onClick={()=>navigate(item.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${section===item.id?"bg-white font-semibold text-[#102b55]":"text-blue-50/85 hover:bg-white/10"}`}><Icon className="size-4 shrink-0"/>{item.label}</button>;})}</nav>
      <a href="/workspace" className="flex min-h-11 items-center justify-between rounded-xl border border-white/20 p-3 text-sm hover:bg-white/10">학생 자료 열람<ArrowUpRight className="size-4"/></a>
      <p className="mt-4 text-sm leading-6 text-blue-100/75">학교 전체와 졸업생 자료를 관리합니다.</p>
    </aside>
    <div className="lg:pl-60">
      <header className="border-b border-[#dfe6ef] bg-white px-4 py-4 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">TRACE <span className="ml-2 text-sm font-normal text-[#65768b]">학교 관리자</span></p><div className="flex flex-wrap items-center gap-3 text-sm"><span>{data.viewer.displayName}</span><Button size="sm" variant="outline" disabled={busy||refreshing} onClick={()=>void load()}><RefreshCw className={`size-4 ${refreshing?"animate-spin":""}`}/>새로고침</Button><a className="underline underline-offset-4" href="/signout-with-chatgpt?return_to=%2F" target="_top">로그아웃</a></div></div><nav aria-label="모바일 관리자 메뉴" className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">{adminSections.map(s=><Button key={s.id} size="sm" variant={section===s.id?"default":"outline"} className="shrink-0" onClick={()=>navigate(s.id)}>{s.label}</Button>)}<Button asChild variant="outline" size="sm" className="shrink-0"><a href="/workspace">학생 자료 열람</a></Button></nav></header>
      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        <div><p className="text-sm font-medium text-[#65768b]">학교 운영</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{adminSections.find(s=>s.id===section)?.label}</h1><p className="mt-3 text-base leading-7 text-[#596d85]">{descriptions[section]}</p></div>
        {error&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">최신 자료를 불러오지 못해 변경 작업을 중단했습니다. 입력 내용은 유지됩니다. {error}</div>}
        {report.storage==="migrating"&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">구글 저장소로 이전 중입니다. 자료 조회는 가능하며 등록·승인은 이전 완료 후 사용할 수 있습니다.</p>}
        {section==="overview"&&<>
          <div className="flex flex-wrap gap-2"><Button disabled={disabled} onClick={()=>setClassDialog(true)} variant="outline"><Plus className="size-4"/>학급 추가</Button><Button disabled={disabled||!data.classes.length} onClick={()=>setBulkDialog(true)}><Upload className="size-4"/>엑셀로 학생 등록</Button><Button asChild variant="outline"><a href={studentWorkspaceUrl(undefined,"records")}>학생부 원본 등록</a></Button></div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[{label:"재학생",value:metrics.active,act:()=>showStudents("active")},{label:"졸업생",value:metrics.graduated,act:()=>showStudents("graduated")},{label:"원본·분석 준비",value:metrics.ready,act:()=>openTask("ready")},{label:"학교 계정 승인 대기",value:data.pendingUsers.length,act:()=>navigate("accounts")}].map(x=><button key={x.label} onClick={x.act} className="rounded-2xl border border-[#dfe6ef] bg-white p-5 text-left hover:border-[#2457d6]"><span className="text-sm text-[#596d85]">{x.label}</span><span className="mt-3 block text-3xl font-bold">{x.value}<span className="ml-1 text-sm font-normal text-[#65768b]">명</span></span></button>)}</div>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]"><section className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><h2 className="text-lg font-bold">확인할 작업</h2><p className="mt-2 text-sm leading-6 text-[#65768b]">예시 학생을 제외한 재학생 기준입니다.</p><div className="mt-4 divide-y">{[{label:"기본 학생부가 부족한 학생",value:metrics.missingRecords.length,act:()=>openTask("records")},{label:"활성 분석이 없는 학생",value:metrics.missingProfiles.length,act:()=>openTask("profiles")},{label:"학교 계정이 연결되지 않은 학생",value:metrics.unlinked.length,act:()=>openTask("accounts")},{label:"사이트 연결 승인 대기",value:report.pendingConnections,act:()=>navigate("accounts")}].map(x=><button key={x.label} onClick={x.act} className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-[#2457d6]"><span>{x.label}</span><span className="shrink-0 font-semibold">{x.value}건 · 보기</span></button>)}</div></section>
          <section className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><h2 className="text-lg font-bold">자료 보관과 사이트 연결</h2><p className="mt-4 font-semibold">{report.storage==="google"?"Google Drive·Sheets 사용 중":report.storage==="migrating"?"구글 저장소로 이전 중":"기존 사이트 저장소 사용 중"}</p><p className="mt-3 text-sm leading-6 text-[#65768b]">{report.storage==="google"?"같은 학교 저장소를 연결할 준비가 되어 있습니다. 교사 사이트의 공통 연결 설정과 계정 승인을 완료하면 같은 자료를 조회합니다.":"구글 연결·자료 이전을 완료하면 학생·교사 사이트에서도 같은 기록을 사용합니다. 현재 자료는 기존 저장소에 보존됩니다."}</p><Button className="mt-4" variant="outline" onClick={()=>navigate("storage")}>저장 위치·백업 확인</Button>{report.teacherUrl&&<Button asChild variant="outline" className="ml-2 mt-4"><a href={report.teacherUrl} target="_blank" rel="noreferrer">교사 사이트 열기<ArrowUpRight className="size-4"/></a></Button>}<div className="mt-5 border-t pt-4 text-sm leading-6 text-[#65768b]"><p>공용 자료 {data.referenceMaterials.filter(r=>r.status==="active").length}개 · 등록 학급 {data.classes.length}개</p><p>AI 분석은 Work에서 진행하고 결과를 가져옵니다.</p></div></section></div>
          {!metrics.active&&<section className="rounded-2xl border border-dashed border-[#bdcce0] p-5"><h2 className="font-semibold">실제 재학생을 등록하면 운영 현황이 표시됩니다</h2><p className="mt-2 text-base leading-7 text-[#65768b]">학급을 준비한 뒤 엑셀 양식을 받아 학번·이름·이메일을 채워 등록합니다. 예시 학생은 운영 수치에서 제외됩니다.</p></section>}
        </>}
        {section==="students"&&<>
          <div className="flex flex-wrap gap-2"><Button onClick={()=>setBulkDialog(true)} disabled={disabled||!data.classes.length}><Upload className="size-4"/>엑셀 일괄 등록</Button><Button variant="outline" onClick={()=>setStudentDialog(true)} disabled={disabled||!data.classes.length}><Plus className="size-4"/>학생 1명 등록</Button></div>
          {!data.classes.length&&<p className="text-sm">먼저 학급·담임 배정에서 학급을 추가하세요.</p>}
          <section className="rounded-2xl border border-[#dfe6ef] bg-white p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="space-y-2 text-sm"><span className="block">학번·이름·이메일</span><Input className="h-11" value={query} onChange={e=>setQuery(e.target.value)} placeholder="학생 검색"/></label><label className="space-y-2 text-sm"><span className="block">학년도</span><select className={`${nativeSelect} w-full`} value={year} onChange={e=>{setYear(e.target.value);setClassId("all");}}><option value="all">전체 학년도</option>{years.map(y=><option key={y} value={y}>{y}학년도</option>)}</select></label><label className="space-y-2 text-sm"><span className="block">학급</span><select className={`${nativeSelect} w-full`} value={classId} onChange={e=>setClassId(e.target.value)}><option value="all">전체 학급</option>{data.classes.filter(c=>year==="all"||c.schoolYear===Number(year)).map(c=><option key={c.id} value={c.id}>{c.schoolYear} · {c.name}</option>)}</select></label><label className="space-y-2 text-sm"><span className="block">재학 상태</span><select className={`${nativeSelect} w-full`} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">전체 상태</option><option value="active">재학생</option><option value="graduated">졸업생</option><option value="archived">보관 학생</option></select></label><label className="space-y-2 text-sm"><span className="block">자료 준비</span><select className={`${nativeSelect} w-full`} value={task} onChange={e=>setTask(e.target.value)}><option value="all">전체</option><option value="records">기본 학생부 부족</option><option value="profiles">활성 분석 없음</option><option value="accounts">학교 계정 미연결</option><option value="ready">원본·분석 준비됨</option></select></label></div><div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><p>검색 결과 {matching.length}명</p><label className="ml-auto flex items-center gap-2"><Checkbox checked={showExamples} onCheckedChange={v=>setShowExamples(v===true)}/>예시 학생 포함</label><Button variant="ghost" size="sm" onClick={()=>{setQuery("");setYear("all");setClassId("all");setStatus("active");setTask("all");setShowExamples(false);}}>조건 초기화</Button></div></section>
          <div className="overflow-x-auto rounded-2xl border border-[#dfe6ef] bg-white"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">학생 관리 목록</caption><thead className="border-b bg-[#edf2f8]"><tr>{["학생","학급","준비 상태","계정·재학","작업"].map(h=><th key={h} className="px-5 py-4 font-semibold">{h}</th>)}</tr></thead><tbody>{rows.map(s=>{const ready=studentReadiness(data,s);return <tr key={s.id} className="border-b last:border-0"><td className="px-5 py-4"><a className="font-semibold underline underline-offset-4" href={studentWorkspaceUrl(s.id)}>{s.name}</a>{s.isExample&&<span className="ml-2 text-[#65768b]">예시</span>}<p className="mt-1 text-[#65768b]">{s.studentNumber}</p><p className="mt-1 break-all text-[#65768b]">{s.email||"이메일 미등록"}</p></td><td className="px-5 py-4">{ready.classroom?.name??"학급 확인 필요"}<p className="mt-1 text-[#65768b]">{ready.classroom?.schoolYear}학년도</p></td><td className="px-5 py-4"><p>{ready.missingGrades.length?`${ready.missingGrades.join("·")}학년 원본 필요`:"기본 원본 등록"}</p><p className="mt-1 text-[#65768b]">{ready.profile?"활성 분석 있음":"활성 분석 없음"}</p>{ready.currentGradeIncluded&&<p className="mt-1 text-[#65768b]">현재 학년 원본 포함</p>}</td><td className="px-5 py-4"><p>{s.userId?"학교 계정 연결":"학교 계정 미연결"}</p><p className="mt-1 text-[#65768b]">{s.status==="active"?"재학":s.status==="graduated"?`${s.graduatedYear??""}년 졸업`:"보관"}</p></td><td className="px-5 py-4"><div className="flex flex-col items-start gap-2"><Button asChild size="sm" variant="outline"><a href={studentWorkspaceUrl(s.id,"records")}>원본·분석 열람</a></Button><Button size="sm" variant="ghost" disabled={disabled} onClick={()=>setStatusStudent(s)}>{s.status==="active"?"졸업 처리":"재학으로 복원"}</Button></div></td></tr>;})}</tbody></table>{!rows.length&&<p className="p-8 text-center text-base leading-7 text-[#65768b]">조건에 맞는 학생이 없습니다. 검색 조건을 초기화하거나 학생을 등록하세요.</p>}</div>
          <div className="flex items-center justify-end gap-3 text-sm"><span>{currentPage} / {pageCount}쪽 · 50명씩 표시</span><Button variant="outline" size="sm" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>이전</Button><Button variant="outline" size="sm" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}>다음</Button></div>
        </>}
        {section==="classes"&&<AdminClasses data={data} disabled={disabled} execute={execute} onAdd={()=>setClassDialog(true)}/>}
        {section==="accounts"&&<><AdminAccounts data={data} accounts={report.accounts} disabled={disabled} execute={execute}/><SchoolAccessPanel onChanged={refreshed} refreshKey={report.accounts.map(a=>`${a.id}:${a.role}:${a.status}`).join("|")}/></>}
        {section==="references"&&<ReferenceMaterialsView data={data} busy={disabled} onGuidanceSave={saveGuidance} onUploaded={refreshed} onAction={async payload=>{await execute(payload,"공용 평가 자료 설정을 저장했습니다.");}}/>}
        {section==="storage"&&<><StorageSettings onChanged={refreshed}/><SchoolBackupPanel/><SchoolBaselinePanel/></>}
        {section==="guide"&&<AdminGuide navigate={navigate}/>}
      </main>
    </div>
    {classDialog&&<ClassDialog open onOpenChange={setClassDialog} busy={disabled} admin staffUsers={data.staffUsers} onSave={async payload=>{try{await execute({action:"addClass",...payload},"학급을 추가했습니다.");setClassDialog(false);}catch{}}}/>}
    {studentDialog&&<StudentDialog open onOpenChange={setStudentDialog} classrooms={data.classes} defaultClassId={classId==="all"?null:Number(classId)} busy={disabled} onSave={async payload=>{try{await execute({action:"addStudent",...payload},"학생을 등록했습니다.");setStudentDialog(false);}catch{}}}/>}
    {bulkDialog&&<BulkStudentDialog open onOpenChange={setBulkDialog} existingStudents={data.students} classrooms={data.classes} defaultClassId={classId==="all"?null:Number(classId)} busy={disabled} onSave={async payload=>{await execute({action:"bulkAddStudents",...payload},`${payload.students.length}명을 등록했습니다.`);setBulkDialog(false);}}/>}
    {statusStudent&&<StudentStatusDialog student={statusStudent} data={data} disabled={disabled} onClose={()=>setStatusStudent(null)} execute={execute}/>}
  </div>;
}
