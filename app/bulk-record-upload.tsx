"use client";

import { clientId } from "@/lib/client-id";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Choice } from "@/app/guidance-view";
import { matchRecordStudent,recordFileIssue } from "@/lib/record-upload";
import { validateRecordCoverage } from "@/lib/record-coverage";
import type { PortalData,Student } from "@/lib/portal-types";
type Row={key:string;file:File;studentId:number|null;coverage:Array<{grade:number;schoolYear:number}>;reviewed:boolean;status:"ready"|"uploading"|"done"|"error";note:string};
export function BulkRecordUpload({data,students,onClose,onUploaded}:{data:PortalData;students:Student[];onClose:()=>void;onUploaded:()=>Promise<void>}){
  const [rows,setRows]=React.useState<Row[]>([]),[busy,setBusy]=React.useState(false),[error,setError]=React.useState("");const lock=React.useRef(false);
  const update=(key:string,patch:Partial<Row>)=>setRows(v=>v.map(r=>r.key===key?{...r,...patch}:r));
  const choose=(files:FileList|null)=>{if(!files||busy)return;if(files.length>50){setError("한 번에 50개 이하로 선택하세요.");return;}setError("");setRows([...files].map(file=>{const match=matchRecordStudent(file.name,students);return {key:clientId(),file,studentId:match.studentId,coverage:[],reviewed:false,status:"ready",note:recordFileIssue(file)||match.reason};}));};
  const pending=rows.filter(r=>r.status!=="done");
  const valid=(r:Row)=>r.studentId&&r.reviewed&&r.coverage.length&&!recordFileIssue(r.file);
  const upload=async()=>{if(lock.current||!pending.length||!pending.every(valid))return;lock.current=true;setBusy(true);setError("");
    try{for(const r of pending){update(r.key,{status:"uploading",note:"업로드 중…"});try{
      const student=students.find(s=>s.id===r.studentId),cls=data.classes.find(c=>c.id===student?.classId);const coverage=validateRecordCoverage(r.coverage,cls?.grade??2),last=coverage.at(-1)!;
      const form=new FormData();form.set("file",r.file);form.set("studentId",String(r.studentId));form.set("recordGrade",String(last.grade));form.set("schoolYear",String(last.schoolYear));form.set("coverage",JSON.stringify(coverage));
      const response=await fetch("/api/student-records",{method:"POST",body:form});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??"업로드 실패");update(r.key,{status:"done",note:"보관 완료"});
    }catch(e){update(r.key,{status:"error",note:e instanceof Error?e.message:"업로드하지 못했습니다."});}}
    await onUploaded();}catch(e){setError(e instanceof Error?e.message:"목록을 새로 불러오세요.");}finally{lock.current=false;setBusy(false);}
  };
  return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl" showCloseButton={!busy}><DialogHeader><DialogTitle>여러 학생부 한 번에 등록</DialogTitle><DialogDescription>파일명은 학번_이름_학생부.pdf처럼 적으면 학생을 찾기 쉽습니다. 파일마다 대상 학생과 실제 포함 학년을 확인하세요.</DialogDescription></DialogHeader>
    <div className="rounded-xl border border-dashed p-4" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(e.dataTransfer.files);}}><Input aria-label="학생부 파일 여러 개 선택" type="file" multiple accept=".pdf,.hwp,.hwpx,.docx" disabled={busy} onChange={e=>{choose(e.target.files);e.currentTarget.value="";}}/><p className="mt-2 text-sm text-[#65768b]">최대 50개 · 파일당 20MB. 새 파일 선택은 현재 대기 목록을 바꿉니다.</p></div>
    <div role="status" className="text-sm">선택 {rows.length}개 · 완료 {rows.filter(r=>r.status==="done").length}개 · 오류 {rows.filter(r=>r.status==="error").length}개</div>
    {rows.map(r=>{const student=students.find(s=>s.id===r.studentId),cls=data.classes.find(c=>c.id===student?.classId),disabled=busy||r.status==="done";return <div key={r.key} className="space-y-3 rounded-xl border p-4"><p className="break-all font-semibold">{r.file.name}</p><fieldset disabled={disabled} className="space-y-3"><Choice label={`대상 학생 ${r.file.name}`} value={String(r.studentId??"none")} onChange={v=>update(r.key,{studentId:v==="none"?null:Number(v),coverage:[],reviewed:false})} items={[["none","학생 직접 선택"],...students.map(s=>[String(s.id),`${s.studentNumber} · ${s.name} · ${data.classes.find(c=>c.id===s.classId)?.name??""}`] as [string,string])]}/><div className="flex flex-wrap gap-3">{Array.from({length:cls?.grade??0},(_,i)=>i+1).map(grade=>{const c=r.coverage.find(x=>x.grade===grade);return <div key={grade} className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm"><Checkbox disabled={disabled} checked={!!c} onCheckedChange={v=>update(r.key,{reviewed:false,coverage:v===true?[...r.coverage,{grade,schoolYear:cls!.schoolYear-cls!.grade+grade}]:r.coverage.filter(x=>x.grade!==grade)})}/>{grade}학년</label>{c&&<Input className="w-24" aria-label={`${r.file.name} ${grade}학년 학년도`} type="number" min={2022} max={2100} value={c.schoolYear} onChange={e=>update(r.key,{reviewed:false,coverage:r.coverage.map(x=>x.grade===grade?{...x,schoolYear:Number(e.target.value)}:x)})}/>}</div>;})}</div><label className="flex items-center gap-2 text-sm"><Checkbox disabled={disabled||!r.studentId||!r.coverage.length||!!recordFileIssue(r.file)} checked={r.reviewed} onCheckedChange={v=>update(r.key,{reviewed:v===true})}/>원본의 학생과 포함 학년을 확인했습니다.</label></fieldset><p className={`text-sm ${r.status==="error"?"text-rose-800":r.status==="done"?"text-emerald-800":"text-[#65768b]"}`}>{r.note}</p></div>;})}
    {error&&<p role="alert" className="text-sm text-rose-800">{error}</p>}<p className="text-sm leading-6 text-[#65768b]">실패한 파일만 다시 저장합니다. 같은 학생·학년 범위의 동일 파일을 재전송해도 중복 등록되지 않습니다.</p><Button disabled={busy||!pending.length||!pending.every(valid)} onClick={()=>void upload()}>{busy?"순서대로 저장 중…":pending.some(r=>r.status==="error")?"미완료 파일 다시 저장":`확인한 ${pending.length}개 원본 저장`}</Button>
  </DialogContent></Dialog>;
}
