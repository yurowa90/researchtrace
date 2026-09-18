"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { PortalData,ReferenceMaterial } from "@/lib/portal-types";
import { documentStages,guidancePayloadSchema,referenceEntry,type GuidancePayload } from "@/lib/guidance";
import { Field,Choice,type GuidanceSave } from "@/app/guidance-view";

export function ReferenceVersionEditor({data,material,busy,onSave,allowAdministration=true}:{allowAdministration?:boolean;data:PortalData;material:ReferenceMaterial;busy:boolean;onSave:GuidanceSave}){
  const entry=referenceEntry(data.guidance,material.id);
  const [editing,setEditing]=React.useState(false);
  if(!editing)return <div className="mt-3 space-y-2"><div className="flex flex-wrap gap-2"><Badge variant="outline">{entry?documentStages[entry.payload.reference!.stage]:"문서 상태 미확인"}</Badge><Badge variant="outline">{entry?.payload.reference?.approval==="approved"?`적용 승인 · ${entry.payload.reference.versionLabel} · 검토 ${entry.revision}`:"관리자 검토 필요"}</Badge>{entry?.payload.reference?.supersedesMaterialId&&<Badge variant="outline">이전 자료 LIB-{entry.payload.reference.supersedesMaterialId} 대체</Badge>}</div>{entry?.payload.reference?.changeSummary&&<p className="text-sm leading-6">변경 내용: {entry.payload.reference.changeSummary}</p>}{allowAdministration&&data.viewer.role==="admin"&&<Button size="sm" variant="outline" onClick={()=>setEditing(true)}>판본·적용 범위·과목 기준 검토</Button>}</div>;
  return <VersionForm key={entry?.revision??0} entry={entry} data={data} material={material} busy={busy} onSave={onSave} onClose={()=>setEditing(false)}/>;
}
function VersionForm({entry,data,material,busy,onSave,onClose}:{entry:ReturnType<typeof referenceEntry>;data:PortalData;material:ReferenceMaterial;busy:boolean;onSave:GuidanceSave;onClose:()=>void}){
  const [r,setR]=React.useState<NonNullable<GuidancePayload["reference"]>>(()=>entry?.payload.reference??{materialId:material.id,stage:"preliminary",approval:"draft",versionLabel:"",publishedOn:"",checkedOn:"",sourceUrl:"",department:"",curriculum:"",supersedesMaterialId:null,changeSummary:"",rules:[]});
  const [error,setError]=React.useState("");
  const put=<K extends keyof typeof r>(key:K,value:(typeof r)[K])=>setR(x=>({...x,[key]:value}));
  const rule=(i:number,values:Partial<(typeof r.rules)[number]>)=>setR(x=>({...x,rules:x.rules.map((v,j)=>j===i?{...v,...values}:v)}));
  const save=async()=>{setError("");try{await onSave({kind:"reference",studentId:null,entityKey:`reference:${material.id}`,expectedRevision:entry?.revision??0,payload:guidancePayloadSchema.parse({title:material.title,reference:r})});onClose();}catch(e){setError(e instanceof Error?e.message:"저장하지 못했습니다.");}};
  return <div className="mt-4 space-y-4 rounded-xl border bg-[#f7f9fc] p-4"><h3 className="font-semibold">적용할 문서와 판본 확인</h3><div className="grid gap-4 md:grid-cols-2">
    <Choice label="문서 확정 상태" value={r.stage} onChange={v=>put("stage",v as typeof r.stage)} items={Object.entries(documentStages)}/>
    <Field label="판본 이름"><Input aria-label="판본 이름" value={r.versionLabel} onChange={e=>put("versionLabel",e.target.value)} placeholder="예: 2026-06-01 정정본"/></Field>
    <Field label="발행·정정일"><Input aria-label="발행일" type="date" value={r.publishedOn} onChange={e=>put("publishedOn",e.target.value)}/></Field><Field label="원문 확인일"><Input aria-label="원문 확인일" type="date" value={r.checkedOn} onChange={e=>put("checkedOn",e.target.value)}/></Field>
    <Field label="모집단위·학과 · 공통이면 비워두세요"><Input aria-label="적용 모집단위" value={r.department} onChange={e=>put("department",e.target.value)}/></Field><Field label="적용 교육과정"><Input aria-label="자료 적용 교육과정" value={r.curriculum} onChange={e=>put("curriculum",e.target.value)} placeholder="예: 2022 개정"/></Field>
    <Field label="공식 원문 주소"><Input aria-label="공식 원문 주소" value={r.sourceUrl} onChange={e=>put("sourceUrl",e.target.value)} placeholder="https://"/></Field>
    <Field label="이 자료가 대체하는 이전 파일"><Choice label="대체할 이전 자료" value={String(r.supersedesMaterialId??"none")} onChange={v=>put("supersedesMaterialId",v==="none"?null:Number(v))} items={[["none","대체하는 자료 없음"],...data.referenceMaterials.filter(m=>m.id!==material.id).map(m=>[String(m.id),`${m.title} · LIB-${m.id}`] as [string,string])]}/></Field>
  </div><Field label="바뀐 내용과 다시 확인할 항목"><Textarea aria-label="판본 변경 내용" value={r.changeSummary} onChange={e=>put("changeSummary",e.target.value)}/></Field>
    <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">과목 이수 참고 기준 · 확인한 공식 조항만 입력</summary><p className="mt-3 text-sm leading-6 text-[#65768b]">과목명과 학점 조건을 원문대로 등록합니다. 과목명 일치는 참고 점검이며 지원 가능·불가능 판정이나 역량 점수가 아닙니다. 복잡한 예외는 설명에 남겨 교사가 확인합니다.</p><div className="mt-3 space-y-4">{r.rules.map((v,i)=><div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2" key={i}><Field label="점검 항목"><Input aria-label={`기준 ${i+1} 제목`} value={v.label} onChange={e=>rule(i,{label:e.target.value})}/></Field><Field label="원문 쪽수"><Input aria-label={`기준 ${i+1} 쪽수`} type="number" min={1} value={v.sourcePage||""} onChange={e=>rule(i,{sourcePage:Number(e.target.value)})}/></Field><Field label="대상 과목명 · 쉼표로 구분"><Input aria-label={`기준 ${i+1} 과목`} defaultValue={v.subjectNames.join(", ")} onBlur={e=>rule(i,{subjectNames:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)})}/></Field><Choice label="과목 조건" value={v.match} onChange={m=>rule(i,{match:m as "all"|"any"})} items={[["all","나열한 모든 과목"],["any","나열한 과목 중 하나 이상"]]}/><Field label="해당 과목의 합산 최소 학점 · 조건 없으면 비움"><Input aria-label={`기준 ${i+1} 최소 학점`} type="number" min={0} value={v.minCredits??""} onChange={e=>rule(i,{minCredits:e.target.value?Number(e.target.value):null})}/></Field><Choice label="반영 학기" value={v.semesterThrough} onChange={x=>rule(i,{semesterThrough:x as "3-1"|"3-2"})} items={[["3-1","3학년 1학기까지"],["3-2","3학년 2학기까지"]]}/><Field label="원문 조건·예외 설명"><Textarea aria-label={`기준 ${i+1} 설명`} value={v.description} onChange={e=>rule(i,{description:e.target.value})}/></Field><Button size="sm" variant="ghost" onClick={()=>put("rules",r.rules.filter((_,j)=>j!==i))}>이 항목 제외</Button></div>)}</div><Button size="sm" variant="outline" className="mt-3" onClick={()=>put("rules",[...r.rules,{label:"",sourcePage:0,subjectNames:[],match:"all",minCredits:null,semesterThrough:"3-1",description:""}])}>과목 기준 추가</Button></details>
    <label className="flex items-start gap-2 text-sm leading-6"><Checkbox checked={r.approval==="approved"} onCheckedChange={v=>put("approval",v===true?"approved":"draft")}/>원문과 적용 연도·전형을 확인했으며 이 판본을 분석에 사용하도록 승인합니다.</label>
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}<div className="flex gap-2"><Button disabled={busy||!r.versionLabel.trim()} onClick={()=>void save()}>{busy?"저장 중…":"판본 검토 저장"}</Button><Button variant="outline" disabled={busy} onClick={onClose}>닫기</Button></div>
  </div>;
}
