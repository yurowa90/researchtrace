import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {prepareOperation,applyPreparedOperation,previewOperation,commitOperation,operationHistory} from '../lib/admin-operations.ts';
import {GET as historyGET,POST as operationsPOST} from '../app/api/admin/operations/route.ts';
import {GET as archiveGET} from '../app/api/admin/archive/route.ts';
import {emptySchoolState,insertRow,tableNames} from '../lib/school-tables.ts';
import {googlePortalData} from '../lib/google-school.ts';
import {getPortalData} from '../lib/data.ts';
import {normalizeGoogleState,commitGoogleState} from '../lib/google-bridge.ts';
import {archiveStudents,schoolResearchSummary} from '../lib/admin-analytics.ts';
import {profileImportExample} from '../lib/profile-import.ts';
class MemoryD1 {
 sql=new DatabaseSync(':memory:');beforeBatch;
 constructor(){this.sql.exec('PRAGMA foreign_keys=ON');for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));}
 prepare(query){const db=this;const make=params=>({bind(...args){return make(args);},async raw(){const s=db.sql.prepare(query);s.setReturnArrays(true);return s.all(...params);},async all(){return{success:true,results:db.sql.prepare(query).all(...params),meta:{}};},async run(){db.sql.prepare(query).run(...params);return{success:true,results:[],meta:{}};}});return make([]);}
 async batch(queries){this.beforeBatch?.(queries);this.sql.exec('BEGIN');try{const r=[];for(const q of queries)r.push(await q.all());this.sql.exec('COMMIT');return r;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
const owner={id:1,authUserId:'owner',displayName:'가상 관리자',role:'admin',status:'approved'};
const teacher={id:2,authUserId:'teacher',displayName:'가상 교사',role:'teacher',status:'approved'};
function dbFixture(){const db=new MemoryD1();globalThis.__portalTestEnv.DB=db;
 db.sql.exec("INSERT INTO users(auth_user_id,email,display_name,role,status) VALUES('owner','owner@example.test','가상 관리자','admin','approved'),('teacher','teacher@example.test','가상 교사','teacher','approved'),('student','student@example.test','가상 학생','student','approved');INSERT INTO classes(teacher_id,name,grade,school_year,invite_code) VALUES(2,'2학년 1반',2,2026,'A'),(1,'3학년 1반',3,2027,'B'),(1,'2학년 2반',2,2026,'C');INSERT INTO students(class_id,user_id,student_number,name) VALUES(1,3,'001','가상 하나'),(1,NULL,'002','가상 둘');INSERT INTO subjects(class_id,name) VALUES(1,'원래 과목');INSERT INTO activities(student_id,subject_id,created_by,title,activity_type,activity_date,raw_text) VALUES(1,1,2,'이전 활동','탐구','2026-05-01','이전 기록');");return db;}
const input=(kind='promote',other={})=>({batchId:randomUUID(),kind,reason:'가상 학년 전환 확인',targets:[{studentId:1,studentNumber:'0001'},{studentId:2,studentNumber:'0002'}],classId:2,...other});
const request=body=>new Request('https://school.example/api/admin/operations',{method:'POST',headers:{Origin:'https://school.example','Content-Type':'application/json'},body:JSON.stringify(body)});
function stateFixture(){const state=emptySchoolState();const admin=insertRow(state,'users',{...owner,email:'owner@example.test'});const staff=insertRow(state,'users',{...teacher,email:'teacher@example.test'});insertRow(state,'users',{id:3,authUserId:'student',email:'student@example.test',displayName:'가상 학생',role:'student',status:'approved'});const c1=insertRow(state,'classes',{teacherId:2,name:'2학년',grade:2,schoolYear:2026,inviteCode:'A'});const c2=insertRow(state,'classes',{teacherId:1,name:'3학년',grade:3,schoolYear:2027,inviteCode:'B'});insertRow(state,'students',{classId:c1.id,userId:3,studentNumber:'001',name:'가상 하나'});insertRow(state,'students',{classId:c1.id,studentNumber:'002',name:'가상 둘'});return {state,admin,staff,c1,c2};}

test('bulk promotion previews without writing and preserves student IDs, accounts, activity subjects and saved originals',async()=>{
 const db=dbFixture();try{
  const raw=JSON.stringify(profileImportExample);db.sql.prepare("INSERT INTO profile_snapshots(student_id,created_by,version_label,schema_version,one_line_profile,narrative,raw_json) VALUES(1,1,'이전 분석','1.2','요약','흐름',?)").run(raw);
  db.sql.exec("INSERT INTO student_records(student_id,owner_user_id,record_grade,school_year,original_name,object_key,content_type,size_bytes) VALUES(1,1,1,2025,'원본.pdf','original','application/pdf',1)");
  db.sql.exec("UPDATE profile_snapshots SET source_years_json='[2025,2026]'");
  const before=db.sql.prepare('SELECT * FROM students ORDER BY id').all();const p=await previewOperation(owner,input());assert.equal(p.rows.length,2);assert.deepEqual(db.sql.prepare('SELECT * FROM students ORDER BY id').all(),before);
  assert.equal((await commitOperation(owner,p.input,p.token)).count,2);const rows=db.sql.prepare('SELECT id,user_id,class_id,student_number FROM students ORDER BY id').all();assert.deepEqual(rows.map(r=>[r.id,r.user_id,r.class_id,r.student_number]),[[1,3,2,'0001'],[2,null,2,'0002']]);
  assert.equal(db.sql.prepare('SELECT raw_json FROM profile_snapshots').get().raw_json,raw);assert.equal(db.sql.prepare('SELECT object_key FROM student_records').get().object_key,'original');assert.equal(db.sql.prepare('SELECT subject_id FROM activities').get().subject_id,1);
  assert.deepEqual((await getPortalData(owner)).profileSnapshots[0].sourceYears,[2025,2026]);assert.equal((await getPortalData(owner)).subjects.some(s=>s.name==='원래 과목'),true);const student=await getPortalData({id:3,role:'student',status:'approved'});assert.equal(student.subjects.some(s=>s.name==='원래 과목'),true);
  assert.equal((await getPortalData(teacher)).students.length,0);assert.equal((await operationHistory(owner,new URLSearchParams())).events.length,2);
  await assert.rejects(()=>commitOperation(owner,p.input,p.token),/중복|이미|진급/);assert.equal(db.sql.prepare('SELECT count(*) n FROM school_operations').get().n,2);
  assert.throws(()=>db.sql.exec('DELETE FROM school_operations'),/immutable/);
 }finally{db.sql.close();}
});
test('stale preview, collisions, invalid years, examples, duplicate IDs and wrong roles reject all changes',async()=>{
 const db=dbFixture();try{
  const p=await previewOperation(owner,input());db.sql.exec("UPDATE students SET student_number='099' WHERE id=2");await assert.rejects(()=>commitOperation(owner,p.input,p.token),/다시 미리보기/);
  for(const bad of [input('promote',{targets:[{studentId:1},{studentId:1}]}),input('graduate',{graduatedYear:2027}),input('promote',{classId:3}),input('transfer',{classId:2}),input('restore'),input('promote',{targets:[{studentId:1,studentNumber:'X'},{studentId:2,studentNumber:'X'}]})])await assert.rejects(()=>previewOperation(owner,bad));
  db.sql.exec("INSERT INTO students(class_id,student_number,name) VALUES(2,'0001','가상 충돌')");await assert.rejects(()=>previewOperation(owner,input()),/중복/);
  db.sql.exec('UPDATE students SET is_example=1 WHERE id=1');await assert.rejects(()=>previewOperation(owner,input()),/예시/);
  await assert.rejects(()=>previewOperation({...teacher,role:'admin'},input()),/관리자/);assert.equal(db.sql.prepare('SELECT count(*) n FROM school_operations').get().n,0);
 }finally{db.sql.close();}
});
test('D1 commit rolls back earlier students and audit events when a later row changes immediately before the transaction',async()=>{
 const db=dbFixture();try{const p=await previewOperation(owner,input());let calls=0;db.beforeBatch=()=>{if(++calls===3){db.sql.exec("UPDATE students SET status='archived' WHERE id=2");}};
  // currentAdmin identity read, operation context read, then transactional writes.
  await assert.rejects(()=>commitOperation(owner,p.input,p.token),/부분 저장되지/);assert.equal(calls,3);
  assert.equal(db.sql.prepare('SELECT class_id FROM students WHERE id=1').get().class_id,1);assert.equal(db.sql.prepare('SELECT count(*) n FROM school_operations').get().n,0);
 }finally{db.sql.close();}
});
test('graduation, correction and teacher assignment have immutable before/after history and preserve access separation',async()=>{
 const db=dbFixture();try{let p=await previewOperation(owner,input());await commitOperation(owner,p.input,p.token);
  p=await previewOperation(owner,input('graduate',{graduatedYear:2028}));await commitOperation(owner,p.input,p.token);assert.equal(db.sql.prepare('SELECT graduated_year FROM students WHERE id=1').get().graduated_year,2028);
  p=await previewOperation(owner,input('restore'));await commitOperation(owner,p.input,p.token);assert.equal(db.sql.prepare('SELECT graduated_year FROM students WHERE id=1').get().graduated_year,null);
  p=await previewOperation(owner,input('assign_teacher',{targets:[],classId:2,teacherId:2}));await commitOperation(owner,p.input,p.token);assert.equal((await getPortalData(teacher)).students.length,2);
  const history=await operationHistory(owner,new URLSearchParams({kind:'graduate',studentId:'1'}));assert.equal(history.events.length,1);assert.equal(JSON.parse(history.events[0].beforeJson).status,'active');assert.equal(JSON.parse(history.events[0].afterJson).status,'graduated');
 }finally{db.sql.close();}
});
test('Google operations preserve prior data, reject stale roles and allow read compatibility while requiring new sheet for writes',async()=>{
 const {state,admin,staff}=stateFixture();insertRow(state,'subjects',{classId:1,name:'원래 과목'});insertRow(state,'activities',{studentId:1,subjectId:1,createdBy:2,title:'이전 활동',activityDate:'2026-01-01',rawText:'보존',activityType:'탐구'});
  await assert.rejects(()=>prepareOperation(state,{...staff,role:'admin'},input()),/관리자/);
  const p=await prepareOperation(state,admin,input());applyPreparedOperation(state,p);assert.equal(state.tables.students[0].classId,2);assert.equal(state.tables.schoolOperations.length,2);assert.equal(googlePortalData(state,state.tables.users[2]).subjects[0].name,'원래 과목');assert.equal(googlePortalData(state,staff).students.length,0);assert.equal('schoolOperations' in googlePortalData(state,admin),false);
  const old=emptySchoolState();delete old.tables.schoolOperations;const normalized=normalizeGoogleState(old);assert.deepEqual(normalized.tables.schoolOperations,[]);normalized.tables.schoolOperations=state.tables.schoolOperations;
  await assert.rejects(()=>commitGoogleState(normalized),/코드 갱신/);assert.ok(tableNames.includes('schoolOperations'));
});
test('administrative archive and operations endpoints deny student, teacher, anonymous and cross-origin requests',async()=>{
 const db=dbFixture();try{
  for(const login of [null,'teacher','student']){globalThis.__portalTestUser=login?{userId:login,email:login+'@example.test',displayName:login}:null;
   const expected=login?403:401;assert.equal((await historyGET(new Request('https://school.example/api/admin/operations'))).status,expected);assert.equal((await archiveGET(new Request('https://school.example/api/admin/archive?snapshotId=1'))).status,expected);assert.equal((await operationsPOST(request({intent:'preview',input:input()}))).status,expected);
  }
  globalThis.__portalTestUser={userId:'owner',email:'owner@example.test',displayName:'가상 관리자'};assert.equal((await operationsPOST(new Request('https://school.example/api/admin/operations',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}))).status,403);
  const saved=JSON.stringify(profileImportExample);db.sql.prepare("INSERT INTO profile_snapshots(student_id,created_by,version_label,schema_version,one_line_profile,narrative,raw_json,is_active) VALUES(1,1,'이전','1.2','요약','흐름',?,0)").run(saved);
  const res=await archiveGET(new Request('https://school.example/api/admin/archive?snapshotId=1'));assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'private, no-store');assert.equal((await res.json()).profile.versionLabel,profileImportExample.versionLabel);
  const download=await archiveGET(new Request('https://school.example/api/admin/archive?snapshotId=1&download=1'));assert.equal(await download.text(),saved);assert.match(download.headers.get('Content-Disposition'),/attachment/);assert.equal(db.sql.prepare('SELECT is_active FROM profile_snapshots').get().is_active,0);
 }finally{delete globalThis.__portalTestUser;db.sql.close();}
});
test('research counts deduplicate keyword/student and record years, exclude examples and retain alumni and old-version summary searches',()=>{
 const {state,admin}=stateFixture();state.tables.students[1].status='graduated';state.tables.students[1].graduatedYear=2027;
 insertRow(state,'students',{classId:1,name:'예시',studentNumber:'099',isExample:true});
 for(const [id,studentId,active] of [[1,1,true],[2,1,false],[3,2,true]])insertRow(state,'profileSnapshots',{id,studentId,createdBy:1,isActive:active,versionLabel:'버전'+id,oneLineProfile:id===2?'오래된 유전자 연구':'현재 생명 연구',sourceYearsJson:'[2025,2026]',narrative:'흐름',rawJson:'{}'});
 for(const [id,snapshotId,studentId] of [[1,1,1],[2,1,1],[3,3,2],[4,2,1]])insertRow(state,'researchKeywords',{id,snapshotId,studentId,keyword:snapshotId===2?'과거키워드':'생명',weight:50,category:'concept',description:'설명'});
 insertRow(state,'studentRecords',{studentId:1,ownerUserId:1,recordGrade:2,schoolYear:2026,coverageJson:JSON.stringify([{grade:1,schoolYear:2025},{grade:2,schoolYear:2026}]),originalName:'원본',objectKey:'a',sizeBytes:1,contentType:'pdf'});
 const data=googlePortalData(state,admin),filter={query:'',status:'all',schoolYear:'all',graduatedYear:'all'},members=archiveStudents(data,filter),summary=schoolResearchSummary(data,members);
 assert.equal(members.length,2);assert.equal(summary.keywords[0].count,2);assert.equal(summary.keywordCount,1);assert.equal(summary.versionCount,3);assert.deepEqual(summary.years.map(y=>y.records),[1,1]);assert.deepEqual(archiveStudents(data,{...filter,query:'오래된 유전자'}).map(s=>s.id),[1]);assert.deepEqual(archiveStudents(data,{...filter,graduatedYear:'2027'}).map(s=>s.id),[2]);
});
