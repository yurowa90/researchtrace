import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {emptySchoolState,insertRow} from '../lib/school-tables.ts';
import {resolveGoogleIdentity,applyIdentityReview,currentIdentityActor,ensureLegacyIdentity,saveLegacyIdentityReview,readLegacyIdentityData,ensureSharedIdentity} from '../lib/school-identities.ts';
import {schoolSite} from '../lib/site-runtime.ts';
import {getPortalData} from '../lib/data.ts';
import {googlePortalData} from '../lib/google-school.ts';

const home={siteId:'home',homeSiteId:'home',mode:'unified',isHome:true};
const secondary={siteId:'student-site',homeSiteId:'home',mode:'student',isHome:false};
function fixture(){
 const state=emptySchoolState();
 const admin=insertRow(state,'users',{authUserId:'owner-home',email:'owner@example.test',displayName:'가상 관리자',role:'admin',status:'approved'});
 const pupil=insertRow(state,'users',{authUserId:'student-home',email:'pupil@example.test',displayName:'가상 학생',role:'student',status:'approved'});
 const cls=insertRow(state,'classes',{teacherId:admin.id,name:'가상학급',grade:2,schoolYear:2026,inviteCode:'A'});
 const student=insertRow(state,'students',{classId:cls.id,userId:pupil.id,studentNumber:'001',name:'가상 학생'});
 return {state,admin,pupil,student};
}
const login=(userId,email='pupil@example.test')=>({userId,email,displayName:'로그인 표시명'});
test('site-scoped identities require explicit approval despite matching email or subject',()=>{
 const {state,admin,pupil,student}=fixture();
 const first=resolveGoogleIdentity(state,login('student-home'),home);assert.equal(first.viewer.id,pupil.id);assert.equal(first.changed,true);
 const next=resolveGoogleIdentity(state,login('student-home'),secondary);assert.equal(next.viewer.id,0);assert.equal(next.viewer.status,'pending');assert.equal(state.tables.users.length,2);
 const id=next.viewer.loginIdentityId;
 applyIdentityReview(state,admin,{action:'approve',identityId:id,expectedRevision:1,userId:pupil.id,note:'학교에서 본인 확인 완료'});
 const linked=resolveGoogleIdentity(state,login('student-home'),secondary).viewer;assert.equal(linked.id,pupil.id);assert.equal(linked.authUserId,pupil.authUserId);
 assert.deepEqual(googlePortalData(state,linked).students.map(s=>s.id),[student.id]);
 assert.equal(state.tables.identityEvents.length,1);
 applyIdentityReview(state,admin,{action:'revoke',identityId:id,expectedRevision:2,note:'계정 변경으로 연결 해제'});
 assert.throws(()=>currentIdentityActor(state.tables,linked),/해제/);
 assert.equal(resolveGoogleIdentity(state,login('student-home'),secondary).viewer.status,'suspended');
 assert.equal(resolveGoogleIdentity(state,login('student-home'),home).viewer.id,pupil.id);
 assert.equal(state.tables.students[0].id,student.id);
});
test('pending logins reveal no student data and duplicate primary email never auto-merges',async()=>{
 const {state}=fixture();
 const pending=resolveGoogleIdentity(state,login('different-home-subject'),home).viewer;
 assert.equal(pending.id,0);assert.equal(state.tables.users.length,2);
 globalThis.__portalTestEnv.DB=undefined;
 const data=await getPortalData(pending);assert.equal(data.students.length,0);assert.equal(data.records.length,0);
});
test('reviews reject forged roles, stale decisions, wrong site roles and current session revocation',()=>{
 const {state,admin,pupil}=fixture();
 const self=resolveGoogleIdentity(state,login(admin.authUserId,admin.email),home).viewer;
 assert.throws(()=>applyIdentityReview(state,self,{action:'revoke',identityId:self.loginIdentityId,expectedRevision:1,note:'현재 로그인 해제'}),/현재 로그인/);
 const pending=resolveGoogleIdentity(state,login('new-subject'),{...secondary,mode:'teacher'}).viewer;
 const body={action:'approve',identityId:pending.loginIdentityId,expectedRevision:1,userId:pupil.id,note:'대상 확인 근거'};
 assert.throws(()=>applyIdentityReview(state,{...pupil,role:'admin'},body),/관리자/);
 assert.throws(()=>applyIdentityReview(state,admin,body),/역할/);
 applyIdentityReview(state,admin,{...body,action:'reject'});
 assert.throws(()=>applyIdentityReview(state,admin,{...body,userId:admin.id}),/다른 변경/);
 assert.equal(state.tables.identityEvents.length,1);
});
test('new primary accounts stay pending; old Google script does not enable secondary identity fallback',()=>{
 const {state}=fixture();
 const newcomer=resolveGoogleIdentity(state,login('unknown','new@example.test'),home).viewer;
 assert.equal(newcomer.role,'student');assert.equal(newcomer.status,'pending');
 state.sourceTables=Object.keys(state.tables).filter(n=>!['schoolIdentities','identityEvents'].includes(n));state.tables.schoolIdentities=[];
 assert.equal(resolveGoogleIdentity(state,login('student-home'),home).viewer.id,2);
 assert.throws(()=>resolveGoogleIdentity(state,login('student-home'),secondary),/갱신/);
});

