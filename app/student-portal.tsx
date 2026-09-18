"use client";

import * as React from "react";
import { BookOpenText, Compass, FileText, GraduationCap, LayoutDashboard, MessageSquareText, NotebookPen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { PlanningView } from "@/app/planning-view";
import { RecordsView } from "@/app/student-records-view";
import { ActivityReviewView } from "@/app/activity-review-view";
import { AcademicsView,EvaluationView,FingerprintView,WikiView } from "@/app/student-record-views";
import { StudentHome,StudentFeedback,StudentJournal,StudentGuide,StudentHeading,studentCard,type StudentNavigate } from "@/app/student-panels";
import { isStudentView,studentViews,studentUrl,type StudentView } from "@/lib/student-overview";
import type { StudentReport } from "@/lib/student-data";
import type { GuidanceEntry } from "@/lib/guidance";

const nav=[{id:"home",label:"오늘 할 일",icon:LayoutDashboard},{id:"journal",label:"내 질문·실행 기록",icon:NotebookPen},{id:"feedback",label:"선생님 피드백",icon:MessageSquareText},{id:"fingerprint",label:"나의 연구 기록",icon:Compass},{id:"records",label:"학생부 원본",icon:FileText},{id:"guide",label:"사용 안내",icon:GraduationCap}] as const;
const researchTabs=[["fingerprint","연구지문"],["academics","교과·성적"],["activityReview","활동 모아보기"],["evaluation","역량 점검"],["wiki","LLM 위키"],["planning","진학·과목 계획"]] as const;
type Access="loading"|"ready"|"choose"|"unlinked"|"setup"|"pending"|"forbidden"|"login"|"error";
type Ready=Extract<StudentReport,{state:"ready"}>;

export function StudentPortal({adminUrl}:{adminUrl:string|null}) {
  const [report,setReport]=React.useState<StudentReport|null>(null),[access,setAccess]=React.useState<Access>("loading"),[error,setError]=React.useState("");
  const [view,setView]=React.useState<StudentView>("home"),[entryKey,setEntryKey]=React.useState<string|undefined>(),[refreshing,setRefreshing]=React.useState(false),[busy,setBusy]=React.useState(false);
  const requested=React.useRef<number|undefined>(undefined),requestSeq=React.useRef(0),lock=React.useRef(false),readyRef=React.useRef<Ready|null>(null);
  readyRef.current=report?.state==="ready"?report:null;
  const load=React.useCallback(async(id=requested.current)=>{
    const sequence=++requestSeq.current;setRefreshing(true);
    try {
      const response=await fetch(`/api/student${id!==undefined?`?student=${id}`:""}`,{cache:"no-store"});
      const body=await response.json() as StudentReport&{error?:string};
      if(sequence!==requestSeq.current)return false;
      if(response.ok&&["ready","choose","unlinked"].includes(body.state)){setReport(body);setAccess(body.state);setError("");return true;}
      if(["setup","pending","forbidden","login"].includes(String(body.state))){setReport(null);setAccess(body.state as Access);setError(body.error??"");return false;}
      throw new Error(body.error??"자료를 불러오지 못했습니다.");
    } catch(e){if(sequence===requestSeq.current){setError(e instanceof Error?e.message:"자료를 불러오지 못했습니다.");setAccess(current=>current==="ready"?current:"error");}return false;}
    finally{if(sequence===requestSeq.current)setRefreshing(false);}
  },[]);
  React.useEffect(()=>{
    const sync=()=>{const p=new URLSearchParams(window.location.search),v=p.get("view"),raw=p.get("student");setView(isStudentView(v)?v:"home");setEntryKey(p.get("entry")||undefined);requested.current=raw===null?undefined:Number(raw);setReport(null);setAccess("loading");void load();};
    sync();window.addEventListener("popstate",sync);return()=>{requestSeq.current++;window.removeEventListener("popstate",sync);};
  },[load]);
  const navigate:StudentNavigate=(next,key)=>{setView(next);setEntryKey(key);window.history.pushState(null,"",studentUrl(next,requested.current,key));window.scrollTo({top:0});};
  const navigateRef=React.useRef(navigate);navigateRef.current=navigate;
  React.useEffect(()=>{
    const context=(document as Document&{modelContext?:{registerTool:(tool:Record<string,unknown>,options?:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    try {void Promise.resolve(context.registerTool({name:"navigate_my_student_record",title:"나의 학생 화면 열기",description:"현재 로그인 학생 또는 관리자가 선택한 학생의 화면을 엽니다. 자료를 변경하거나 제출하지 않습니다.",inputSchema:{type:"object",properties:{view:{type:"string",enum:studentViews}},required:["view"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input:unknown){if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length!==1||!("view" in input)||!isStudentView(input.view))throw new Error("학생 메뉴를 확인하세요.");if(!readyRef.current)throw new Error("학생 연결과 로그인을 먼저 확인하세요.");navigateRef.current(input.view);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));return {view:input.view,changedRecords:false};}},{signal:lifecycle.signal})).catch(()=>undefined);}catch{/* Browser support is optional. */}
    return()=>lifecycle.abort();
  },[]);
  const save=async(body:Record<string,unknown>)=>{
    if(lock.current||refreshing||error||report?.state!=="ready"||report.readOnly||report.storage==="migrating")throw new Error("저장할 수 있는 계정과 최신 자료 상태를 확인하세요.");
    lock.current=true;setBusy(true);
    try {const response=await fetch("/api/student",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??"저장하지 못했습니다.");if(await load())toast.success(body.intent==="submit"?"선생님께 실행 결과를 제출했습니다.":"기록을 저장했습니다.");else toast.warning("저장은 완료됐습니다. 새로고침으로 결과를 확인하세요.");}
    catch(e){toast.error(e instanceof Error?e.message:"저장하지 못했습니다.");throw e;}
    finally{lock.current=false;setBusy(false);}
  };
  const choose=(id:number)=>{requested.current=id;setReport(null);setAccess("loading");setView("home");setEntryKey(undefined);window.history.pushState(null,"",studentUrl("home",id));void load(id);};
  if(report?.state==="choose")return <main className="min-h-screen bg-[#f5f7fb] p-5 sm:p-10"><div className="mx-auto max-w-3xl space-y-6"><StudentHeading eyebrow="TRACE · 관리자 학생 화면 확인" title="열람할 학생을 선택하세요">학생에게 공유되는 자료만 확인합니다. 기록 작성과 교사 피드백은 해당 관리 화면을 이용하세요.</StudentHeading><div className={studentCard}>{report.choices.length?<ul className="divide-y">{report.choices.map(s=><li key={s.id}><button className="flex w-full flex-wrap justify-between gap-2 py-4 text-left hover:text-[#5466a8]" onClick={()=>choose(s.id)}><span className="font-medium">{s.name} · {s.studentNumber}</span><span className="text-sm text-[#627086]">{s.className}</span></button></li>)}</ul>:<p>등록된 학생이 없습니다. 관리자 사이트에서 명단을 먼저 등록하세요.</p>}</div>{adminUrl&&<a className="inline-block text-sm underline" href={adminUrl}>관리자 사이트</a>}</div></main>;
  if(report?.state!=="ready")return <StudentAccess state={access} error={error} retry={()=>void load()} busy={refreshing}/>;
  const {data,readOnly}=report,student=data.students[0],research=researchTabs.some(([id])=>id===view),disabled=busy||refreshing||!!error||readOnly||report.storage==="migrating";
  const selection={data,students:data.students,selectedStudentId:student.id,onSelect:()=>undefined};
  const history=async(key:string)=>{const p=new URLSearchParams({history:key});if(requested.current)p.set("student",String(requested.current));const response=await fetch(`/api/student?${p}`,{cache:"no-store"});const result=await response.json() as {history:GuidanceEntry[];error?:string};if(!response.ok)throw new Error(result.error??"이력을 불러오지 못했습니다.");return result.history;};
  const panels:Record<StudentView,React.ReactNode>={
    home:<StudentHome data={data} navigate={navigate} readOnly={readOnly}/>,journal:<StudentJournal key={student.id} data={data} entryKey={entryKey} navigate={navigate} onSave={save} busy={disabled} readOnly={readOnly} onHistory={history}/>,feedback:<StudentFeedback data={data} navigate={navigate}/>,guide:<StudentGuide navigate={navigate}/>,
    fingerprint:<FingerprintView {...selection} staff={false} busy onActivate={async()=>undefined}/>,academics:<AcademicsView {...selection}/>,activityReview:<ActivityReviewView {...selection} onNavigate={v=>{if(isStudentView(v))navigate(v);}}/>,evaluation:<EvaluationView {...selection}/>,wiki:<WikiView {...selection}/>,
    planning:<fieldset disabled={readOnly} className="min-w-0"><PlanningView {...selection} allowAdministration={false} studentMode busy={disabled} onSave={save}/></fieldset>,records:<RecordsView {...selection} staff={false} onUploaded={async()=>{await load();}}/>,
  };
  const buttons=nav.map(n=>{const active=view===n.id||(research&&n.id==="fingerprint");return <button type="button" key={n.id} aria-current={active?"page":undefined} onClick={()=>navigate(n.id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition lg:w-full ${active?"bg-[#e2e8fb] font-semibold text-[#253766]":"text-[#bdc7e0] hover:bg-white/10 hover:text-white"}`}><n.icon className="size-[18px]"/>{n.label}</button>;});
  return <div className="min-h-screen bg-[#f5f7fb] text-[#253149]"><Toaster position="top-right" richColors/><aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col bg-[#25314d] p-4 text-white lg:flex"><a href="/" className="flex items-center gap-3 px-3 py-4"><BookOpenText className="size-7 text-[#b6c5ef]"/><div><p className="text-xl font-semibold tracking-tight">TRACE</p><p className="mt-1 text-xs text-[#bdc7e0]">나의 탐구 기록</p></div></a><nav aria-label="학생 주요 메뉴" className="mt-7 flex-1 space-y-1">{buttons}</nav><div className="border-t border-white/15 px-3 pt-4 text-xs leading-6 text-[#bdc7e0]"><p>{readOnly?"관리자 · 학생 화면 확인":`${student.name} · ${student.studentNumber}`}</p><p>나의 질문에서 시작되는 탐구</p><a href="/signout-with-chatgpt?return_to=%2F" target="_top" className="mt-2 inline-block underline">로그아웃</a></div></aside>
    <div className="lg:pl-[236px]"><header className="sticky top-0 z-20 border-b border-[#e0e5ed] bg-white/95 backdrop-blur"><div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-7"><span className="mr-auto font-semibold">TRACE <span className="ml-2 text-sm font-normal text-[#627086]">나의 탐구 기록</span></span><span className="text-sm text-[#627086]">{student.name} · {data.classes[0]?.name}</span><Button variant="outline" size="sm" disabled={refreshing||busy} onClick={()=>void load()}><RefreshCw className={refreshing?"animate-spin":""}/>{refreshing?"확인 중":"새로고침"}</Button><a href="/signout-with-chatgpt?return_to=%2F" target="_top" className="text-xs underline lg:hidden">로그아웃</a></div><nav aria-label="학생 모바일 메뉴" className="flex gap-1 overflow-x-auto bg-[#25314d] px-3 py-2 lg:hidden">{buttons}</nav></header>
      <main className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 sm:px-7 lg:py-8">
        {readOnly&&<div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d5def1] bg-[#edf1fc] p-4 text-sm"><span>관리자 열람 화면 · 학생에게 공유되는 자료만 표시합니다.</span><select aria-label="열람할 학생" className="ml-auto min-h-9 max-w-full rounded-lg border bg-white px-2" value={student.id} onChange={e=>choose(Number(e.target.value))}>{report.choices.map(s=><option key={s.id} value={s.id}>{s.className} · {s.studentNumber} · {s.name}</option>)}</select>{adminUrl&&<a className="underline" href={adminUrl}>관리자 사이트</a>}</div>}
        {report.storage==="migrating"&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">학교 자료를 옮기는 중입니다. 완료 후 새로고침하면 기록을 저장할 수 있습니다.</p>}
        {error&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">최신 자료를 불러오지 못했습니다. 화면은 유지되며 저장은 잠시 멈췄습니다. {error}</p>}
        {research&&<nav aria-label="나의 연구 기록 탭" className="flex flex-wrap gap-2">{researchTabs.map(([id,label])=><Button key={id} variant={view===id?"default":"outline"} size="sm" onClick={()=>navigate(id)}>{label}</Button>)}</nav>}
        {panels[view]}
      </main>
    </div>
  </div>;
}
function StudentAccess({state,error,retry,busy}:{state:Access;error:string;retry:()=>void;busy:boolean}) {
  const titles:Record<Access,string>={loading:"나의 자료를 확인하고 있습니다",ready:"나의 탐구 기록",choose:"학생 화면 확인",unlinked:"학생 명단 연결이 필요합니다",setup:"학교 자료 연결 준비 중",pending:"학생 계정 연결 승인 대기",forbidden:"학생 접근 권한 확인",login:"로그인이 필요합니다",error:"자료를 불러오지 못했습니다"};
  const messages:Partial<Record<Access,string>>={setup:"학교 관리자가 공통 저장소를 연결하면 나의 학생부와 탐구 기록을 볼 수 있습니다. 연결 완료 안내를 받은 뒤 다시 접속하세요.",pending:"로그인 요청이 등록되었습니다. 담당 선생님 또는 관리자에게 학번·이름·로그인 이메일을 알려 학생 명단 연결을 요청하세요. 승인 후 아래 버튼으로 다시 확인할 수 있습니다.",unlinked:"로그인은 승인되었지만 학생 명단에 아직 연결되지 않았습니다. 관리자에게 학번·이름과 로그인 이메일을 알려 주세요. 연결 전에는 학생 자료가 표시되지 않습니다.",loading:"로그인과 학교 계정 연결 상태를 확인합니다.",login:"학교에서 확인한 학생 계정으로 로그인하세요."};
  return <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-5 py-10"><section className="w-full max-w-xl rounded-2xl border border-[#e0e5ed] bg-white p-7 sm:p-9"><BookOpenText className="size-8 text-[#5466a8]"/><p className="mt-5 text-sm font-medium text-[#5466a8]">TRACE · 나의 탐구 기록</p><h1 className="mt-3 text-2xl font-semibold text-[#253149]">{titles[state]}</h1><p role={state==="error"||state==="forbidden"?"alert":undefined} className="mt-4 text-base leading-7 text-[#627086]">{messages[state]||error||"승인된 학생 계정으로 접속하세요."}</p>{state!=="loading"&&<div className="mt-6 flex flex-wrap gap-3"><Button onClick={retry} disabled={busy}>{busy?"확인 중…":"연결·승인 상태 다시 확인"}</Button>{state==="login"&&<Button asChild variant="outline"><a href="/signin-with-chatgpt?return_to=%2F" target="_top">로그인</a></Button>}</div>}{["forbidden","pending","unlinked"].includes(state)&&<a href="/signout-with-chatgpt?return_to=%2F" target="_top" className="mt-5 inline-block text-sm text-[#627086] underline">다른 계정으로 로그인</a>}</section></main>;
}
