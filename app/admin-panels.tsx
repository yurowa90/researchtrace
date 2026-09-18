"use client";
import * as React from "react";
import { clientId } from "@/lib/client-id";
import { OperationReview } from "@/app/admin-operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PortalData, Student, Classroom } from "@/lib/portal-types";
import type { AdminReport } from "@/lib/admin-data";
import type { AdminExecute } from "@/app/admin-portal";
import { studentWorkspaceUrl, type AdminSection } from "@/lib/admin-overview";

const selectClass="h-11 w-full rounded-lg border border-[#d8e1ec] bg-white px-3 text-sm text-[#102342]";
const roleNames:Record<string,string>={admin:"관리자",teacher:"담임",student:"학생"};
const statusNames:Record<string,string>={approved:"승인됨",pending:"승인 대기",suspended:"정지"};

function ClassAssignment({classroom,data,disabled,onSaved}:{classroom:Classroom;data:PortalData;disabled:boolean;onSaved:()=>Promise<void>}) {
  const [teacher,setTeacher]=React.useState(String(classroom.teacherId)),[reason,setReason]=React.useState(""),[review,setReview]=React.useState<Record<string,unknown>|null>(null);
  const students=data.students.filter(s=>s.classId===classroom.id&&!s.isExample);
  return <article className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><p className="text-sm text-[#65768b]">{classroom.schoolYear}학년도 · {classroom.grade}학년</p><h2 className="mt-2 text-xl font-bold">{classroom.name}</h2><p className="mt-3 text-sm text-[#596d85]">실제 재학생 {students.filter(s=>s.status==="active").length}명 · 졸업생 {students.filter(s=>s.status==="graduated").length}명</p><label className="mt-5 block space-y-2 text-sm"><span className="block">{classroom.name} 담당 교사</span><select className={selectClass} value={teacher} onChange={e=>setTeacher(e.target.value)} disabled={disabled}>{!data.staffUsers.some(u=>u.id===classroom.teacherId)&&<option value={classroom.teacherId}>기존 담당 계정 확인 필요</option>}{data.staffUsers.map(u=><option key={u.id} value={u.id}>{u.displayName} · {roleNames[u.role]} · {u.email}</option>)}</select></label>
    {Number(teacher)!==classroom.teacherId&&<label className="mt-4 block space-y-2 text-sm"><span className="block">담임 변경 사유</span><Input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="예: 새 학기 담임 배정"/></label>}
    <Button className="mt-3" variant="outline" disabled={disabled||Number(teacher)===classroom.teacherId||reason.trim().length<2} onClick={()=>setReview({batchId:clientId(),kind:"assign_teacher",classId:classroom.id,teacherId:Number(teacher),reason})}>담당 교사 변경 확인</Button>
    {review&&<OperationReview input={review} disabled={disabled} onClose={()=>setReview(null)} onSaved={onSaved}/>}
  </article>;
}
export function AdminClasses({data,disabled,onSaved,onAdd}:{data:PortalData;disabled:boolean;onSaved:()=>Promise<void>;onAdd:()=>void}) {
  const [year,setYear]=React.useState("all"),[query,setQuery]=React.useState("");
  const years=[...new Set(data.classes.map(c=>c.schoolYear))].sort((a,b)=>b-a);
  const rows=data.classes.filter(c=>(year==="all"||c.schoolYear===Number(year))&&`${c.name} ${data.staffUsers.find(u=>u.id===c.teacherId)?.displayName??""}`.includes(query.trim())).sort((a,b)=>b.schoolYear-a.schoolYear||a.name.localeCompare(b.name,"ko",{numeric:true}));
  return <div className="space-y-5"><div className="flex flex-wrap gap-3"><Button disabled={disabled} onClick={onAdd}>학급 추가</Button><label className="sr-only" htmlFor="class-search">학급·담임 이름 검색</label><Input id="class-search" className="h-11 max-w-xs" placeholder="학급·담임 이름 검색" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="학급 학년도" value={year} onChange={e=>setYear(e.target.value)} className={`${selectClass} max-w-44`}><option value="all">전체 학년도</option>{years.map(y=><option key={y} value={y}>{y}학년도</option>)}</select></div><p className="text-sm leading-6 text-[#65768b]">담당 교사 변경은 조회·관리 범위에 적용됩니다. 학생 ID와 누적 기록은 유지됩니다.</p><div className="grid gap-4 xl:grid-cols-2">{rows.map(c=><ClassAssignment key={`${c.id}:${c.teacherId}`} classroom={c} data={data} disabled={disabled} onSaved={onSaved}/>)}</div>{!rows.length&&<p className="rounded-xl border bg-white p-6 text-base text-[#65768b]">표시할 학급이 없습니다. 학급을 추가하거나 검색 조건을 확인하세요.</p>}</div>;
}

