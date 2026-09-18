import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {GET,POST} from '../app/api/admin/route.ts';
import {getAdminReport,performAdminAction} from '../lib/admin-data.ts';
import {adminOverview,studentWorkspaceUrl} from '../lib/admin-overview.ts';
import {emptySchoolState,insertRow} from '../lib/school-tables.ts';
import {googlePortalData} from '../lib/google-school.ts';
import {schoolSite} from '../lib/site-runtime.ts';

class MemoryD1 {
 sql=new DatabaseSync(':memory:');
 constructor(){this.sql.exec('PRAGMA foreign_keys=ON');for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));}
 prepare(query){const db=this;const make=params=>({bind(...args){return make(args);},async raw(){const s=db.sql.prepare(query);s.setReturnArrays(true);return s.all(...params);},async all(){return{success:true,results:db.sql.prepare(query).all(...params),meta:{}};},async run(){db.sql.prepare(query).run(...params);return{success:true,results:[],meta:{}};}});return make([]);}
 async batch(queries){this.sql.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.all());this.sql.exec('COMMIT');return result;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
const login=n=>({userId:n,email:`${n}@example.test`,displayName:n});
const request=body=>new Request('https://school.example/api/admin',{method:'POST',headers:{Origin:'https://school.example','Content-Type':'application/json'},body:JSON.stringify(body)});
function fixture(){
 const db=new MemoryD1();globalThis.__portalTestEnv.DB=db;
 db.sql.exec("INSERT INTO users(auth_user_id,email,display_name,role,status) VALUES('owner','owner@example.test','가상 관리자','admin','approved'),('teacher','teacher@example.test','가상 교사','teacher','approved'),('pupil','pupil@example.test','가상 학생','student','approved'),('pending','pending@example.test','가상 대기자','student','pending'); INSERT INTO classes(teacher_id,name,grade,school_year,invite_code) VALUES(2,'가상 2학년',2,2026,'QA'); INSERT INTO students(class_id,student_number,name,email) VALUES(1,'001','가상 학생','pending@example.test');");
 return db;
}
test('administrator endpoints deny anonymous, teacher, student and pending accounts before exposing school data',async()=>{
 const db=fixture();try{
   globalThis.__portalTestUser=null;assert.equal((await GET()).status,401);
   const home=schoolSite().siteId;globalThis.__portalTestEnv.TRACE_PORTAL_MODE='admin';globalThis.__portalTestEnv.TRACE_HOME_SITE_ID=home;
   for(const subject of ['teacher','pupil','pending']){globalThis.__portalTestUser=login(subject);const res=await GET();assert.equal(res.status,403,subject);assert.equal((await res.json()).data,undefined);assert.equal((await POST(request({action:'addClass',name:'침입',grade:2,schoolYear:2026,teacherId:2}))).status,403);}
   assert.equal(db.sql.prepare('SELECT count(*) n FROM classes').get().n,1);
   globalThis.__portalTestUser=login('owner');const res=await GET();assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');const report=await res.json();assert.equal(report.storage,'legacy');assert.equal(report.accounts.length,4);assert.equal('authUserId' in report.accounts[0],false);assert.equal('secret' in report,false);
   assert.equal((await POST(new Request('https://school.example/api/admin',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}))).status,403);
 }finally{delete globalThis.__portalTestUser;delete globalThis.__portalTestEnv.TRACE_PORTAL_MODE;delete globalThis.__portalTestEnv.TRACE_HOME_SITE_ID;db.sql.close();}
});
test('administrator workflow persists registration, student approval, teacher assignment and graduation without replacing records',async()=>{
 const db=fixture();try{
   globalThis.__portalTestUser=login('owner');
   assert.equal((await POST(request({action:'approveUser',userId:4,studentId:1}))).status,200);
   assert.equal(db.sql.prepare('SELECT user_id FROM students WHERE id=1').get().user_id,4);
   assert.equal((await POST(request({action:'assignClassTeacher',classId:1,teacherId:1}))).status,200);
   assert.equal(db.sql.prepare('SELECT teacher_id FROM classes WHERE id=1').get().teacher_id,1);
   const before=db.sql.prepare('SELECT id,student_number,user_id FROM students WHERE id=1').get();
   assert.equal((await POST(request({action:'updateStudentStatus',studentId:1,status:'graduated',graduatedYear:2028}))).status,200);
   assert.deepEqual(db.sql.prepare('SELECT id,student_number,user_id FROM students WHERE id=1').get(),before);
   assert.equal(db.sql.prepare('SELECT graduated_year FROM students WHERE id=1').get().graduated_year,2028);
   assert.equal((await POST(request({action:'updateStudentStatus',studentId:1,status:'active'}))).status,200);
   assert.equal(db.sql.prepare('SELECT graduated_year FROM students WHERE id=1').get().graduated_year,null);
   assert.equal((await POST(request({action:'bulkAddStudents',classId:1,students:[{studentNumber:'0007',name:'가상 신규',email:'new@example.test'}]}))).status,200);
   assert.equal(db.sql.prepare("SELECT student_number FROM students WHERE email='new@example.test'").get().student_number,'0007');
   assert.equal((await POST(request({action:'deleteSchool'}))).status,400);
 }finally{delete globalThis.__portalTestUser;db.sql.close();}
});
test('stored roles, revoked identity and existing student links cannot be overwritten through administration',async()=>{
 const db=fixture();try{
   const teacher={id:2,authUserId:'teacher',role:'admin',status:'approved'};
   await assert.rejects(()=>getAdminReport(teacher),/관리자/);
   await assert.rejects(()=>performAdminAction(teacher,{action:'approveTeacher',userId:4}),/관리자/);
   const owner={id:1,authUserId:'owner',role:'admin',status:'approved'};
   await assert.rejects(()=>getAdminReport({...owner,loginIdentityId:999,loginSiteId:'home'}),/해제/);
   db.sql.exec('UPDATE students SET user_id=3 WHERE id=1');
   await assert.rejects(()=>performAdminAction(owner,{action:'approveUser',userId:4,studentId:1}),/다른 계정/);
   assert.equal(db.sql.prepare('SELECT user_id FROM students WHERE id=1').get().user_id,3);
   db.sql.exec("UPDATE users SET status='suspended' WHERE id=1");await assert.rejects(()=>getAdminReport(owner),/관리자/);
 }finally{db.sql.close();}
});
test('operational counts exclude examples and alumni and recognize combined current-year records',()=>{
 const state=emptySchoolState(),admin=insertRow(state,'users',{authUserId:'owner',email:'owner@example.test',displayName:'가상 관리자',role:'admin',status:'approved'});
 const cls=insertRow(state,'classes',{teacherId:admin.id,name:'3학년',grade:3,schoolYear:2026,inviteCode:'C'});
 const student=insertRow(state,'students',{classId:cls.id,name:'가상 재학생',studentNumber:'001'});
 insertRow(state,'students',{classId:cls.id,name:'가상 졸업생',studentNumber:'002',status:'graduated'});insertRow(state,'students',{classId:cls.id,name:'예시',studentNumber:'003',isExample:true});
 insertRow(state,'studentRecords',{studentId:student.id,ownerUserId:admin.id,recordGrade:1,schoolYear:2024,coverageJson:JSON.stringify([{grade:1,schoolYear:2024},{grade:2,schoolYear:2025},{grade:3,schoolYear:2026}]),originalName:'가상.pdf',contentType:'application/pdf',objectKey:'qa',sizeBytes:1,sha256:'a'.repeat(64)});
 const data=googlePortalData(state,admin);const counts=adminOverview(data);
 assert.equal(counts.active,1);assert.equal(counts.graduated,1);assert.deepEqual(counts.missingRecords,[]);assert.deepEqual(counts.missingProfiles,[student.id]);assert.deepEqual(counts.unlinked,[student.id]);
 assert.equal(studentWorkspaceUrl(12,'academics'),'/workspace?view=academics&student=12');
});
