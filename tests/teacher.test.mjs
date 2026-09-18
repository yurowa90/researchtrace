import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {GET,POST} from '../app/api/teacher/route.ts';
import {getTeacherReport} from '../lib/teacher-data.ts';
import {teacherOverview,teacherStudents,koreanToday,teacherUrl} from '../lib/teacher-overview.ts';
import {emptySchoolState,insertRow} from '../lib/school-tables.ts';
import {googlePortalData} from '../lib/google-school.ts';
import {guidancePayloadSchema} from '../lib/guidance.ts';
import {schoolSite} from '../lib/site-runtime.ts';
import {registerTeacherIdentity} from '../lib/school-identities.ts';

class MemoryD1 {
 sql=new DatabaseSync(':memory:');
 constructor(){this.sql.exec('PRAGMA foreign_keys=ON');for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));}
 prepare(query){const db=this;const make=params=>({bind(...args){return make(args);},async raw(){const s=db.sql.prepare(query);s.setReturnArrays(true);return s.all(...params);},async all(){return{success:true,results:db.sql.prepare(query).all(...params),meta:{}};},async run(){db.sql.prepare(query).run(...params);return{success:true,results:[],meta:{}};}});return make([]);}
 async batch(queries){this.sql.exec('BEGIN');try{const results=[];for(const q of queries)results.push(await q.all());this.sql.exec('COMMIT');return results;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
const login=n=>({userId:n,email:`${n}@example.test`,displayName:n});
const request=body=>new Request('https://teacher.example/api/teacher',{method:'POST',headers:{Origin:'https://teacher.example','Content-Type':'application/json'},body:JSON.stringify(body)});
function fixture(){
 const db=new MemoryD1();globalThis.__portalTestEnv.DB=db;
 db.sql.exec("INSERT INTO users(auth_user_id,email,display_name,role,status) VALUES('owner','owner@example.test','관리자','admin','approved'),('teacher','teacher@example.test','교사 A','teacher','approved'),('other','other@example.test','교사 B','teacher','approved'),('pupil','pupil@example.test','학생','student','approved'),('pending','pending@example.test','대기','student','pending'); INSERT INTO classes(teacher_id,name,grade,school_year,invite_code) VALUES(2,'담당반',2,2026,'A'),(3,'다른반',3,2026,'B'); INSERT INTO students(class_id,student_number,name,email,user_id) VALUES(1,'0001','담당 학생','pupil@example.test',4),(2,'0002','다른반 학생','other-pupil@example.test',NULL);");
 return db;
}
function cleanup(db){delete globalThis.__portalTestUser;delete globalThis.__portalTestEnv.TRACE_PORTAL_MODE;delete globalThis.__portalTestEnv.TRACE_HOME_SITE_ID;delete globalThis.__portalTestEnv.TRACE_SHARED_GOOGLE_CONNECTION;db.sql.close();}
test('teacher endpoint distinguishes login, school approval and role, and exposes only assigned classes',async()=>{
 const db=fixture();try{
   assert.equal((await GET()).status,401);
   const home=schoolSite().siteId;globalThis.__portalTestEnv.TRACE_PORTAL_MODE='teacher';globalThis.__portalTestEnv.TRACE_HOME_SITE_ID=home;
   globalThis.__portalTestUser=login('pupil');assert.equal((await GET()).status,403);
   globalThis.__portalTestUser=login('pending');const pending=await (await GET()).json();assert.equal(pending.state,'pending');assert.equal(pending.data,undefined);
   globalThis.__portalTestUser=login('teacher');const response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const {data}=await response.json();assert.deepEqual(data.classes.map(c=>c.id),[1]);assert.deepEqual(data.students.map(s=>s.id),[1]);assert.equal(data.viewer.authUserId,undefined);assert.equal(data.viewer.loginIdentityId,undefined);assert.deepEqual(data.pendingUsers,[]);assert.deepEqual(data.staffUsers,[]);
   globalThis.__portalTestUser=login('owner');assert.equal((await (await GET()).json()).data.classes.length,2);
 }finally{cleanup(db);}
});
test('teacher registration enforces class scope and cannot dispatch administrator actions',async()=>{
 const db=fixture();try{
   globalThis.__portalTestUser=login('teacher');
   const students=[{studentNumber:'0008',name:'가상 신규',email:'new@example.test'}];
   assert.equal((await POST(request({action:'bulkAddStudents',classId:2,students}))).status,400);
   assert.equal(db.sql.prepare('SELECT count(*) n FROM students').get().n,2);
   assert.equal((await POST(request({action:'bulkAddStudents',classId:1,students}))).status,200);
   assert.equal(db.sql.prepare("SELECT student_number FROM students WHERE email='new@example.test'").get().student_number,'0008');
   for(const action of ['assignClassTeacher','approveTeacher','updateStudentStatus','setReferenceStatus','deleteSchool'])assert.equal((await POST(request({action,classId:2,teacherId:2,studentId:2,userId:5}))).status,403,action);
   assert.equal(db.sql.prepare('SELECT teacher_id FROM classes WHERE id=2').get().teacher_id,3);
   assert.equal((await POST(new Request('https://teacher.example/api/teacher',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}))).status,403);
 }finally{cleanup(db);}
});
test('teacher report rechecks stored roles and revoked identities, and fails closed without shared storage',async()=>{
 const db=fixture();try{
   const teacher={id:2,authUserId:'teacher',role:'teacher',status:'approved'};
   await assert.rejects(()=>getTeacherReport({...teacher,id:4,authUserId:'pupil'}),/교사/);
   await assert.rejects(()=>getTeacherReport({...teacher,loginIdentityId:999,loginSiteId:'invalid'}),/해제/);
   db.sql.exec("UPDATE users SET status='suspended' WHERE id=2");globalThis.__portalTestUser=login('teacher');assert.equal((await GET()).status,403);
   globalThis.__portalTestEnv.TRACE_PORTAL_MODE='teacher';globalThis.__portalTestEnv.TRACE_HOME_SITE_ID='another-school-home';
   const before=db.sql.prepare('SELECT count(*) n FROM school_identities').get().n;
   const result=await GET();assert.equal(result.status,503);const body=await result.json();assert.equal(body.state,'setup');assert.equal(body.data,undefined);
   assert.equal(db.sql.prepare('SELECT count(*) n FROM school_identities').get().n,before);
 }finally{cleanup(db);}
});
test('teacher inbox uses latest revisions, separates due dates from submissions, and excludes alumni and examples by default',()=>{
 const state=emptySchoolState(),viewer=insertRow(state,'users',{authUserId:'teacher',email:'teacher@example.test',displayName:'교사',role:'teacher',status:'approved'});
 const cls=insertRow(state,'classes',{teacherId:viewer.id,name:'가상 반',grade:3,schoolYear:2026,inviteCode:'A'});
 const own=insertRow(state,'students',{classId:cls.id,name:'가상 재학생',studentNumber:'0001'});
 const alumni=insertRow(state,'students',{classId:cls.id,name:'가상 졸업생',studentNumber:'0002',status:'graduated'});
 const example=insertRow(state,'students',{classId:cls.id,name:'가상 예시',studentNumber:'0003',isExample:true});
 const add=(key,studentId,kind,status,revision=1,dueDate='')=>insertRow(state,'guidanceEntries',{entityKey:key,revision,studentId,kind,payloadJson:JSON.stringify(guidancePayloadSchema.parse({title:key,status,dueDate})),audience:'student',createdBy:viewer.id,actorName:'교사',actorRole:'teacher'});
 add('resolved',own.id,'action','submitted');add('resolved',own.id,'action','confirmed',2);
 add('review',own.id,'question','submitted',1,'2026-09-16');
 add('fix',own.id,'correction','active');add('late',own.id,'action','active',1,'2026-09-17');
 add('draft',own.id,'correction','draft',1,'2026-09-17');add('today',own.id,'action','active',1,'2026-09-18');
 add('graduate',alumni.id,'question','submitted');add('example',example.id,'question','submitted');
 const data=googlePortalData(state,viewer),students=teacherStudents(data),summary=teacherOverview(data,students,'2026-09-18');
 assert.deepEqual(students.map(s=>s.id),[own.id]);assert.equal(summary.active,1);assert.deepEqual(summary.queue.map(q=>q.entry.entityKey),['review','fix','late']);assert.equal(summary.submitted,1);assert.equal(summary.corrections,1);assert.equal(summary.overdue,1);
 assert.deepEqual(teacherStudents(data,{query:'0001'}).map(s=>s.id),[own.id]);assert.equal(koreanToday(new Date('2026-09-17T16:00:00Z')),'2026-09-18');
 assert.equal(teacherUrl('guidance',own.id,'a&b'),`/?view=guidance&student=${own.id}&entry=a%26b`);
});

test('new teacher onboarding needs explicit administrator verification and binds a new school account atomically in the shared state',()=>{
 const state=emptySchoolState(),admin=insertRow(state,'users',{authUserId:'owner',email:'owner@example.test',displayName:'관리자',role:'admin',status:'approved'});
 const identity=insertRow(state,'schoolIdentities',{siteId:'teacher-site',subject:'new-site-subject',portalMode:'teacher',email:'new-teacher@example.test',displayName:'신규 교사',status:'pending'});
 const body={identityId:identity.id,expectedRevision:identity.revision,note:'교직원 명부와 본인 대면 확인',confirmTeacher:true};
 assert.throws(()=>registerTeacherIdentity(state,{...admin,role:'teacher',id:999},body),/권한/);
 assert.throws(()=>registerTeacherIdentity(state,admin,{...body,confirmTeacher:false}),/본인 확인/);
 assert.equal(state.tables.users.length,1);
 registerTeacherIdentity(state,admin,body);
 const account=state.tables.users.find(u=>u.id===identity.userId);
 assert.equal(account.role,'teacher');assert.equal(account.status,'approved');assert.notEqual(account.authUserId,identity.subject);assert.equal(identity.status,'approved');assert.equal(state.tables.identityEvents.length,1);assert.equal(state.tables.identityEvents[0].targetUserId,account.id);
 assert.throws(()=>registerTeacherIdentity(state,admin,body),/대기/);assert.equal(state.tables.users.length,2);
 const duplicate=insertRow(state,'schoolIdentities',{siteId:'another-teacher-site',subject:'different-subject',portalMode:'teacher',email:'NEW-TEACHER@example.test',displayName:'같은 이메일 요청',status:'pending'});
 assert.throws(()=>registerTeacherIdentity(state,admin,{...body,identityId:duplicate.id,expectedRevision:duplicate.revision}),/기존 계정/);assert.equal(state.tables.users.length,2);assert.equal(duplicate.status,'pending');
 const student=insertRow(state,'schoolIdentities',{siteId:'student-site',subject:'pupil-subject',portalMode:'student',email:'pupil@example.test',displayName:'학생',status:'pending'});
 assert.throws(()=>registerTeacherIdentity(state,admin,{...body,identityId:student.id,expectedRevision:student.revision}),/대기/);
});