class MemoryD1 {
 sql=new DatabaseSync(':memory:');failAt=-1;
 constructor(){this.sql.exec('PRAGMA foreign_keys=ON');for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));}
 prepare(query){const db=this;const make=params=>({bind(...args){return make(args);},async raw(){const s=db.sql.prepare(query);s.setReturnArrays(true);return s.all(...params);},async all(){return {success:true,results:db.sql.prepare(query).all(...params),meta:{}};},async run(){db.sql.prepare(query).run(...params);return {success:true,results:[],meta:{}};}});return make([]);}
 async batch(queries){this.sql.exec('BEGIN');try{const out=[];for(let i=0;i<queries.length;i++){if(i===this.failAt)throw new Error('injected failure');out.push(await queries[i].all());}this.sql.exec('COMMIT');return out;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
test('D1 identity linking preserves the user, requires review for email collisions, and freezes during migration',async()=>{
 const db=new MemoryD1();globalThis.__portalTestEnv.DB=db;
 db.sql.exec("INSERT INTO users(auth_user_id,email,display_name,role,status)VALUES('owner-home','owner@example.test','관리자','admin','approved'),('student-home','pupil@example.test','학생','student','approved')");
 const admin=await ensureLegacyIdentity(login('owner-home','owner@example.test'),home);
 const original=await ensureLegacyIdentity(login('student-home'),home);assert.equal(original.id,2);
 const pending=await ensureLegacyIdentity(login('new-subject'),home);assert.equal(pending.id,0);
 const body={action:'approve',identityId:pending.loginIdentityId,expectedRevision:1,userId:2,note:'학교 대면 본인 확인'};
 await saveLegacyIdentityReview(admin,body);
 assert.equal((await ensureLegacyIdentity(login('new-subject'),home)).id,2);
 assert.equal((await readLegacyIdentityData()).identityEvents.length,1);
 await assert.rejects(()=>saveLegacyIdentityReview(admin,body),/다른 변경/);
 db.sql.exec("INSERT INTO storage_connection(id,state,secret,owner_auth_user_id)VALUES(1,'migrating','private','owner-home')");
 assert.equal((await ensureLegacyIdentity(login('student-home'),home,false)).id,2);
 await assert.rejects(()=>ensureLegacyIdentity(login('new-unknown','x@example.test'),home,false),/이전 중/);
 await assert.rejects(()=>saveLegacyIdentityReview(admin,{...body,action:'revoke',expectedRevision:2}),/query|frozen/);
 db.sql.close();
});
test('simultaneous first logins retry only revision conflicts without duplicating an identity',async()=>{
 const env=globalThis.__portalTestEnv,originalFetch=globalThis.fetch;
 env.TRACE_PORTAL_MODE='student';env.TRACE_HOME_SITE_ID='home';
 env.TRACE_SHARED_GOOGLE_CONNECTION=JSON.stringify({homeSiteId:'home',secret:'a'.repeat(64),endpoint:'https://script.google.com/macros/s/'+'a'.repeat(24)+'/exec'});
 let reads=0,commits=0;const {state}=fixture();state.homeSiteId='home';
 try {
  globalThis.fetch=async(_url,options)=>{const request=JSON.parse(JSON.parse(options.body).payload);assert.equal(request.homeSiteId,'home');if(request.operation==='read'){reads++;return Response.json({ok:true,data:state});}if(request.operation==='commit'){commits++;if(commits===1){state.revision++;return Response.json({ok:false,code:'CONFLICT'});}assert.equal(request.data.expectedRevision,1);state.tables=request.data.tables;return Response.json({ok:true,data:{revision:2}});}throw new Error('unexpected operation');};
  const viewer=await ensureSharedIdentity(login('secondary-subject'),schoolSite());assert.equal(viewer.status,'pending');assert.equal(reads,2);assert.equal(commits,2);assert.equal(state.tables.schoolIdentities.length,1);assert.equal(state.tables.users.length,2);
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:false,code:'GOOGLE_ERROR'});};
  await assert.rejects(()=>ensureSharedIdentity(login('another-subject'),schoolSite()),/GOOGLE_ERROR/);assert.equal(calls,1);
 } finally {globalThis.fetch=originalFetch;delete env.TRACE_PORTAL_MODE;delete env.TRACE_HOME_SITE_ID;delete env.TRACE_SHARED_GOOGLE_CONNECTION;}
});
