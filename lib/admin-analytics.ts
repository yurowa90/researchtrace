import type { PortalData, Student } from "@/lib/portal-types";
import { studentReadiness } from "@/lib/portal-workflow";
export type ArchiveFilter={query:string;schoolYear:string;status:string;graduatedYear:string};
export function archiveStudents(data:PortalData,filter:ArchiveFilter){
  const query=filter.query.trim().toLocaleLowerCase();
  return data.students.filter(s=>{
    if(s.isExample||filter.status!=="all"&&s.status!==filter.status)return false;
    if(filter.schoolYear!=="all"&&data.classes.find(c=>c.id===s.classId)?.schoolYear!==Number(filter.schoolYear))return false;
    if(filter.graduatedYear!=="all"&&s.graduatedYear!==Number(filter.graduatedYear))return false;
    return !query||[s.name,s.studentNumber,...data.profileSnapshots.filter(p=>p.studentId===s.id).map(p=>`${p.versionLabel} ${p.oneLineProfile}`),...data.researchKeywords.filter(k=>k.studentId===s.id).map(k=>k.keyword)].join(" ").toLocaleLowerCase().includes(query);
  }).sort((a,b)=>a.name.localeCompare(b.name,"ko")||a.id-b.id);
}
export function schoolResearchSummary(data:PortalData,students:Student[]){
  const ids=new Set(students.map(s=>s.id)),active=new Set(data.profileSnapshots.filter(p=>p.isActive&&ids.has(p.studentId)).map(p=>p.id));
  const keywords=new Map<string,Set<number>>();
  for(const k of data.researchKeywords)if(active.has(k.snapshotId)){
    const term=k.keyword.trim();if(!term)continue;const set=keywords.get(term)??new Set<number>();set.add(k.studentId);keywords.set(term,set);
  }
  const yearly=new Map<number,{records:Set<number>;activities:Set<number>;courses:Set<number>}>();
  const year=(y:number)=>{if(!yearly.has(y))yearly.set(y,{records:new Set(),activities:new Set(),courses:new Set()});return yearly.get(y)!;};
  for(const r of data.records)if(ids.has(r.studentId))for(const c of r.coverage.length?r.coverage:[{schoolYear:r.schoolYear}])year(c.schoolYear).records.add(r.studentId);
  for(const s of data.profileSections)if(ids.has(s.studentId)&&active.has(s.snapshotId))year(s.schoolYear).activities.add(s.studentId);
  for(const c of data.academicCourses)if(ids.has(c.studentId)&&active.has(c.snapshotId))year(c.schoolYear).courses.add(c.studentId);
  const classes=data.classes.map(c=>{const members=students.filter(s=>s.classId===c.id),readiness=members.map(s=>studentReadiness(data,s));return {id:c.id,label:`${c.schoolYear} · ${c.name}`,students:members.length,records:readiness.filter(r=>!r.missingGrades.length).length,profiles:readiness.filter(r=>r.profile).length,academics:members.filter(s=>data.academicCourses.some(a=>a.studentId===s.id&&active.has(a.snapshotId))).length};}).filter(c=>c.students);
  return {studentCount:students.length,profileCount:new Set(data.profileSnapshots.filter(p=>active.has(p.id)).map(p=>p.studentId)).size,versionCount:data.profileSnapshots.filter(p=>ids.has(p.studentId)).length,recordCount:data.records.filter(r=>ids.has(r.studentId)).length,keywordCount:keywords.size,
    keywords:[...keywords].map(([keyword,set])=>({keyword,count:set.size})).sort((a,b)=>b.count-a.count||a.keyword.localeCompare(b.keyword,"ko")),
    years:[...yearly].sort(([a],[b])=>a-b).map(([y,sets])=>({year:y,records:sets.records.size,activities:sets.activities.size,courses:sets.courses.size})),classes};
}