type Approval={userId:number;name:string;email:string;student?:Student;role:"student"|"teacher"};
export function AdminAccounts({data,accounts,disabled,execute}:{data:PortalData;accounts:AdminReport["accounts"];disabled:boolean;execute:AdminExecute}) {
  const [approval,setApproval]=React.useState<Approval|null>(null), [query,setQuery]=React.useState("");
  const [role,setRole]=React.useState("all");
  const filtered=accounts.filter(u=>(role==="all"||u.role===role)&&`${u.displayName} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><h2 className="text-lg font-bold">학교 계정 승인 대기 · {data.pendingUsers.length}명</h2><p className="mt-2 text-sm leading-6 text-[#65768b]">학생은 등록된 명단과 이메일을 대조합니다. 담임은 교직원 본인 여부를 확인한 뒤 승인하고 담당 학급을 배정합니다.</p><div className="mt-4 space-y-3">{data.pendingUsers.map(u=>{const matches=data.students.filter(s=>!s.isExample&&s.email?.toLowerCase()===u.email.toLowerCase()&&(s.userId===null||s.userId===u.id));return <article key={u.id} className="flex flex-wrap items-center gap-4 rounded-xl border p-4"><div className="min-w-0 flex-1"><p className="font-semibold">{u.displayName}</p><p className="mt-1 break-all text-sm text-[#65768b]">{u.email}</p><p className="mt-2 text-sm text-[#65768b]">{matches.length===1?`명단 일치: ${matches[0].studentNumber} ${matches[0].name}`:"연결 가능한 학생 명단이 없습니다. 학생 등록 정보를 먼저 확인하세요."}</p></div><div className="flex flex-wrap gap-2">{matches.length===1&&<Button variant="outline" disabled={disabled} onClick={()=>setApproval({userId:u.id,name:u.displayName,email:u.email,student:matches[0],role:"student"})}>학생 연결 확인</Button>}<Button variant="outline" disabled={disabled} onClick={()=>setApproval({userId:u.id,name:u.displayName,email:u.email,role:"teacher"})}>담임 승인 확인</Button></div></article>;})}{!data.pendingUsers.length&&<p className="py-3 text-base text-[#65768b]">학교 계정 승인 대기자가 없습니다.</p>}</div></section>
    <section className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><h2 className="text-lg font-bold">등록된 학교 계정</h2><div className="mt-4 flex flex-wrap gap-3"><Input className="h-11 max-w-md" aria-label="학교 계정 검색" placeholder="이름·이메일 검색" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="계정 역할" className={`${selectClass} max-w-44`} value={role} onChange={e=>setRole(e.target.value)}><option value="all">모든 역할</option><option value="student">학생</option><option value="teacher">담임</option><option value="admin">관리자</option></select></div><p className="mt-3 text-sm text-[#65768b]">검색 결과 {filtered.length}명. 개별 사이트 접근은 아래 공통 계정 연결에서 해제할 수 있습니다.</p><div className="mt-3 max-h-96 overflow-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr>{["학교 계정","역할·상태","연결 정보"].map(h=><th key={h} className="border-b py-3 pr-4">{h}</th>)}</tr></thead><tbody>{filtered.map(u=><tr key={u.id} className="border-b"><td className="py-3 pr-4"><p className="font-semibold">{u.displayName}</p><p className="mt-1 break-all text-[#65768b]">{u.email}</p></td><td className="py-3 pr-4">{roleNames[u.role]}<p className="mt-1 text-[#65768b]">{statusNames[u.status]}</p></td><td className="py-3">{u.role==="student"?(data.students.find(s=>s.userId===u.id)?.name??"학생 명단 미연결"):data.classes.filter(c=>c.teacherId===u.id).map(c=>`${c.schoolYear} ${c.name}`).join(" · ")||"담당 학급 없음"}</td></tr>)}</tbody></table>{!filtered.length&&<p className="py-6 text-sm text-[#65768b]">조건에 맞는 계정이 없습니다.</p>}</div></section>
    <Dialog open={Boolean(approval)} onOpenChange={open=>{if(!open&&!disabled)setApproval(null);}}><DialogContent><DialogHeader><DialogTitle>{approval?.role==="teacher"?"담임 계정 승인":"학생 계정 연결"}</DialogTitle><DialogDescription>{approval?.name} · {approval?.email}</DialogDescription></DialogHeader><p className="text-base leading-7">{approval?.role==="teacher"?"교직원 본인 여부를 확인한 계정에 담임 역할을 부여합니다. 승인 후 학급·담임 배정에서 학급을 지정합니다.":`${approval?.student?.studentNumber} ${approval?.student?.name} 학생의 본인 계정인지 확인합니다. 연결하면 해당 학생 자료를 볼 수 있습니다.`}</p><DialogFooter><Button variant="outline" disabled={disabled} onClick={()=>setApproval(null)}>취소</Button><Button disabled={disabled} onClick={()=>{if(approval)void execute({action:approval.role==="teacher"?"approveTeacher":"approveUser",userId:approval.userId,studentId:approval.student?.id},approval.role==="teacher"?"담임 계정을 승인했습니다.":"학생 계정을 연결했습니다.").then(()=>setApproval(null)).catch(()=>undefined);}}>본인 확인 후 승인</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export function StudentStatusDialog({student,data,disabled,onSaved,onClose}:{student:Student;data:PortalData;disabled:boolean;onSaved:()=>Promise<void>;onClose:()=>void}) {
  const cls=data.classes.find(c=>c.id===student.classId),graduating=student.status==="active";
  const [year,setYear]=React.useState(String((cls?.schoolYear??new Date().getFullYear())+1)),[reason,setReason]=React.useState(""),[review,setReview]=React.useState<Record<string,unknown>|null>(null);
  if(review)return <OperationReview input={review} disabled={disabled} onClose={onClose} onSaved={onSaved}/>;
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent><DialogHeader><DialogTitle>{student.name} · {graduating?"졸업 처리":"재학 상태 복원"}</DialogTitle><DialogDescription>원본과 분석 이력을 보존하며 학적 상태를 변경합니다. 사유를 입력한 뒤 변경 내용을 확인하세요.</DialogDescription></DialogHeader>
    {graduating&&<label className="space-y-2 text-sm"><span className="block">졸업 연도</span><Input type="number" value={year} onChange={e=>setYear(e.target.value)}/></label>}
    <label className="space-y-2 text-sm"><span className="block">변경 사유</span><Input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="처리 사유를 입력하세요"/></label>
    <DialogFooter><Button variant="outline" onClick={onClose}>취소</Button><Button disabled={disabled||reason.trim().length<2} onClick={()=>setReview({batchId:clientId(),kind:graduating?"graduate":"restore",targets:[{studentId:student.id}],reason,...(graduating?{graduatedYear:Number(year)}:{})})}>변경 내용 확인</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function AdminGuide({navigate}:{navigate:(section:AdminSection)=>void}) {
  const steps:{title:string;text:string;button:string;section?:AdminSection;href?:string}[]=[
    {title:"학급과 담당 교사를 준비합니다",text:"학년·학년도·학급명을 입력합니다. 담임이 아직 승인되지 않았다면 관리자가 임시 담당하고, 계정 승인 후 담당 교사를 변경합니다.",button:"학급·담임 배정",section:"classes"},
    {title:"학생 명단을 한 번에 등록합니다",text:"학생 관리 → 엑셀 일괄 등록에서 양식을 내려받습니다. 학번·이름·이메일을 입력한 뒤 업로드하고 오류 행과 대상 학급을 확인하여 저장합니다. 학번 앞자리 0은 유지합니다.",button:"학생 관리",section:"students"},
    {title:"학교 계정과 사이트 연결을 승인합니다",text:"계정·접근 관리에서 본인 여부를 확인하고 학생·담임 계정을 승인합니다. 이후 새 사이트의 로그인 연결 요청은 기존 학교 계정을 선택해 승인합니다.",button:"계정·접근 관리",section:"accounts"},
    {title:"공용 평가 자료를 등록합니다",text:"대학·전형·학년도와 자료 판본을 확인해 모집요강·평가 기준을 등록합니다. Work 자료 묶음에 선택한 공용 자료를 포함하여 재사용할 수 있습니다.",button:"공용 평가 자료",section:"references"},
    {title:"학생 원본과 Work 결과를 연결합니다",text:"학생 자료 열람에서 학생을 선택해 원본을 등록하고 Work 결과를 검증한 뒤 반영합니다. 기본 이전 학년뿐 아니라 현재 학년 기록도 함께 분석합니다.",button:"학생 자료 열람",href:studentWorkspaceUrl(undefined,"records")},
    {title:"학교 연구 현황과 누적 기록을 확인합니다",text:"학교 연구 현황에서 키워드·자료 축적 상태를 보고 누적 연구 보관함에서 졸업생과 이전 분석을 검색합니다. 이전 버전은 활성 분석을 변경하지 않고 열람·다운로드합니다.",button:"누적 연구 보관함",section:"archive"},
    {title:"진급·졸업을 한 번에 처리합니다",text:"새 학급을 만든 뒤 현재 학급과 대상 학생을 선택합니다. 새 학번과 사유를 입력하고 미리보기에서 전후 내용을 확인한 뒤 저장합니다. 담임 변경도 사유와 이력을 남깁니다.",button:"진급·졸업 일괄 관리",section:"operations"},
    {title:"저장 위치와 백업을 확인합니다",text:"세 사이트 연결 점검에서 작업이 필요한 항목을 확인합니다. Google 연결 확인 후 전환 전 전체 백업을 내려받아 검증하고, 자료 복사·검증을 완료합니다. 학생·교사 사이트의 실제 로그인과 열람 범위도 확인합니다.",button:"저장소·백업",section:"storage"},
  ];
  return <div className="space-y-5"><div className="grid gap-4 xl:grid-cols-2">{steps.map((s,i)=><section key={s.title} className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><p className="text-sm font-semibold text-[#65768b]">{i+1}단계</p><h2 className="mt-2 text-lg font-bold">{s.title}</h2><p className="mt-3 text-base leading-7 text-[#596d85]">{s.text}</p>{s.href?<Button asChild variant="outline" className="mt-4"><a href={s.href}>{s.button}</a></Button>:<Button variant="outline" className="mt-4" onClick={()=>s.section&&navigate(s.section)}>{s.button}</Button>}</section>)}</div><section className="rounded-2xl border border-[#dfe6ef] bg-white p-5"><h2 className="text-lg font-bold">현재 운영 범위</h2><p className="mt-3 text-base leading-7 text-[#596d85]">현재 주소는 관리자 사이트입니다. 학생·교사 전용 사이트도 개설되어 있습니다. 같은 학교 자료를 사용하려면 Google 공통 저장소 연결과 자료 이전을 완료해야 합니다. 사이트를 학교 사용자에게 공유하는 권한과 사이트 안에서 계정을 승인하는 권한은 별도로 관리합니다.</p><p className="mt-3 text-sm leading-6 text-[#65768b]">졸업 처리는 자료 삭제가 아닙니다. 관리자 화면의 준비 상태는 자료 등록 여부이며 학생 역량 점수나 합격 가능성을 뜻하지 않습니다.</p></section></div>;
}
