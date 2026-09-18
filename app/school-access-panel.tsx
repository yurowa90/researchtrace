"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SchoolSite } from "@/lib/site-runtime";
import type { LoginIdentity } from "@/lib/school-identities";

type Account={id:number;displayName:string;email:string;role:string;status:string};
type Link=Omit<LoginIdentity,"subject">;
type Report={site:SchoolSite;storage:"legacy"|"migrating"|"google";identitySchemaReady:boolean;currentIdentityId:number|null;accounts:Account[];students:{id:number;name:string;studentNumber:string;email:string|null;userId:number|null;className:string}[];identities:Link[];events:{id:number;identityId:number;action:string;actorId:number;targetUserId:number|null;note:string;createdAt:string}[]};
const modes={unified:"통합 사이트",student:"학생 사이트",teacher:"교사 사이트",admin:"관리자 사이트"};
const statuses={pending:"연결 승인 대기",approved:"연결됨",rejected:"연결 거절",revoked:"연결 해제"};
const roles:Record<string,string>={student:"학생",teacher:"담임",admin:"관리자"};

function IdentityRow({row,report,busy,onReview}:{row:Link;report:Report;busy:boolean;onReview:(body:Record<string,unknown>)=>Promise<boolean>}) {
  const [accountId,setAccountId]=React.useState(row.userId?String(row.userId):"");
  const [note,setNote]=React.useState(""),[confirmTeacher,setConfirmTeacher]=React.useState(false);
  const [studentId,setStudentId]=React.useState(""),[confirmStudent,setConfirmStudent]=React.useState(false);
  const current=row.id===report.currentIdentityId;
  const account=report.accounts.find(a=>a.id===row.userId);
  const send=async(action:string)=>{if(await onReview({identityId:row.id,expectedRevision:row.revision,action,userId:accountId?Number(accountId):null,note,confirmTeacher,studentId:studentId?Number(studentId):null,confirmStudent}))setNote("");};
  return <div className="rounded-xl border border-[#dfe6ef] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{row.displayName} <span className="ml-2 text-sm font-normal text-[#65768b]">{modes[row.portalMode]}</span></p><p className="mt-1 break-all text-sm text-[#65768b]">{row.email}</p></div><span className={`rounded-md px-2 py-1 text-sm ${row.status==="approved"?"bg-emerald-50 text-emerald-800":"bg-slate-100 text-slate-700"}`}>{statuses[row.status]}{current?" · 현재 로그인":""}</span></div>
    <p className="mt-3 text-sm leading-6">학교 계정: {account?`${account.displayName} · ${roles[account.role]??account.role}${account.status!=="approved"?" · 학교 계정 승인 대기 또는 정지":""}`:"아직 연결되지 않았습니다."}</p>
    <details className="mt-2 text-sm text-[#65768b]"><summary className="cursor-pointer">연결 정보</summary><p className="mt-2 break-all">사이트 식별자: {row.siteId}</p><p>요청 시각: {row.createdAt}</p>{row.verificationNote&&<p className="mt-1">최근 확인 근거: {row.verificationNote}</p>}</details>
    {!current&&<div className="mt-4 space-y-3">
      {row.status!=="approved"&&<Select value={accountId} onValueChange={v=>setAccountId(v??"")} disabled={busy}><SelectTrigger aria-label={`${row.displayName} 연결할 학교 계정`} className="h-auto min-h-10 w-full"><SelectValue placeholder="본인 확인 후 기존 학교 계정 선택"/></SelectTrigger><SelectContent>{report.accounts.filter(a=>a.status==="approved"&&(!row.userId||a.id===row.userId)&&(a.role==="admin"||row.portalMode==="unified"||a.role===row.portalMode)).map(a=><SelectItem key={a.id} value={String(a.id)}>{a.displayName} · {roles[a.role]??a.role} · {a.email}</SelectItem>)}</SelectContent></Select>}
      <Input aria-label={`${row.displayName} 본인 확인 근거 또는 처리 사유`} value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="본인 확인 근거 또는 연결 해제 사유" disabled={busy}/>
      <div className="flex flex-wrap gap-2">{row.status!=="approved"&&<Button size="sm" disabled={busy||!accountId||note.trim().length<3} onClick={()=>void send("approve")}>학교 계정에 연결</Button>}{row.status==="pending"&&<Button size="sm" variant="outline" disabled={busy||note.trim().length<3} onClick={()=>void send("reject")}>연결 거절</Button>}{row.status==="approved"&&<Button size="sm" variant="outline" disabled={busy||note.trim().length<3} onClick={()=>void send("revoke")}>이 사이트 연결 해제</Button>}</div>
      {report.storage==="google"&&row.portalMode==="student"&&row.status==="pending"&&!row.userId&&<div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm leading-6"><p>등록 명단의 학번·이름과 학생 본인을 확인한 뒤 연결합니다. 학교 계정 생성 또는 승인과 명단 연결을 함께 저장합니다.</p><select className="min-h-10 w-full rounded-lg border bg-white px-3" aria-label={`${row.displayName} 연결할 등록 학생`} value={studentId} disabled={busy} onChange={e=>setStudentId(e.target.value)}><option value="">본인 확인 후 등록 학생 선택</option>{report.students.filter(s=>s.email?.trim().toLowerCase()===row.email.trim().toLowerCase()).map(s=><option key={s.id} value={s.id}>{s.className} · {s.studentNumber} · {s.name}</option>)}</select>{!report.students.some(s=>s.email?.trim().toLowerCase()===row.email.trim().toLowerCase())&&<p>일치하는 이메일의 등록 학생이 없습니다. 학생 명단을 등록하거나 이메일을 확인하세요.</p>}<label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={busy} checked={confirmStudent} onChange={e=>setConfirmStudent(e.target.checked)}/>선택한 학생의 학번·이름·이메일과 본인을 확인했습니다.</label><Button size="sm" variant="outline" disabled={busy||!studentId||!confirmStudent||note.trim().length<3||note.trim().length>450} onClick={()=>void send("registerStudent")}>학생 명단·로그인 연결</Button><p className="text-xs text-[#65768b]">위 확인 근거를 450자 이내로 남기세요. 기존 기록은 그대로 이어집니다.</p></div>}
      {report.storage==="google"&&row.portalMode==="teacher"&&row.status==="pending"&&!row.userId&&<div className="rounded-xl bg-slate-50 p-4 text-sm leading-6">{report.accounts.some(a=>a.email.trim().toLowerCase()===row.email.trim().toLowerCase())?<p>같은 이메일의 학교 계정이 있습니다. 위 학교 계정 승인 화면에서 역할과 상태를 먼저 확인한 뒤 기존 계정에 연결하세요.</p>:<><p>기존 학교 계정이 없는 교사입니다. 본인 확인 후 교사 계정을 만들고 이 로그인에 연결할 수 있습니다.</p><label className="mt-3 flex items-start gap-2"><input type="checkbox" className="mt-1" checked={confirmTeacher} disabled={busy} onChange={e=>setConfirmTeacher(e.target.checked)}/>학교 소속 교사 본인을 확인했으며 교사 권한 부여에 동의합니다.</label><Button className="mt-3" size="sm" variant="outline" disabled={busy||!confirmTeacher||note.trim().length<3||note.trim().length>450} onClick={()=>void send("registerTeacher")}>새 교사 계정 생성 후 연결</Button><p className="mt-2 text-xs text-[#65768b]">위 확인 근거를 450자 이내로 남기세요. 연결 후 학급·담임 배정에서 담당 학급을 지정합니다.</p></>}</div>}
    </div>}
  </div>;
}
export function SchoolAccessPanel({onChanged,refreshKey}:{onChanged?:()=>Promise<void>;refreshKey?:string} = {}) {
  const [report,setReport]=React.useState<Report|null>(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(""),[message,setMessage]=React.useState("");
  const lock=React.useRef(false);
  const refresh=React.useCallback(async()=>{const response=await fetch("/api/school-access",{cache:"no-store"});const body=await response.json() as Report&{error?:string};if(!response.ok)throw new Error(body.error||"연결 현황을 읽지 못했습니다.");setReport(body);},[]);
  React.useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:"연결 현황을 읽지 못했습니다."));},[refresh,refreshKey]);
  const review=async(body:Record<string,unknown>)=>{
    if(lock.current)return false;lock.current=true;setBusy(true);setError("");setMessage("");
    try{const response=await fetch("/api/school-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"계정 연결을 처리하지 못했습니다.");await refresh();await onChanged?.();setMessage("계정 연결 상태와 처리 이력을 저장했습니다.");return true;}
    catch(e){setError(e instanceof Error?e.message:"계정 연결을 처리하지 못했습니다.");return false;}
    finally{lock.current=false;setBusy(false);}
  };
  return <Card className="mb-5 border-[#c5d5e7]"><CardContent className="space-y-4 p-5">
    <div className="flex flex-wrap justify-between gap-3"><div><p className="mb-1 text-sm font-semibold text-[#2457d6]">사이트별 로그인 연결</p><h2 className="text-xl font-bold">공통 계정 연결</h2></div><Button variant="outline" disabled={busy} onClick={()=>{setError("");void refresh().catch(e=>setError(e.message));}}>연결 현황 새로고침</Button></div>
    <p className="text-base leading-7 text-[#65768b]">사이트가 나뉘어도 기존 학교 계정과 학생 기록을 이어서 사용합니다. 다른 사이트에서 들어온 연결 요청은 본인 확인 후 승인합니다. 이메일이 같아도 자동으로 합치지 않습니다.</p>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{message&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {report&&<>
      <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6"><p>현재 화면: {modes[report.site.mode]}</p><p>학교 자료: {report.storage==="google"?"공통 Google Drive·Sheets 사용 중":report.storage==="migrating"?"구글 저장소로 이전 중":"기존 사이트 저장소 사용 중"}</p><p>{report.storage==="google"&&report.identitySchemaReady?"공통 계정 연결을 저장할 준비가 되었습니다.":report.storage==="google"?"구글 연결 코드를 갱신해야 다른 사이트의 계정을 연결할 수 있습니다.":"세 사이트가 같은 자료를 사용하려면 저장소·백업에서 구글 연결과 자료 이전을 완료해야 합니다."}</p></div>
      <p className="text-sm leading-6 text-[#65768b]">연결 승인 대기 {report.identities.filter(r=>r.status==="pending").length}건 · 사용 중 {report.identities.filter(r=>r.status==="approved").length}건. 연결 해제는 학생 기록을 삭제하지 않습니다. 새 학교 계정의 역할 승인은 ‘학교 계정 승인 대기’에서 처리합니다.</p>
      <div className="max-h-[600px] space-y-3 overflow-auto">{[...report.identities].sort((a,b)=>Number(b.status==="pending")-Number(a.status==="pending")||b.id-a.id).map(row=><IdentityRow key={`${row.id}:${row.revision}`} row={row} report={report} busy={busy||report.storage==="migrating"||!report.identitySchemaReady} onReview={review}/>)}{!report.identities.length&&<p className="rounded-xl border p-4 text-sm text-[#65768b]">아직 사이트 계정 연결 요청이 없습니다.</p>}</div>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">최근 연결 처리 이력</summary>{report.events.length?<ol className="mt-3 space-y-3">{report.events.map(e=><li key={e.id} className="border-t pt-3 text-sm leading-6"><p>{e.action==="approve"?"연결 승인":e.action==="reject"?"연결 거절":"연결 해제"} · 요청 #{e.identityId} · {e.createdAt}</p><p>처리자: {report.accounts.find(a=>a.id===e.actorId)?.displayName??`계정 #${e.actorId}`}</p><p>{e.note}</p></li>)}</ol>:<p className="mt-3 text-sm text-[#65768b]">관리자가 처리한 연결 이력이 없습니다.</p>}</details>
    </>}
  </CardContent></Card>;
}
