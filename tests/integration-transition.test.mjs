import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {emptySchoolState,insertRow,tableColumns,tableNames} from '../lib/school-tables.ts';
import {inspectGoogleHealth} from '../lib/google-health.ts';
import {schoolDigestInput} from '../lib/school-data-digest.ts';
import {createMigrationBackupReceipt,verifyMigrationBackupReceipt} from '../lib/migration-backup.ts';
import {accountReadiness} from '../lib/operational-readiness.ts';
import {POST as storagePOST} from '../app/api/storage/route.ts';
import {GET as backupGET} from '../app/api/school-backup/route.ts';
import {GET as readinessGET} from '../app/api/admin/readiness/route.ts';
import {verifySchoolBackup} from '../lib/verify-school-backup.ts';
import {schoolSite} from '../lib/site-runtime.ts';
import {scriptHarness} from './google-script-harness.mjs';
import {resolveGoogleIdentity,applyIdentityReview,currentIdentityActor} from '../lib/school-identities.ts';
import {googlePortalData} from '../lib/google-school.ts';
import {applyGuidanceAction} from '../lib/guidance-store.ts';
import {prepareOperation,applyPreparedOperation} from '../lib/admin-operations.ts';

const endpoint='https://script.google.com/macros/s/'+'t'.repeat(32)+'/exec';
const config={id:1,state:'legacy',secret:'test-only-key-'.repeat(5),endpoint,ownerAuthUserId:'owner',updatedAt:''};
test('health checks all tables and ordered columns, school scope and storage owner',()=>{
 const health={version:1,homeSiteId:'home',schemaTables:tableNames,schemaColumns:tableColumns,ownerEmail:'OWNER@example.test',spreadsheetId:'sheet',folderId:'folder'};
 const locations={ownerEmail:'owner@example.test',spreadsheetId:'sheet',folderId:'folder'};
 assert.equal(inspectGoogleHealth(health,'home',locations).updated,true);
 for(const value of [{...health,schemaTables:tableNames.filter(n=>n!=='schoolOperations')},{...health,schemaColumns:undefined},{...health,schemaColumns:{...tableColumns,students:[...tableColumns.students].reverse()}},{...health,version:2},{...health,homeSiteId:'other'},{...health,ownerEmail:undefined},{...health,spreadsheetId:'other'}])assert.equal(inspectGoogleHealth(value,'home',locations).updated,false);
});
test('migration backup receipt rejects changed data, expiry, tampering and another owner, endpoint or school',async()=>{
 const {tables}=emptySchoolState();tables.users=[{id:1,authUserId:'owner'},{id:2,authUserId:'pupil'}];
 const now=10000000,receipt=await createMigrationBackupReceipt(tables,config,'home',now);
 await verifyMigrationBackupReceipt(receipt,tables,config,'home',now+1);
 const reversed=structuredClone(tables);reversed.users.reverse();assert.equal(schoolDigestInput(tables),schoolDigestInput(reversed));await verifyMigrationBackupReceipt(receipt,reversed,config,'home',now+1);
 for(const [r,t,c,h,time] of [[receipt,{...tables,users:[...tables.users,{id:3}]},config,'home',now+1],[receipt,tables,config,'home',now+1800000],[receipt,tables,{...config,ownerAuthUserId:'other'},'home',now+1],[receipt,tables,{...config,endpoint:endpoint+'x'},'home',now+1],[receipt,tables,config,'another',now+1],[receipt.slice(0,-5)+'wrong',tables,config,'home',now+1],['bad',tables,config,'home',now+1]])await assert.rejects(()=>verifyMigrationBackupReceipt(r,t,c,h,time),/백업/);
});

