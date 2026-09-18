import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {GET,POST} from '../app/api/student/route.ts';
import {POST as accessPost} from '../app/api/school-access/route.ts';
import {saveGuidance} from '../lib/guidance-store.ts';
import {getStudentReport} from '../lib/student-data.ts';
import {studentOverview,studentProjection,studentUrl} from '../lib/student-overview.ts';
import {emptySchoolState,insertRow} from '../lib/school-tables.ts';
import {googlePortalData} from '../lib/google-school.ts';
import {registerStudentIdentity,resolveGoogleIdentity} from '../lib/school-identities.ts';
import {schoolSite} from '../lib/site-runtime.ts';
import {guidancePayloadSchema} from '../lib/guidance.ts';

class MemoryD1 {
 sql=new DatabaseSync(':memory:');
 constructor(){this.sql.exec('PRAGMA foreign_keys=ON');for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));}
 prepare(query){const db=this;const make=params=>({bind(...args){return make(args);},async raw(){const s=db.sql.prepare(query);s.setReturnArrays(true);return s.all(...params);},async all(){return{success:true,results:db.sql.prepare(query).all(...params),meta:{}};},async run(){db.sql.prepare(query).run(...params);return{success:true,results:[],meta:{}};}});return make([]);}
 async batch(queries){this.sql.exec('BEGIN');try{const results=[];for(const q of queries)results.push(await q.all());this.sql.exec('COMMIT');return results;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
const login=n=>({userId:n,email:`${n}@example.test`,displayName:n});
const request=body=>new Request('https://student.example/api/student',{method:'POST',headers:{Origin:'https://student.example','Content-Type':'application/json'},body:JSON.stringify(body)});
const read=(suffix='')=>GET(new Request(`https://student.example/api/student${suffix}`));
const actor=(id,name,role='student')=>({id,authUserId:name,email:`${name}@example.test`,displayName:name,role,status:'approved'});
function fixture(){
 const db=new MemoryD1();globalThis.__portalTestEnv.DB=db;
 db.sql.exec("INSERT INTO users(auth_user_id,email,display_name,role,status) VALUES('owner','owner@example.test','관리자','admin','approved'),('teacher','teacher@example.test','교사','teacher','approved'),('pupil','pupil@example.test','학생','student','approved'),('other','other@example.test','다른 학생','student','approved'),('pending','pending@example.test','대기','student','pending'),('unlinked','unlinked@example.test','미연결','student','approved'); INSERT INTO classes(teacher_id,name,grade,school_year,invite_code) VALUES(2,'가상 2학년',2,2026,'PRIVATE'),(1,'가상 3학년',3,2026,'OTHER'); INSERT INTO students(class_id,student_number,name,email,user_id) VALUES(1,'0001','가상 학생','pupil@example.test',3),(2,'0002','다른 가상 학생','other@example.test',4);");
 return db;
}
function cleanup(db){delete globalThis.__portalTestUser;for(const key of ['TRACE_PORTAL_MODE','TRACE_HOME_SITE_ID','TRACE_SHARED_GOOGLE_CONNECTION'])delete globalThis.__portalTestEnv[key];db.sql.close();}
test('student API returns only the linked student and separates login, approval, role and missing linkage',async()=>{
 const db=fixture();try{
  assert.equal((await read()).status,401);
  globalThis.__portalTestUser=login('pending');const pending=await (await read()).json();assert.equal(pending.state,'pending');assert.equal(pending.data,undefined);
  globalThis.__portalTestUser=login('teacher');assert.equal((await read()).status,403);
  globalThis.__portalTestUser=login('unlinked');assert.equal((await (await read()).json()).state,'unlinked');
  globalThis.__portalTestUser=login('pupil');const response=await read();const report=await response.json();
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(report.readOnly,false);assert.deepEqual(report.choices,[]);assert.deepEqual(report.data.students.map(s=>s.id),[1]);assert.deepEqual(report.data.classes.map(c=>c.id),[1]);assert.equal(report.data.classes[0].inviteCode,'');assert.equal(report.data.viewer.authUserId,undefined);assert.equal(report.data.viewer.loginIdentityId,undefined);assert.deepEqual(report.data.staffUsers,[]);
  for(const suffix of ['?student=2','?student=0','?student=NaN','?student=1.5'])assert.equal((await read(suffix)).status,403,suffix);
  assert.equal((await read('?student=1')).status,200);
  db.sql.exec("UPDATE users SET status='suspended' WHERE id=3");assert.equal((await read()).status,403);
 }finally{cleanup(db);}
});
test('student writes follow draft, submission, teacher revision and confirmation without overwriting history',async()=>{
 const db=fixture();try{
  globalThis.__portalTestUser=login('pupil');
  const first=await POST(request({kind:'question',payload:{title:'가상 질문',text:'수업에서 생긴 의문',status:'draft',feedback:'위조',reviewedBy:'위조',ownerId:1}}));assert.equal(first.status,200);
  let report=await (await read()).json(),entry=report.data.guidance[0];assert.equal(entry.payload.status,'draft');assert.equal(entry.payload.feedback,'');assert.equal(entry.payload.ownerId,3);
  const key=entry.entityKey;
  assert.equal((await POST(request({kind:'question',entityKey:key,expectedRevision:1,intent:'submit',payload:{response:'실험하고 근거를 비교했습니다.'}}))).status,200);
  assert.equal((await POST(request({kind:'question',entityKey:key,expectedRevision:1,payload:{title:'오래된 창'}}))).status,400);
  await saveGuidance(actor(2,'teacher','teacher'),{kind:'question',studentId:1,entityKey:key,expectedRevision:2,intent:'review',payload:{status:'revision_requested',feedback:'비교 조건을 구체적으로 밝혀 주세요.'}});
  report=await (await read()).json();assert.equal(report.data.guidance[0].payload.status,'revision_requested');assert.equal(studentOverview(report.data).revisions.length,1);
  assert.equal((await POST(request({kind:'question',entityKey:key,expectedRevision:3,intent:'submit',payload:{response:'빛의 양과 온도를 동일하게 했습니다.'}}))).status,200);
  await saveGuidance(actor(2,'teacher','teacher'),{kind:'question',studentId:1,entityKey:key,expectedRevision:4,intent:'review',payload:{status:'confirmed',feedback:'변인 통제 근거를 확인했습니다.'}});
  assert.equal((await POST(request({kind:'question',entityKey:key,expectedRevision:5,payload:{title:'확인된 기록 덮기'}}))).status,400);
  assert.equal((await POST(request({kind:'question',payload:{title:'다음 질문',parentKey:key}}))).status,200);
  const history=await (await read(`?history=${key}`)).json();assert.equal(history.history.length,5);assert.deepEqual(history.history.map(e=>e.revision).sort(),[1,2,3,4,5]);assert.equal(history.history.find(e=>e.revision===2).payload.response,'실험하고 근거를 비교했습니다.');
 }finally{cleanup(db);}
});
test('student cannot forge staff actions, other-student keys, private notes, source links or administrative previews',async()=>{
 const db=fixture();try{
  const teacher=actor(2,'teacher','teacher'),owner=actor(1,'owner','admin');
  const privateEntry=(await saveGuidance(teacher,{kind:'observation',studentId:1,audience:'staff',payload:{title:'PRIVATE NOTE'}})).entry;
  const publicEntry=(await saveGuidance(teacher,{kind:'action',studentId:1,payload:{title:'공유 과제'}})).entry;
  const otherEntry=(await saveGuidance(owner,{kind:'question',studentId:2,payload:{title:'OTHER PUPIL'}})).entry;
  globalThis.__portalTestUser=login('pupil');
  for(const body of [{kind:'observation',payload:{title:'위조'}},{kind:'reference',payload:{title:'위조'}},{kind:'question',studentId:2,payload:{title:'침입'}},{kind:'question',action:'addStudent',payload:{title:'침입'}},{kind:'action',intent:'review',entityKey:publicEntry.entityKey,expectedRevision:1,payload:{status:'confirmed',feedback:'위조'}},{kind:'question',audience:'staff',payload:{title:'비공개 위조'}}])assert.equal((await POST(request(body))).status,403,JSON.stringify(body));
  for(const body of [{kind:'action',entityKey:publicEntry.entityKey,expectedRevision:1,payload:{title:'교사 과제 변경'}},{kind:'question',entityKey:otherEntry.entityKey,expectedRevision:1,payload:{title:'다른 학생 기록 변경'}},{kind:'question',payload:{title:'비공개 연결',parentKey:privateEntry.entityKey}}])assert.equal((await POST(request(body))).status,400);
  assert.equal((await read(`?history=${privateEntry.entityKey}`)).status,403);assert.equal((await read(`?history=${otherEntry.entityKey}`)).status,403);
  assert.doesNotMatch(JSON.stringify(await (await read()).json()),/PRIVATE NOTE|OTHER PUPIL/);
  assert.equal((await POST(new Request('https://student.example/api/student',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}))).status,403);
  globalThis.__portalTestUser=login('owner');const choice=await (await read()).json();assert.equal(choice.state,'choose');assert.equal(choice.data,undefined);assert.equal(choice.choices.length,2);
  const preview=await (await read('?student=1')).json();assert.equal(preview.readOnly,true);assert.deepEqual(preview.data.students.map(s=>s.id),[1]);assert.doesNotMatch(JSON.stringify(preview.data),/PRIVATE NOTE|OTHER PUPIL/);
  assert.equal((await read(`?student=1&history=${privateEntry.entityKey}`)).status,403);
  assert.equal((await POST(request({kind:'question',studentId:1,payload:{title:'학생 대신 작성'}}))).status,403);
 }finally{cleanup(db);}
});
test('latest private revision hides an entire record and student-visible history excludes private revisions',async()=>{
 const db=fixture();try{
  const teacher=actor(2,'teacher','teacher');const one=(await saveGuidance(teacher,{kind:'action',studentId:1,payload:{title:'공개 1'}})).entry;
  await saveGuidance(teacher,{kind:'action',studentId:1,entityKey:one.entityKey,expectedRevision:1,audience:'staff',payload:{title:'SECRET REVISION'}});
  globalThis.__portalTestUser=login('pupil');assert.equal((await read(`?history=${one.entityKey}`)).status,403);assert.equal((await (await read()).json()).data.guidance.length,0);
  await saveGuidance(teacher,{kind:'action',studentId:1,entityKey:one.entityKey,expectedRevision:2,audience:'student',payload:{title:'다시 공개'}});
  const history=await (await read(`?history=${one.entityKey}`)).json();assert.deepEqual(history.history.map(e=>e.revision).sort(),[1,3]);assert.doesNotMatch(JSON.stringify(history),/SECRET REVISION/);
  globalThis.__portalTestUser=login('owner');assert.doesNotMatch(JSON.stringify(await (await read(`?student=1&history=${one.entityKey}`)).json()),/SECRET REVISION/);
 }finally{cleanup(db);}
});
test('duplicate roster links, revoked sessions, persisted roles and unconfigured secondary storage fail closed',async()=>{
 const db=fixture();try{
  const student=actor(3,'pupil');await assert.rejects(()=>getStudentReport({...student,role:'admin'},2),/본인/);await assert.rejects(()=>getStudentReport({...student,loginIdentityId:999,loginSiteId:'unknown'}),/해제/);
  db.sql.exec("UPDATE students SET user_id=3 WHERE id=2");globalThis.__portalTestUser=login('pupil');assert.equal((await read()).status,403);assert.equal((await POST(request({kind:'question',payload:{title:'연결 충돌'}}))).status,403);
  globalThis.__portalTestEnv.TRACE_PORTAL_MODE='student';globalThis.__portalTestEnv.TRACE_HOME_SITE_ID='other-home';
  const before=db.sql.prepare('SELECT count(*) n FROM school_identities').get().n;const response=await read();assert.equal(response.status,503);assert.equal((await response.json()).state,'setup');assert.equal(db.sql.prepare('SELECT count(*) n FROM school_identities').get().n,before);
 }finally{cleanup(db);}
});
function googleFixture(){const state=emptySchoolState(),admin=insertRow(state,'users',{authUserId:'owner',email:'owner@example.test',displayName:'관리자',role:'admin',status:'approved'}),pupil=insertRow(state,'users',{authUserId:'pupil',email:'pupil@example.test',displayName:'가상 학생',role:'student',status:'approved'});const cls=insertRow(state,'classes',{teacherId:admin.id,name:'가상 반',grade:2,schoolYear:2026,inviteCode:'PRIVATE'}),student=insertRow(state,'students',{classId:cls.id,studentNumber:'0001',name:'가상 학생',email:'pupil@example.test',userId:pupil.id}),other=insertRow(state,'students',{classId:cls.id,studentNumber:'0002',name:'다른 가상 학생',email:'new@example.test'});return{state,admin,pupil,student,other};}
test('Google student projection isolates selected records and overview prioritizes revisions using latest state',()=>{
 const {state,admin,student,other}=googleFixture();
 const add=(key,who,status,revision=1,audience='student',dueDate='')=>insertRow(state,'guidanceEntries',{entityKey:key,revision,studentId:who.id,kind:'question',audience,payloadJson:JSON.stringify(guidancePayloadSchema.parse({title:key,status,dueDate})),createdBy:admin.id,actorName:'관리자',actorRole:'admin'});
 add('already-done',student,'active');add('already-done',student,'confirmed',2);add('revision',student,'revision_requested');add('late',student,'active',1,'student','2026-09-17');add('draft',student,'draft',1,'student','2026-09-16');add('today',student,'active',1,'student','2026-09-18');add('other-private',student,'active',1,'staff');add('other-student',other,'active');
 const projected=studentProjection(googlePortalData(state,admin),student.id),summary=studentOverview(projected,'2026-09-18');
 assert.deepEqual(projected.students.map(s=>s.id),[student.id]);assert.equal(projected.classes[0].inviteCode,'');assert.deepEqual(projected.referenceMaterials,[]);assert.doesNotMatch(JSON.stringify(projected),/other-private|other-student/);assert.equal(summary.next[0].entityKey,'revision');assert.deepEqual(summary.overdue.map(e=>e.entityKey),['late']);assert.equal(summary.next.length,4);assert.equal(studentUrl('journal',1,'a&b'),'/?view=journal&student=1&entry=a%26b');
});
test('student onboarding validates manual verification, email, role and conflicts before mutation',()=>{
 const {state,admin,pupil,other}=googleFixture();const identity=insertRow(state,'schoolIdentities',{siteId:'student-site',subject:'new-site-subject',portalMode:'student',email:'new@example.test',displayName:'로그인 표시명',status:'pending'});
 const body={identityId:identity.id,expectedRevision:1,studentId:other.id,confirmStudent:true,note:'학생 명부와 본인 대면 확인'};
 for(const patch of [{confirmStudent:false},{note:'x'},{studentId:1},{expectedRevision:9}]){const before=JSON.stringify(state);assert.throws(()=>registerStudentIdentity(state,admin,{...body,...patch}));assert.equal(JSON.stringify(state),before);}
 assert.throws(()=>registerStudentIdentity(state,{...pupil,role:'admin'},body),/관리자/);
 registerStudentIdentity(state,admin,body);const account=state.tables.users.find(u=>u.id===other.userId);assert.equal(account.role,'student');assert.equal(account.displayName,other.name);assert.notEqual(account.authUserId,identity.subject);assert.equal(identity.userId,account.id);assert.equal(identity.status,'approved');assert.equal(state.tables.identityEvents.length,1);assert.equal(state.tables.students.length,2);
 assert.throws(()=>registerStudentIdentity(state,admin,body),/대기/);
 const collision=insertRow(state,'schoolIdentities',{siteId:'student-site',subject:'another-subject',portalMode:'student',email:'new@example.test',displayName:'다른 요청',status:'pending'});const second=insertRow(state,'students',{classId:other.classId,studentNumber:'0003',name:'충돌 명단',email:'new@example.test'});assert.throws(()=>registerStudentIdentity(state,admin,{...body,identityId:collision.id,studentId:second.id}),/다른 학생/);assert.equal(collision.userId,null);
 account.status='suspended';assert.throws(()=>registerStudentIdentity(state,admin,{...body,identityId:collision.id}),/정지/);assert.equal(account.status,'suspended');
});
test('student onboarding can approve an existing pending student account without changing its ID or prior records',()=>{
 const {state,admin,pupil,student}=googleFixture();pupil.status='pending';student.userId=null;
 const identity=insertRow(state,'schoolIdentities',{siteId:'student-site',subject:'different-subject',portalMode:'student',email:'PUPIL@example.test',displayName:'표시명',status:'pending'});
 registerStudentIdentity(state,admin,{identityId:identity.id,expectedRevision:1,studentId:student.id,confirmStudent:true,note:'본인 확인 후 기존 계정 연결'});
 assert.equal(state.tables.users.length,2);assert.equal(student.userId,pupil.id);assert.equal(identity.userId,pupil.id);assert.equal(pupil.status,'approved');assert.equal(pupil.authUserId,'pupil');
});
test('secondary student onboarding and API writes persist through the shared Google revision boundary',async()=>{
 const env=globalThis.__portalTestEnv,originalFetch=globalThis.fetch;const {state,admin,other}=googleFixture();state.homeSiteId='home';
 env.TRACE_PORTAL_MODE='student';env.TRACE_HOME_SITE_ID='home';env.TRACE_SHARED_GOOGLE_CONNECTION=JSON.stringify({homeSiteId:'home',secret:'a'.repeat(64),endpoint:'https://script.google.com/macros/s/'+'a'.repeat(24)+'/exec'});
 const site=schoolSite();resolveGoogleIdentity(state,login('owner'),{...site,isHome:true});let commits=0;
 try{
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(JSON.parse(options.body).payload);assert.equal(body.homeSiteId,'home');if(body.operation==='read')return Response.json({ok:true,data:state});assert.equal(body.operation,'commit');assert.equal(body.data.expectedRevision,state.revision);state.tables=body.data.tables;state.revision++;commits++;return Response.json({ok:true,data:{revision:state.revision}});};
  globalThis.__portalTestUser=login('new');assert.equal((await (await read()).json()).state,'pending');const identity=state.tables.schoolIdentities.find(i=>i.subject==='new');assert.equal(state.tables.users.length,2);
  globalThis.__portalTestUser=login('owner');const linked=await accessPost(request({action:'registerStudent',identityId:identity.id,expectedRevision:identity.revision,studentId:other.id,note:'학교 대면 본인 확인',confirmStudent:true}));assert.equal(linked.status,200,JSON.stringify(await linked.json()));
  globalThis.__portalTestUser=login('new');const ready=await (await read()).json();assert.equal(ready.state,'ready');assert.equal(ready.storage,'google');assert.deepEqual(ready.data.students.map(s=>s.id),[other.id]);
  assert.equal((await POST(request({kind:'reflection',payload:{title:'읽고 달라진 생각'}}))).status,200);assert.equal(state.tables.guidanceEntries.length,1);assert.equal(state.tables.guidanceEntries[0].studentId,other.id);assert.equal(state.tables.identityEvents.length,1);assert.equal(commits,3);
 }finally{globalThis.fetch=originalFetch;delete globalThis.__portalTestUser;for(const key of ['TRACE_PORTAL_MODE','TRACE_HOME_SITE_ID','TRACE_SHARED_GOOGLE_CONNECTION'])delete env[key];}
});
