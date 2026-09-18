"use client";

import * as React from "react";
import { BookOpenText, ClipboardCheck, FileJson, FileText, GraduationCap, LayoutDashboard, MessageSquare, Network, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "@/components/ui/sonner";
import { GuidanceView } from "@/app/guidance-view";
import { PlanningView } from "@/app/planning-view";
import { RecordsView } from "@/app/student-records-view";
import { WorkImportView } from "@/app/work-import-view";
import { ReferenceMaterialsView } from "@/app/reference-materials-view";
import { ActivityReviewView } from "@/app/activity-review-view";
import { AcademicsView, EvaluationView, FingerprintView, WikiView } from "@/app/student-record-views";
import { StudentDialog } from "@/app/portal-views";
import { BulkStudentDialog } from "@/app/bulk-student-dialog";
import { TeacherGuide, TeacherHome, TeacherInbox, TeacherStudents, teacherSelect, type TeacherNavigate } from "@/app/teacher-panels";
import { isTeacherView, teacherUrl, teacherStudents, type TeacherFilter, type TeacherView } from "@/lib/teacher-overview";
import type { TeacherReport } from "@/lib/teacher-data";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";

const nav=[
  {id:"home",label:"오늘의 학급 지도",icon:LayoutDashboard},
  {id:"students",label:"담당 학생",icon:Users},
  {id:"inbox",label:"확인할 상담",icon:ClipboardCheck},
  {id:"guidance",label:"상담·관찰·피드백",icon:MessageSquare},
  {id:"records",label:"학생부 원본",icon:FileText},
  {id:"fingerprint",label:"학생 연구 기록",icon:Network},
  {id:"import",label:"Work 결과",icon:FileJson},
  {id:"references",label:"공용 평가 자료실",icon:BookOpenText},
  {id:"guide",label:"사용 안내",icon:GraduationCap},
] as const;
const researchTabs=[ ["fingerprint","연구지문"],["academics","교과·성적"],["activityReview","활동 모아보기"],["evaluation","역량 점검"],["wiki","LLM 위키"],["planning","진학·과목 계획"] ] as const;
type AccessState="loading"|"ready"|"setup"|"pending"|"forbidden"|"login"|"error";

export function TeacherPortal({adminUrl}:{adminUrl:string|null}) {
  const [report,setReport]=React.useState<TeacherReport|null>(null),[access,setAccess]=React.useState<AccessState>("loading");
  const [error,setError]=React.useState(""),[refreshing,setRefreshing]=React.useState(false),[busy,setBusy]=React.useState(false);
  const lock=React.useRef(false),reloadLock=React.useRef(false);
  const [view,setView]=React.useState<TeacherView>("home"),[selectedId,setSelectedId]=React.useState<number|null>(null),[entryKey,setEntryKey]=React.useState<string|undefined>();
  const [classId,setClassId]=React.useState<number|null>(null),[showExamples,setShowExamples]=React.useState(false),[filter,setFilter]=React.useState<TeacherFilter>("all");
  const [studentDialog,setStudentDialog]=React.useState(false),[bulkDialog,setBulkDialog]=React.useState(false);
  React.useEffect(()=>{
    const sync=()=>{const p=new URLSearchParams(window.location.search),v=p.get("view"),id=Number(p.get("student"));setView(isTeacherView(v)?v:"home");setSelectedId(Number.isSafeInteger(id)&&id>0?id:null);setEntryKey(p.get("entry")||undefined);};
    sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);
  },[]);
  const load=React.useCallback(async()=>{
    if(reloadLock.current)return false;
    reloadLock.current=true;setRefreshing(true);
    try {
      const response=await fetch("/api/teacher",{cache:"no-store"});
      const result=await response.json() as TeacherReport&{error?:string};
      if(!response.ok||result.state!=="ready") {
        const state=String(result.state);
        if(["setup","pending","forbidden","login"].includes(state)){setReport(null);setAccess(state as AccessState);setError(result.error??"");return false;}
        throw new Error(result.error??"교사 자료를 불러오지 못했습니다.");
      }
      setReport(result);setAccess("ready");setError("");return true;
    } catch(e){setError(e instanceof Error?e.message:"자료를 불러오지 못했습니다.");setAccess(current=>current==="ready"?current:"error");return false;}
    finally{reloadLock.current=false;setRefreshing(false);}
  },[]);
  React.useEffect(()=>{void load();},[load]);
  const navigate:TeacherNavigate=(next,id,key)=>{
    setView(next);setSelectedId(id??selectedId);setEntryKey(key);
    if(id){const student=report?.data.students.find(s=>s.id===id);if(student){setClassId(student.classId);if(student.isExample)setShowExamples(true);}}
    window.history.pushState(null,"",teacherUrl(next,id??selectedId??undefined,key));window.scrollTo({top:0});
  };
  const save=async(path:string,payload:Record<string,unknown>,message:string)=>{
    if(lock.current||refreshing||error||report?.storage==="migrating")throw new Error("최신 자료와 저장소 상태를 확인한 뒤 다시 저장하세요.");
    lock.current=true;setBusy(true);
    try {
      const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json() as {error?:string};
      if(!response.ok){if(response.status===401||response.status===403)await load();throw new Error(body.error??"저장하지 못했습니다.");}
      if(await load())toast.success(message);else toast.warning("저장은 완료됐습니다. 다시 불러와 결과를 확인하세요.");
    } catch(e) {toast.error(e instanceof Error?e.message:"저장하지 못했습니다.");throw e;}
    finally{lock.current=false;setBusy(false);}
  };
  const refreshed=async()=>{await load();};
  const saveGuidance=(body:Record<string,unknown>)=>save("/api/guidance",body,"기록과 피드백 이력을 저장했습니다.");
  const action=(body:Record<string,unknown>)=>save("/api/teacher",body,"변경 내용을 저장했습니다.");
  if(!report)return <TeacherAccess state={access} error={error} adminUrl={adminUrl} retry={()=>void load()} busy={refreshing}/>;

  const {data}=report;
  const scope=data.students.filter(s=>(!classId||s.classId===classId)&&(showExamples||!s.isExample));
  const active=teacherStudents({...data,students:scope},{examples:true});
  // A requested student outside the server scope must never silently become another student.
  const invalidStudent=selectedId!==null&&!data.students.some(s=>s.id===selectedId);
  const selected=selectedId!==null?data.students.find(s=>s.id===selectedId):active[0];
  const workStudents=selected&&!scope.some(s=>s.id===selected.id)?[selected,...scope]:scope;
  const selectedVisible=selected?.id??null;
  const disabled=busy||refreshing||!!error||report.storage==="migrating";
  const isResearch=researchTabs.some(([id])=>id===view);
  const selectionProps={data,students:workStudents,selectedStudentId:selectedVisible,onSelect:(id:number)=>navigate(view,id)};
  const panels:Partial<Record<TeacherView,React.ReactNode>>={
    home:<TeacherHome data={data} students={active} navigate={navigate} onFilter={f=>{setFilter(f);navigate("students");}}/>,
    students:<TeacherStudents data={data} students={scope} navigate={navigate} filter={filter} setFilter={setFilter} disabled={disabled} onAdd={()=>setStudentDialog(true)} onBulk={()=>setBulkDialog(true)}/>,
    inbox:<TeacherInbox data={data} students={active} navigate={navigate}/>,
    guidance:<GuidanceView key={`${selectedVisible}:${entryKey??""}`} {...selectionProps} initialEntryKey={entryKey} onSave={saveGuidance} busy={disabled}/>,
    planning:<PlanningView key={selectedVisible} {...selectionProps} allowAdministration={false} onSave={saveGuidance} busy={disabled}/>,
    records:<RecordsView key={classId??"all"} {...selectionProps} staff onUploaded={refreshed}/>,
    academics:<AcademicsView {...selectionProps}/>,
    activityReview:<ActivityReviewView {...selectionProps} onNavigate={v=>{if(isTeacherView(v))navigate(v);}}/>,
    fingerprint:<FingerprintView {...selectionProps} staff busy={disabled} onActivate={id=>action({action:"activateProfileVersion",snapshotId:id}).catch(()=>undefined)}/>,
    evaluation:<EvaluationView {...selectionProps}/>,wiki:<WikiView {...selectionProps}/>,
    import:<WorkImportView key={selectedVisible} {...selectionProps} onRecords={()=>navigate("records")} busy={disabled} onImport={async(studentId,profile)=>{await action({action:"importProfile",studentId,profile});navigate("fingerprint",studentId);}}/>,
    references:<ReferenceMaterialsView data={data} allowAdministration={false} busy={disabled} onGuidanceSave={saveGuidance} onUploaded={refreshed} onAction={action}/>,
    guide:<TeacherGuide adminUrl={adminUrl} navigate={navigate}/>,
  };
  const focused=["guidance","records","import",...researchTabs.map(([id])=>id)].includes(view);
  const navButtons=nav.map(n=><button key={n.id} type="button" aria-current={(view===n.id||(isResearch&&n.id==="fingerprint"))?"page":undefined} onClick={()=>navigate(n.id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition lg:w-full ${view===n.id||(isResearch&&n.id==="fingerprint")?"bg-[#d8eee4] font-semibold text-[#123f35]":"text-[#c4d9cf] hover:bg-white/10 hover:text-white"}`}><n.icon className="size-[18px]"/>{n.label}</button>);
  return <div className="min-h-screen bg-[#f5f8f5] text-[#183c33]"><Toaster position="top-right" richColors/>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col bg-[#153f3b] p-4 text-white lg:flex"><a href="/" className="flex items-center gap-3 px-3 py-4"><BookOpenText className="size-7 text-[#b5dfcb]"/><div><p className="text-xl font-semibold tracking-tight">TRACE</p><p className="mt-1 text-xs text-[#b3ccbe]">교사 지도실</p></div></a><nav aria-label="교사 주요 메뉴" className="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto">{navButtons}</nav><div className="mt-4 border-t border-white/15 px-3 pt-4 text-xs leading-6 text-[#b3ccbe]"><p>{data.viewer.displayName}</p><p>{data.viewer.role==="admin"?"관리자 · 교사 화면 이용 중":"담당 학급 자료만 열람"}</p>{data.viewer.role==="admin"&&adminUrl&&<a href={adminUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-white underline">관리자 사이트 열기</a>}<a href="/signout-with-chatgpt?return_to=%2F" target="_top" className="mt-2 block underline">로그아웃</a></div></aside>
    <div className="lg:pl-[236px]"><header className="sticky top-0 z-20 border-b border-[#dfe7e1] bg-white/95 backdrop-blur"><div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-7"><span className="mr-auto font-semibold">TRACE <span className="ml-2 text-sm font-normal text-[#64796f]">교사 지도실</span></span><select className={`${teacherSelect} w-full sm:w-60`} aria-label="담당 학급 선택" value={classId??"all"} disabled={busy} onChange={e=>{const next=e.target.value==="all"?null:Number(e.target.value);setClassId(next);setSelectedId(null);setEntryKey(undefined);window.history.replaceState(null,"",teacherUrl(view));}}><option value="all">{data.viewer.role==="admin"?"학교 전체 학급":"담당 학급 전체"}</option>{data.classes.map(c=><option key={c.id} value={c.id}>{c.schoolYear} · {c.name}</option>)}</select><Button variant="outline" size="sm" disabled={refreshing||busy} onClick={()=>void load()}><RefreshCw className={refreshing?"animate-spin":""}/>{refreshing?"확인 중":"새로고침"}</Button></div><nav aria-label="교사 모바일 메뉴" className="flex gap-1 overflow-x-auto bg-[#153f3b] px-3 py-2 lg:hidden">{navButtons}</nav></header>
    <main className="mx-auto max-w-[1460px] space-y-5 px-4 py-6 sm:px-7 lg:py-8"><div className="flex flex-wrap items-center gap-3 text-xs text-[#64796f]"><span>{classId?data.classes.find(c=>c.id===classId)?.name:data.viewer.role==="admin"?"학교 전체":"담당 학급 전체"} · 재학생 {active.length}명</span><label className="ml-auto flex items-center gap-2"><Checkbox checked={showExamples} onCheckedChange={v=>setShowExamples(v===true)}/>예시 학생 표시</label></div>
      {report.storage==="migrating"&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">공통 저장소로 자료를 옮기는 중입니다. 이전이 끝난 뒤 새로고침하고 저장하세요.</p>}
      {error&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">최신 자료를 불러오지 못했습니다. 이전 화면은 유지되며 저장은 잠시 멈췄습니다. {error}</p>}
      {!data.classes.length&&<p className="rounded-xl border bg-white p-5 text-sm leading-7">배정된 학급이 없습니다. 관리자에게 담당 학급 배정을 요청하세요. 배정 후 새로고침하면 학생 목록이 나타납니다.</p>}
      {focused&&selected&&<div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#cde1d5] bg-[#ecf5ef] px-4 py-3 text-sm"><span className="font-semibold">{selected.name} · {selected.studentNumber}</span><span className="text-[#64796f]">{data.classes.find(c=>c.id===selected.classId)?.name}</span><Button className="ml-auto" variant="ghost" size="sm" onClick={()=>navigate("students")}>학생 목록으로</Button></div>}
      {isResearch&&<nav aria-label="학생 연구 기록 탭" className="flex flex-wrap gap-2">{researchTabs.map(([id,label])=><Button key={id} size="sm" variant={view===id?"default":"outline"} onClick={()=>navigate(id)}>{label}</Button>)}</nav>}
      {focused&&invalidStudent?<section className="rounded-xl border bg-white p-6"><h1 className="text-xl font-semibold">열람 가능한 학생을 선택하세요</h1><p className="mt-3 text-sm leading-7">요청한 학생을 현재 권한에서 찾을 수 없습니다. 담당 학생 목록에서 다시 선택하세요.</p><Button className="mt-4" onClick={()=>{setSelectedId(null);setEntryKey(undefined);setView("students");window.history.replaceState(null,"",teacherUrl("students"));}}>담당 학생 목록</Button></section>:panels[view]}
    </main></div>
    <StudentDialog open={studentDialog} onOpenChange={setStudentDialog} classrooms={data.classes} defaultClassId={classId} busy={disabled} onSave={async body=>{try{await action({action:"addStudent",...body});setStudentDialog(false);}catch{/* Keep the form for correction. */}}}/>
    {bulkDialog&&<BulkStudentDialog open={bulkDialog} onOpenChange={setBulkDialog} classrooms={data.classes} existingStudents={data.students} defaultClassId={classId} busy={disabled} onSave={async body=>{await action({action:"bulkAddStudents",...body});setBulkDialog(false);}}/>}
  </div>;
}

function TeacherAccess({state,error,adminUrl,retry,busy}:{state:AccessState;error:string;adminUrl:string|null;retry:()=>void;busy:boolean}) {
  const titles:Record<AccessState,string>={loading:"담당 학급을 확인하고 있습니다",ready:"교사 지도실",setup:"학교 자료 연결 준비 중",pending:"학교 계정 연결 승인 대기",forbidden:"교사 접근 권한 확인",login:"로그인이 필요합니다",error:"자료를 불러오지 못했습니다"};
  return <main className="grid min-h-screen place-items-center bg-[#f5f8f5] px-5 py-10"><section className="w-full max-w-xl rounded-2xl border border-[#dce5de] bg-white p-7 sm:p-9"><BookOpenText className="size-8 text-[#167666]"/><p className="mt-5 text-sm font-medium text-[#167666]">TRACE · 교사 지도실</p><h1 className="mt-3 text-2xl font-semibold text-[#183c33]">{titles[state]}</h1><div className="mt-4 space-y-3 text-sm leading-7 text-[#64796f]">{state==="setup"?<><p>관리자가 Google Drive·Sheets 공통 저장소 연결을 완료하면 담당 학급의 학생부와 상담 기록을 여기에서 함께 사용할 수 있습니다.</p><ol className="list-decimal space-y-2 pl-5"><li>관리자 사이트에서 Google 연결과 기존 자료 이전 완료</li><li>교사 사이트에 학교 공통 저장소 연결 설정</li><li>교사 로그인 후 사이트 계정 연결 승인과 학급 배정</li></ol></>:state==="pending"?<p>로그인 요청이 등록되었습니다. 관리자에게 교사 학교 계정과 이 사이트의 로그인 연결 승인을 요청하세요. 승인 후 아래 버튼으로 다시 확인할 수 있습니다.</p>:<p role={state==="error"||state==="forbidden"?"alert":undefined}>{error||"승인된 학교 계정과 담당 학급 정보를 확인합니다."}</p>}</div><div className="mt-6 flex flex-wrap gap-3">{state!=="loading"&&<Button onClick={retry} disabled={busy}>{busy?"확인 중…":"연결·승인 상태 다시 확인"}</Button>}{state==="login"&&<Button asChild variant="outline"><a href={chatGPTSignInPath("/")} target="_top">로그인</a></Button>}{adminUrl&&state!=="loading"&&<Button asChild variant="outline"><a href={adminUrl} target="_blank" rel="noreferrer">관리자 사이트</a></Button>}</div>{["forbidden","pending"].includes(state)&&<a href="/signout-with-chatgpt?return_to=%2F" target="_top" className="mt-5 inline-block text-sm text-[#64796f] underline">다른 계정으로 로그인</a>}</section></main>;
}