class MemoryD1 {
 sql=new DatabaseSync(':memory:');
 constructor(){this.sql.exec('PRAGMA foreign_keys=ON');for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));}
 prepare(query){const db=this;const make=params=>({bind(...args){return make(args);},async raw(){const stmt=db.sql.prepare(query);stmt.setReturnArrays(true);return stmt.all(...params);},async all(){return {success:true,results:db.sql.prepare(query).all(...params),meta:{}};},async run(){db.sql.prepare(query).run(...params);return {success:true,results:[],meta:{}};}});return make([]);}
 async batch(queries){this.sql.exec('BEGIN');try{const results=[];for(const q of queries)results.push(await q.all());this.sql.exec('COMMIT');return results;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
function integrationFixture(){
 const db=new MemoryD1(),script=scriptHarness(),env=globalThis.__portalTestEnv,oldFetch=globalThis.fetch;
 env.DB=db;script.config.homeSiteId=schoolSite().homeSiteId;
 env.TRACE_GOOGLE_LOCATIONS=JSON.stringify({...script.config,secret:undefined,columns:undefined});
 globalThis.__portalTestUser={userId:'owner',email:'owner@example.test',displayName:'가상 관리자'};
 db.sql.exec("INSERT INTO users(auth_user_id,email,display_name,role,status) VALUES('owner','owner@example.test','가상 관리자','admin','approved'),('teacher','teacher@example.test','가상 교사','teacher','approved'),('student','student@example.test','가상 학생','student','approved');INSERT INTO classes(teacher_id,name,grade,school_year,invite_code) VALUES(2,'가상 학급',2,2026,'X');INSERT INTO students(class_id,user_id,student_number,name) VALUES(1,3,'001','가상 학생');");
 db.sql.prepare('INSERT INTO storage_connection(id,state,endpoint,secret,owner_auth_user_id) VALUES(1,?,?,?,?)').run('legacy','',config.secret,'owner');
 const bytes=new TextEncoder().encode('%PDF 가상 학생부');
 db.sql.prepare("INSERT INTO student_records(student_id,owner_user_id,record_grade,school_year,object_key,original_name,content_type,size_bytes) VALUES(1,1,1,2025,'original','가상.pdf','application/pdf',?)").run(bytes.length);
 env.BUCKET={get:async()=>({size:bytes.length,body:new Blob([bytes]).stream(),arrayBuffer:async()=>bytes.slice().buffer})};
 globalThis.fetch=async(url,options)=>{assert.equal(url,endpoint);return Response.json(script.send({postData:{contents:options.body}}));};
 const state=()=>db.sql.prepare('SELECT state FROM storage_connection').get().state;
 const cleanup=()=>{globalThis.fetch=oldFetch;globalThis.__portalTestUser=null;delete env.TRACE_GOOGLE_LOCATIONS;delete env.DB;delete env.BUCKET;db.sql.close();};
 return {db,script,env,state,cleanup};
}
const post=body=>storagePOST(new Request('https://school.example/api/storage',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://school.example'},body:JSON.stringify(body)}));
async function ok(response){const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
async function backup(){const response=await backupGET();assert.equal(response.status,200);const receipt=response.headers.get('X-TRACE-Migration-Backup');assert.ok(receipt);assert.equal((await verifySchoolBackup(new Uint8Array(await response.arrayBuffer()))).fileCount,1);return receipt;}

test('HTTP transition copies originals through the signed Apps Script boundary, freezes writes and verifies readback',async()=>{
 const f=integrationFixture();try{
  await ok(await post({action:'connect',endpoint}));
  const report=await ok(await readinessGET());assert.equal(report.storage,'legacy');assert.equal(report.checks.find(c=>c.id==='schema').state,'pass');assert.equal(report.checks.find(c=>c.id==='roles').state,'manual');assert.doesNotMatch(JSON.stringify(report),/owner@example|가상 학생|test-only-key/);
  assert.equal((await post({action:'start'})).status,400);assert.equal(f.state(),'legacy');
  const receipt=await backup();f.db.sql.exec("UPDATE students SET student_number='002'");
  assert.equal((await post({action:'start',backupReceipt:receipt})).status,400);assert.equal(f.state(),'legacy');
  const fresh=await backup();assert.equal((await ok(await post({action:'start',backupReceipt:fresh}))).total,1);assert.equal(f.state(),'migrating');
  assert.throws(()=>f.db.sql.exec("UPDATE students SET name='changed'"),/frozen/);
  assert.equal((await backupGET()).status,400);
  // A dropped connection can resume without a new backup while writes remain frozen.
  assert.equal((await ok(await post({action:'start'}))).total,1);
  await ok(await post({action:'copyFile',index:0}));await ok(await post({action:'finish'}));assert.equal(f.state(),'google');
  const state=f.script.send(f.script.request('read',{}, {homeSiteId:schoolSite().homeSiteId,siteId:schoolSite().siteId})).data;
  assert.equal(state.tables.students[0].studentNumber,'002');assert.equal(state.tables.studentRecords[0].objectKey,'original');assert.equal(f.script.files.size,1);
  assert.throws(()=>f.db.sql.exec("DELETE FROM student_records"),/frozen/);
  const shared=await ok(await post({action:'sharedConnection'}));assert.equal(JSON.parse(JSON.parse(shared.sharedConfig).TRACE_SHARED_GOOGLE_CONNECTION).endpoint,endpoint);
  const googleBackup=await backupGET();assert.equal(googleBackup.status,200);assert.equal(googleBackup.headers.get('X-TRACE-Migration-Backup'),null);assert.equal((await verifySchoolBackup(new Uint8Array(await googleBackup.arrayBuffer()))).fileCount,1);
 }finally{f.cleanup();}
});
test('old scripts and nonempty target sheets cannot start a destructive transition',async()=>{
 const f=integrationFixture();try{
  const prior=f.script.config.columns.schoolOperations;delete f.script.config.columns.schoolOperations;
  assert.equal((await post({action:'connect',endpoint})).status,400);assert.equal(f.state(),'legacy');f.script.config.columns.schoolOperations=prior;
  await ok(await post({action:'connect',endpoint}));const receipt=await backup();
  const target=emptySchoolState();insertRow(target,'users',{authUserId:'existing',email:'existing@example.test',displayName:'기존 자료',role:'admin',status:'approved'});
  f.script.cells.users.push(tableColumns.users.map(k=>target.tables.users[0][k]??''));
  assert.equal((await post({action:'start',backupReceipt:receipt})).status,400);assert.equal(f.state(),'legacy');assert.equal(f.script.cells.users.length,2);
 }finally{f.cleanup();}
});
test('a legacy write between backup verification and the SQL freeze cancels transition without locking out users',async()=>{
 const f=integrationFixture();try{
  await ok(await post({action:'connect',endpoint}));const receipt=await backup(),send=globalThis.fetch;let changed=false;
  globalThis.fetch=async(url,options)=>{const request=JSON.parse(JSON.parse(options.body).payload);if(request.operation==='read'&&!changed){changed=true;f.db.sql.exec("UPDATE students SET student_number='009'");}return send(url,options);};
  assert.equal((await post({action:'start',backupReceipt:receipt})).status,400);assert.equal(changed,true);assert.equal(f.state(),'legacy');
  f.db.sql.exec("UPDATE students SET student_number='010'");assert.equal(f.script.files.size,0);
 }finally{f.cleanup();}
});
test('migration endpoints reject other roles, unauthenticated requests and cross-origin writes',async()=>{
 const f=integrationFixture();try{
  globalThis.__portalTestUser=null;assert.equal((await readinessGET()).status,401);assert.equal((await backupGET()).status,401);
  globalThis.__portalTestUser={userId:'teacher',email:'teacher@example.test',displayName:'가상 교사'};
  assert.equal((await readinessGET()).status,403);assert.equal((await backupGET()).status,403);assert.equal((await post({action:'prepare'})).status,400);
  const response=await storagePOST(new Request('https://school.example/api/storage',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({action:'start'})}));assert.equal(response.status,403);assert.equal(f.state(),'legacy');
 }finally{f.cleanup();}
});

test('three portal identities share stable school records while respecting class scope, private notes and revocation',async()=>{
 const state=emptySchoolState();
 const admin=insertRow(state,'users',{authUserId:'owner',email:'owner@example.test',displayName:'관리자',role:'admin',status:'approved'});
 const teacher=insertRow(state,'users',{authUserId:'teacher',email:'teacher@example.test',displayName:'교사',role:'teacher',status:'approved'});
 const pupil=insertRow(state,'users',{authUserId:'student',email:'student@example.test',displayName:'학생',role:'student',status:'approved'});
 const current=insertRow(state,'classes',{teacherId:teacher.id,name:'2학년',grade:2,schoolYear:2026,inviteCode:'X'});
 const other=insertRow(state,'classes',{teacherId:admin.id,name:'다른 학급',grade:2,schoolYear:2026,inviteCode:'Y'});
 const future=insertRow(state,'classes',{teacherId:admin.id,name:'3학년',grade:3,schoolYear:2027,inviteCode:'Z'});
 const student=insertRow(state,'students',{classId:current.id,userId:pupil.id,name:'학생',studentNumber:'001'});
 insertRow(state,'students',{classId:other.id,name:'다른 학생',studentNumber:'002'});
 const makeSite=(id,mode)=>({siteId:id,homeSiteId:'home',mode,isHome:id==='home'});
 const enter=(subject,user,site)=>resolveGoogleIdentity(state,{userId:subject,email:user.email,displayName:user.displayName},site).viewer;
 const adminViewer=enter('owner',admin,makeSite('home','admin'));
 const studentSite=makeSite('student-site','student'),teacherSite=makeSite('teacher-site','teacher');
 const pendingStudent=enter('student-separate-login',pupil,studentSite),pendingTeacher=enter('teacher-separate-login',teacher,teacherSite);
 assert.equal(pendingStudent.status,'pending');assert.equal(pendingTeacher.status,'pending');
 for(const [pending,user] of [[pendingStudent,pupil],[pendingTeacher,teacher]])applyIdentityReview(state,adminViewer,{action:'approve',identityId:pending.loginIdentityId,userId:user.id,expectedRevision:1,note:'본인 대면 확인 완료'});
 const studentViewer=enter('student-separate-login',pupil,studentSite),teacherViewer=enter('teacher-separate-login',teacher,teacherSite);
 assert.deepEqual(googlePortalData(state,studentViewer).students.map(s=>s.id),[student.id]);assert.deepEqual(googlePortalData(state,teacherViewer).students.map(s=>s.id),[student.id]);assert.equal(googlePortalData(state,adminViewer).students.length,2);
 applyGuidanceAction(state,teacherViewer,{action:'saveGuidance',kind:'observation',studentId:student.id,audience:'staff',payload:{title:'비공개 관찰',body:'교사 전용 메모'}});
 assert.equal(googlePortalData(state,studentViewer).guidance.length,0);assert.equal(googlePortalData(state,teacherViewer).guidance.length,1);
 const prepared=await prepareOperation(state,adminViewer,{batchId:crypto.randomUUID(),kind:'promote',reason:'가상 학년 전환 확인',targets:[{studentId:student.id,studentNumber:'0001'}],classId:future.id});applyPreparedOperation(state,prepared);
 assert.equal(googlePortalData(state,teacherViewer).students.length,0);assert.equal(googlePortalData(state,studentViewer).students[0].id,student.id);assert.equal(state.tables.guidanceEntries.length,1);assert.equal(state.tables.schoolOperations.length,1);
 assert.deepEqual(accountReadiness(state.tables).roleLinks,{student:1,teacher:1});
 applyIdentityReview(state,adminViewer,{action:'revoke',identityId:studentViewer.loginIdentityId,expectedRevision:2,note:'계정 변경으로 연결 해제'});
 assert.throws(()=>currentIdentityActor(state.tables,studentViewer),/해제/);assert.throws(()=>googlePortalData(state,studentViewer),/해제/);assert.equal(accountReadiness(state.tables).roleLinks.student,0);
});
