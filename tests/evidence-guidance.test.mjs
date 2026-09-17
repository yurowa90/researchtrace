import assert from 'node:assert/strict';
import test from 'node:test';
import {emptySchoolState,insertRow} from '../lib/school-tables.ts';
import {applyGuidanceAction} from '../lib/guidance-store.ts';
import {googlePortalData,applyGoogleAction} from '../lib/google-school.ts';
import {profileImportExample,profileImportSchema} from '../lib/profile-import.ts';
import {calculateCredits,profileDifference,profileEvidenceIssues,hydrateProfileDetails} from '../lib/profile-evidence.ts';
import {libraryReferenceIssues,referenceManifest} from '../lib/reference-materials.ts';
import {latestGuidance,decodeGuidance,guidancePayloadSchema} from '../lib/guidance.ts';
import {courseRuleCheck,criterionApplicability} from '../lib/course-planning.ts';
import {matchRecordStudent} from '../lib/record-upload.ts';
import {normalizeGoogleState,commitGoogleState} from '../lib/google-bridge.ts';
function fixture(){const state=emptySchoolState();const admin=insertRow(state,'users',{authUserId:'a',email:'a@example.test',displayName:'관리자',role:'admin',status:'approved'});const pupil=insertRow(state,'users',{authUserId:'p',email:'p@example.test',displayName:'학생',role:'student',status:'approved'});const cls=insertRow(state,'classes',{teacherId:admin.id,name:'2학년',grade:2,schoolYear:2026,inviteCode:'A'});const student=insertRow(state,'students',{classId:cls.id,userId:pupil.id,studentNumber:'001',name:'가상학생'});return {state,admin,pupil,student};}
const course=(patch={})=>({schoolYear:2025,gradeLevel:1,semester:1,subject:'과학',subjectGroup:'과학',credits:3,selectionStatus:'completed',...patch});
test('credits count completed only, deduplicate and isolate missing or conflicting rows',()=>{
 const rows=[course(),course(),course({semester:2,selectionStatus:'planned',credits:5}),course({subject:'화학',credits:null})];const g=calculateCredits(rows)[0];assert.equal(g.completed,3);assert.equal(g.planned,5);assert.equal(g.unknown,1);assert.equal(g.duplicates,1);
 const conflict=calculateCredits([course(),course({credits:4})])[0];assert.equal(conflict.completed,0);assert.equal(conflict.conflicts,1);
});
test('new analysis nulls stay unknown and older schema versions remain readable',()=>{
 for(const version of ['1.0','1.1','1.2'])assert.equal(profileImportSchema.safeParse({...profileImportExample,schemaVersion:version}).success,true);
 const p=structuredClone(profileImportExample);p.academicAnalysis.creditSummary=[{subjectGroup:'과학',completedCredits:null,selectedCredits:null,plannedCredits:null,assessment:'미확인'}];
 const base={profileSnapshots:[],profileSections:[],ontologyEdges:[],academicCourses:[],creditSummaries:[{snapshotId:1,subjectGroup:'과학',completedCredits:0,selectedCredits:0,plannedCredits:0}],competencyEvaluations:[],evaluationReferences:[],records:[]};
 const result=hydrateProfileDetails(base,[{id:1,rawJson:JSON.stringify(p)}]);assert.equal(result.creditSummaries[0].completedCredits,null);
});
test('same student source IDs and actual page linkage are required',()=>{
 const p=structuredClone(profileImportExample);p.sections[0].recordId=12;p.sections[0].page=2;
 assert.match(profileEvidenceIssues(p,[{id:12,studentId:9,schoolYear:p.sections[0].schoolYear}],1).join(' '),/이 학생/);
 p.sections[0].recordId=null;assert.match(profileEvidenceIssues(p,[],1).join(' '),/원본 ID/);
});
test('difference separates added evidence from edited narrative',()=>{
 const before=structuredClone(profileImportExample),after=structuredClone(before);after.sections[0].summary='표현만 수정';after.sections.push({...after.sections[0],id:'NEW'});const diff=profileDifference(before,after);assert.equal(diff.added.length,1);assert.equal(diff.wordingChanged.length,1);assert.equal(diff.evidenceChanged.length,0);
});
test('reference versions bind current file, approval and admission year',()=>{
 const {state,admin,student}=fixture();const material=insertRow(state,'referenceMaterials',{uploadedBy:admin.id,title:'공식 자료',institution:'가상대',admissionsYear:2028,admissionTrack:'종합',category:'admission_guide',objectKey:'ref',originalName:'r.pdf',sizeBytes:1,contentType:'application/pdf',sha256:'a'.repeat(64)});
 const metadata=applyGuidanceAction(state,admin,{kind:'reference',payload:{title:'공식 자료',reference:{materialId:material.id,stage:'final',approval:'approved',versionLabel:'최종',checkedOn:'2026-09-17',rules:[]}}}).entry;
 const p=structuredClone(profileImportExample);p.analysisContext.admissionsYear=2028;p.evaluationAnalysis.references=[{id:`LIB-${material.id}`,title:material.title,institution:material.institution,admissionsYear:2028,admissionTrack:material.admissionTrack,category:material.category,sha256:material.sha256,materialRevision:metadata.revision}];
 assert.deepEqual(libraryReferenceIssues(p,[material],[metadata]),[]);p.evaluationAnalysis.references[0].materialRevision=99;assert.match(libraryReferenceIssues(p,[material],[metadata]).join(' '),/판본/);p.evaluationAnalysis.references[0].materialRevision=1;p.evaluationAnalysis.references[0].sha256='b'.repeat(64);assert.match(libraryReferenceIssues(p,[material],[metadata]).join(' '),/해시/);
 assert.equal(referenceManifest([material],[metadata])[0].materialRevision,1);
});
test('student cannot assign criteria or forge observations; version history is append-only',()=>{
 const {state,admin,pupil,student}=fixture();const entry=applyGuidanceAction(state,pupil,{kind:'question',studentId:student.id,payload:{title:'왜 조건에 따라 달라질까?',observationInterpretation:'교사인 척'}}).entry;
 assert.equal(entry.payload.observationInterpretation,'');
 assert.throws(()=>applyGuidanceAction(state,pupil,{kind:'observation',studentId:student.id,payload:{title:'위조'}}),/교사/);
 const second=applyGuidanceAction(state,pupil,{kind:'question',studentId:student.id,entityKey:entry.entityKey,expectedRevision:1,payload:{title:'비교 대상을 좁힌 질문'}}).entry;
 assert.equal(state.tables.guidanceEntries.length,2);assert.equal(state.tables.guidanceEntries[0].payloadJson.includes('왜 조건'),true);assert.equal(second.revision,2);
 assert.throws(()=>applyGuidanceAction(state,pupil,{kind:'question',studentId:student.id,entityKey:entry.entityKey,expectedRevision:1,payload:{title:'오래된 창'}}),/먼저 저장/);
 const visible=googlePortalData(state,{...pupil,role:'admin'});assert.equal(visible.viewer.role,'student');assert.equal(visible.guidance.length,1);
});
test('course checks pause across year, institution, track and curriculum mismatch',()=>{
 const plan=guidancePayloadSchema.parse({title:'계획',plan:{admissionsYear:2028,curriculum:'2022',institution:'가상대',admissionTrack:'종합',department:'공학'}}).plan;
 const c={institution:'가상대',admissionsYear:2028,admissionTrack:'종합',reference:{curriculum:'2022',department:'공학'}};
 assert.equal(criterionApplicability(c,plan),null);assert.match(criterionApplicability({...c,admissionsYear:2027},plan),/다른 자료/);assert.match(criterionApplicability(c,{...plan,department:'의학'}),/모집단위/);
 const r={subjectNames:['과학'],match:'all',minCredits:3,semesterThrough:'3-1'};
 assert.equal(courseRuleCheck(r,[course({selectionStatus:'planned'})],true).state,'추가 확인 필요');assert.equal(courseRuleCheck(r,[course()],true).state,'이수 근거 확인');assert.equal(courseRuleCheck(r,[course({gradeLevel:3,semester:2})],true).state,'추가 확인 필요');
});
test('file matching preserves zeroes, flags ambiguity and rejects conflicting identities',()=>{
 const students=[{id:1,studentNumber:'001',name:'가상가'},{id:2,studentNumber:'002',name:'가상나'},{id:3,studentNumber:'001',name:'가상다'}];
 assert.equal(matchRecordStudent('001_가상가_학생부.pdf',students).studentId,1);assert.equal(matchRecordStudent('001.pdf',students).studentId,null);assert.equal(matchRecordStudent('1001.pdf',students).studentId,null);assert.equal(matchRecordStudent('001_가상나.pdf',students).studentId,null);
});
test('older Google schema stays readable but cannot silently discard new guidance',async()=>{
 const {state}=fixture();delete state.tables.guidanceEntries;normalizeGoogleState(state);const old=normalizeGoogleState({...state,tables:Object.fromEntries(Object.entries(state.tables).filter(([k])=>k!=='guidanceEntries'))});assert.deepEqual(old.tables.guidanceEntries,[]);old.tables.guidanceEntries.push({id:1});await assert.rejects(()=>commitGoogleState(old),/갱신/);
});
