"use client";
import * as React from "react";
import { FileSearch, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { PortalData, ProfileSection } from "@/lib/portal-types";
import { sourceStates } from "@/lib/guidance";

export function SourceCard({section,data}:{section:ProfileSection;data:PortalData}) {
  const record=data.records.find(r=>r.id===section.recordId&&r.studentId===section.studentId);
  const pdf=record&&/\.pdf$/i.test(record.originalName);
  return <section className="space-y-3 rounded-xl border border-[#dfe6ef] bg-white p-4">
    <div className="flex flex-wrap gap-2"><Badge variant="outline">{section.schoolYear} · {section.subject||"활동"}</Badge><Badge variant="secondary">{sourceStates[section.sourceState??"unknown"]}</Badge></div>
    <h3 className="font-semibold">{section.title}</h3><p className="text-base leading-7 text-[#43566f]">{section.summary}</p>
    {section.evidence.length?<div className="space-y-2 border-l-4 border-[#c9d9f0] bg-[#f7f9fc] p-3"><p className="text-sm font-semibold">분석에 사용한 근거 문장</p>{section.evidence.map((line,i)=><p key={i} className="whitespace-pre-wrap text-sm leading-6">{line}</p>)}</div>:<p className="text-sm text-amber-800">근거 문장이 연결되지 않았습니다. 원문 확인이 필요합니다.</p>}
    {section.sourceLocation&&<p className="text-sm text-[#637389]">원문 위치: {section.sourceLocation}</p>}
    {record?<Button asChild size="sm" variant="outline"><a href={`/api/student-records/${record.id}${pdf?"?inline=1":""}${pdf&&section.page?`#page=${section.page}`:""}`} target="_blank" rel="noreferrer"><ExternalLink/>{pdf?"원문 열기":"원본 받기"}{section.page?` · ${section.page}쪽`:""}</a></Button>:<p className="text-sm text-amber-800">원본 파일 위치가 아직 연결되지 않았습니다. 담당 선생님과 원본 파일 및 해당 쪽수를 확인하세요.</p>}
    <p className="text-xs leading-5 text-[#718095]">원문·자기보고·분석 해석의 구분입니다. 자료 미확인은 학생이 활동을 하지 않았다는 뜻이 아닙니다.</p>
  </section>;
}
export function EvidenceButton({data,studentId,snapshotId,refs,label="근거 확인"}:{data:PortalData;studentId:number;snapshotId:number;refs:string[];label?:string}){
  const [open,setOpen]=React.useState(false);
  const sections=data.profileSections.filter(s=>s.studentId===studentId&&s.snapshotId===snapshotId&&refs.includes(s.sectionKey??""));
  const missing=refs.filter(key=>!sections.some(s=>s.sectionKey===key));
  return <><Button size="sm" variant="outline" onClick={()=>setOpen(true)}><FileSearch/>{label}{refs.length?` · ${refs.length}`:""}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>판단의 근거</DialogTitle><DialogDescription>분석에 연결한 학생부 항목과 원문 위치를 확인합니다.</DialogDescription></DialogHeader><div className="space-y-3">{sections.map(s=><SourceCard key={s.id} section={s} data={data}/>)}{(!refs.length||missing.length>0)&&<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{!refs.length?"연결된 근거가 없습니다. 원문이나 수행 자료를 추가로 확인하세요.":`이 버전에서 찾지 못한 근거: ${missing.join(", ")}`}</p>}</div></DialogContent></Dialog></>;
}
