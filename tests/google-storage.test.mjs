import assert from "node:assert/strict";
import test from "node:test";
import { scriptHarness } from "./google-script-harness.mjs";
import { readFileSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { emptySchoolState, insertRow, tableColumns, tableNames } from "../lib/school-tables.ts";
import { applyGoogleAction, currentGoogleViewer, googlePortalData } from "../lib/google-school.ts";
import { validateRecordCoverage, profileCoverageIssues } from "../lib/record-coverage.ts";
import { profileImportExample } from "../lib/profile-import.ts";
import { workRequestText } from "../lib/work-result.ts";
import { libraryReferenceIssues, referenceRoleAllowed } from "../lib/reference-materials.ts";
import { validateGoogleEndpoint } from "../lib/google-bridge.ts";

function fixture() {
  const state=emptySchoolState();
  const admin=insertRow(state,"users",{authUserId:"admin",email:"admin@example.test",displayName:"가상관리자",role:"admin",status:"approved"});
  const teacher=insertRow(state,"users",{authUserId:"teacher",email:"teacher@example.test",displayName:"가상담임",role:"teacher",status:"approved"});
  const studentUser=insertRow(state,"users",{authUserId:"student",email:"student@example.test",displayName:"가상학생",role:"student",status:"approved"});
  const c1=insertRow(state,"classes",{teacherId:teacher.id,name:"2학년 1반",grade:2,schoolYear:2026,inviteCode:"ONE"});
  const c2=insertRow(state,"classes",{teacherId:admin.id,name:"3학년 2반",grade:3,schoolYear:2026,inviteCode:"TWO"});
  const s1=insertRow(state,"students",{classId:c1.id,userId:studentUser.id,studentNumber:"001",name:"가상학생",email:"student@example.test"});
  const s2=insertRow(state,"students",{classId:c2.id,studentNumber:"002",name:"다른가상학생",email:"another@example.test"});
  return {state,admin,teacher,studentUser,c1,c2,s1,s2};
}
test("Google state enforces persisted roles and student/class scopes",()=>{
  const f=fixture(),{state,admin,teacher,studentUser,s1,s2}=f;
  insertRow(state,"referenceMaterials",{uploadedBy:admin.id,title:"가상 평가 기준",objectKey:"private",originalName:"guide.pdf",contentType:"application/pdf",sizeBytes:1,sha256:"a"});
  assert.equal(googlePortalData(state,admin).students.length,2);
  assert.deepEqual(googlePortalData(state,teacher).students.map(s=>s.id),[s1.id]);
  assert.deepEqual(googlePortalData(state,{...studentUser,role:"admin"}).students.map(s=>s.id),[s1.id]);
  assert.equal(googlePortalData(state,studentUser).referenceMaterials.length,0);
  assert.throws(()=>applyGoogleAction(state,currentGoogleViewer(state,{...teacher,role:"admin"}),{action:"archiveStudent",studentId:s2.id}),/접근/);
  assert.throws(()=>applyGoogleAction(state,studentUser,{action:"addClass"}),/권한/);
  studentUser.status="suspended"; assert.equal(googlePortalData(state,studentUser).students.length,0);
  assert.ok(!tableNames.includes("storageConnection"));
});
test("Google bulk registration validates all rows before mutation, preserves leading zeros",()=>{
  const {state,admin,c1}=fixture();
  const rows=Array.from({length:300},(_,i)=>({studentNumber:`B${String(i).padStart(4,"0")}`,name:`가상${i}`,email:`batch${i}@example.test`}));
  const invalid=structuredClone(rows);invalid[299].email=invalid[0].email;
  assert.throws(()=>applyGoogleAction(state,admin,{action:"bulkAddStudents",classId:c1.id,students:invalid}),/이메일/);
  assert.equal(state.tables.students.length,2);
  const result=applyGoogleAction(state,admin,{action:"bulkAddStudents",classId:c1.id,students:rows});
  assert.equal(result.createdCount,300);assert.equal(state.tables.students[2].studentNumber,"B0000");
  assert.throws(()=>applyGoogleAction(state,admin,{action:"bulkAddStudents",classId:c1.id,students:rows}),/이미/);
});
test("current-grade and combined records are included without inventing future grades",()=>{
  const combined=[{grade:1,schoolYear:2025},{grade:2,schoolYear:2026}];
  assert.deepEqual(validateRecordCoverage(combined,2),combined);
  assert.equal(validateRecordCoverage([{grade:1,schoolYear:2024},{grade:2,schoolYear:2025},{grade:3,schoolYear:2026}],3).length,3);
  assert.throws(()=>validateRecordCoverage([{grade:3,schoolYear:2027}],2),/현재/);
  assert.throws(()=>validateRecordCoverage([{grade:1,schoolYear:2025},{grade:2,schoolYear:2025}],2),/중복/);
  const profile=structuredClone(profileImportExample), records=[{recordGrade:2,schoolYear:2026,coverage:combined}];
  assert.match(profileCoverageIssues(profile,2,records).join(" "),/2026/);
  profile.sourceYears=[2025,2026];assert.deepEqual(profileCoverageIssues(profile,2,records),[]);
  const {s1,c1}=fixture(),request=workRequestText(s1,c1,[{...records[0],studentId:s1.id,originalName:"통합.pdf"}],[]);
  assert.match(request,/현재 2학년의 기록/);assert.match(request,/재첨부하지 않아도/);assert.doesNotMatch(request,/필요한 대학·전형·학년도 모집요강 및 평가 기준/);
});
test("Google profile import retains prior versions and active current-year results",()=>{
  const {state,admin,s1}=fixture(),p=structuredClone(profileImportExample);
  p.studentReference={name:s1.name,studentNumber:s1.studentNumber};p.sourceYears=[2025,2026];
  insertRow(state,"studentRecords",{studentId:s1.id,ownerUserId:admin.id,recordGrade:2,schoolYear:2026,coverageJson:JSON.stringify([{grade:1,schoolYear:2025},{grade:2,schoolYear:2026}]),objectKey:"original",originalName:"test.pdf",contentType:"application/pdf",sizeBytes:1});
  applyGoogleAction(state,admin,{action:"importProfile",studentId:s1.id,profile:p});
  applyGoogleAction(state,admin,{action:"importProfile",studentId:s1.id,profile:{...p,versionLabel:"후속 분석"}});
  const data=googlePortalData(state,admin);assert.equal(data.profileSnapshots.length,2);assert.equal(data.profileSnapshots.filter(p=>p.isActive).length,1);
  assert.equal(data.academicCourses.length,p.academicAnalysis.courses.length);assert.equal(data.records[0].processingStatus,"reflected");
  assert.throws(()=>applyGoogleAction(state,admin,{action:"importProfile",studentId:s1.id,profile:p}),/버전/);
  assert.equal(state.tables.profileSnapshots.length,2);
});
test("shared references preserve identity, selection and role restrictions",()=>{
  const {state,admin,teacher,studentUser}=fixture();
  const material=insertRow(state,"referenceMaterials",{uploadedBy:admin.id,title:"가상 기준",institution:"가상대",admissionsYear:2028,admissionTrack:"가상전형",category:"evaluation_criteria",objectKey:"guide",originalName:"test.pdf",contentType:"application/pdf",sizeBytes:1,sha256:"x"});
  applyGoogleAction(state,teacher,{action:"setReferenceSelection",materialIds:[material.id]});
  assert.deepEqual(googlePortalData(state,teacher).selectedReferenceMaterialIds,[material.id]);
  assert.throws(()=>applyGoogleAction(state,teacher,{action:"setReferenceStatus",materialId:material.id,status:"archived"}),/관리자/);
  assert.equal(referenceRoleAllowed(studentUser),false);
  const p=structuredClone(profileImportExample);p.evaluationAnalysis.references=[{id:`LIB-${material.id}`,title:material.title,institution:material.institution,admissionsYear:2027,admissionTrack:material.admissionTrack,category:material.category,note:""}];
  assert.match(libraryReferenceIssues(p,[material]).join(" "),/학년도/);
  applyGoogleAction(state,admin,{action:"setReferenceStatus",materialId:material.id,status:"archived"});
  assert.deepEqual(googlePortalData(state,teacher).selectedReferenceMaterialIds,[]);assert.equal(state.tables.referenceMaterials.length,1);
});
test("Google endpoint validation rejects arbitrary hosts, query strings and development URLs",()=>{
  const valid="https://script.google.com/macros/s/"+"a".repeat(40)+"/exec";assert.equal(validateGoogleEndpoint(valid),valid);
  for(const invalid of ["http://localhost/",valid+"?secret=x",valid.replace("/exec","/dev"),valid.replace("script.google.com","evil.example")])assert.throws(()=>validateGoogleEndpoint(invalid));
});

// Faithful API-boundary harness: production Apps Script source, local Google
// response fixtures. It does not substitute for the owner's live authorization.

test("Apps Script rejects unsigned, stale, replayed requests before accessing data",()=>{
  const h=scriptHarness();assert.equal(h.send({postData:{contents:'{"payload":"x","signature":"bad"}'}}).code,"INVALID_SIGNATURE");
  assert.equal(h.send(h.request("read",{},{timestamp:Date.now()-400000})).code,"EXPIRED_REQUEST");
  const request=h.request("read");assert.equal(h.send(request).ok,true);assert.equal(h.send(request).code,"REPLAY");
});
test("Sheets commits round-trip typed values, literal formulas and overflow text; reject conflicts and direct edits",()=>{
  const h=scriptHarness(),{state}=fixture();
  insertRow(state,"subjects",{classId:1,name:"국어"});
  insertRow(state,"activities",{studentId:1,subjectId:1,createdBy:1,title:'=IMPORTDATA("https://example.invalid")',activityType:"교과",activityDate:"2026-09-16",rawText:"한글".repeat(23000)});
  const write=h.send(h.request("commit",{expectedRevision:0,tables:state.tables}));assert.equal(write.ok,true,JSON.stringify(write));
  const saved=h.send(h.request("read"));assert.deepEqual(saved.data.tables,state.tables);assert.equal(saved.data.revision,1);assert.equal(h.files.size,1);
  assert.equal(h.send(h.request("commit",{expectedRevision:0,tables:state.tables})).code,"CONFLICT");
  h.cells.students[1][4]="수동변경";assert.equal(h.send(h.request("read")).code,"SHEET_EDITED");
});
test("Drive file copies are verified and idempotent; failed Sheets batch does not advance revision",()=>{
  const h=scriptHarness(), bytes=Buffer.from("검증할 가상 파일"), data={objectKey:"student-records/test",originalName:"가상.pdf",contentType:"application/pdf",sizeBytes:bytes.length,base64:bytes.toString("base64"),sha256:createHash("sha256").update(bytes).digest("hex")};
  assert.equal(h.send(h.request("putFile",data)).ok,true);assert.equal(h.send(h.request("putFile",data)).ok,true);assert.equal(h.files.size,1);
  const download=h.send(h.request("getFile",{objectKey:data.objectKey}));assert.equal(download.data.base64,data.base64);
  assert.equal(h.send(h.request("putFile",{...data,sha256:"bad"})).code,"HASH_MISMATCH");
  h.failNextBatch();assert.equal(h.send(h.request("commit",{expectedRevision:0,tables:fixture().state.tables})).ok,false);
  assert.equal(h.send(h.request("read")).data.revision,0);
});


test("Apps Script adds new tabs without changing existing rows or legacy digest",()=>{
  const h=scriptHarness(),oldColumns=structuredClone(h.config.columns);
  const added=["guidanceEntries","schoolIdentities","identityEvents","schoolOperations"];
  for(const name of added){delete oldColumns[name];delete h.cells[name];h.properties.splice(h.properties.findIndex(p=>p.title===name),1);}
  h.config.columns=oldColumns;
  const state=fixture().state;for(const name of added)delete state.tables[name];
  assert.equal(h.send(h.request("commit",{expectedRevision:0,tables:state.tables})).ok,true);
  const before=structuredClone(h.cells),digest=h.cells._meta[2][1];
  h.context.installMissingSheets({...h.config,columns:tableColumns});
  for(const [key,rows] of Object.entries(before))assert.deepEqual(h.cells[key],rows);
  for(const name of added)assert.deepEqual(h.cells[name][0],tableColumns[name]);
  h.config.columns=tableColumns;
  const saved=h.send(h.request("read"));assert.equal(saved.ok,true,JSON.stringify(saved));
  assert.equal(saved.data.revision,1);assert.deepEqual(saved.data.tables.guidanceEntries,[]);
  assert.equal(h.context.tableDigest(saved.data.tables,tableColumns),digest);
  h.context.installMissingSheets(h.config);assert.equal(h.properties.filter(p=>p.title==="guidanceEntries").length,1);
});
test("manual private backup preserves data and file index but excludes connection secrets",()=>{
  const h=scriptHarness(),state=fixture().state;
  assert.equal(h.send(h.request("commit",{expectedRevision:0,tables:state.tables})).ok,true);
  const result=h.send(h.request("backup"));assert.equal(result.ok,true,JSON.stringify(result));
  const text=[...h.files.values()].at(-1).getBlob().getDataAsString(),backup=JSON.parse(text);
  assert.deepEqual(backup.tables,state.tables);assert.equal(backup.revision,1);assert.ok(Array.isArray(backup.fileIndex));
  assert.ok(!text.includes(h.config.secret));assert.ok(!Object.hasOwn(backup,"config"));
});


test("Google shared storage binds every signed request to the configured home site",()=>{
  const h=scriptHarness();h.config.homeSiteId="home-site";
  const wrong=h.send(h.request("read",{}, {homeSiteId:"other-school"}));
  assert.equal(wrong.code,"WRONG_SCHOOL");
  const correct=h.send(h.request("read",{}, {homeSiteId:"home-site"}));
  assert.equal(correct.ok,true);assert.equal(correct.data.homeSiteId,"home-site");
});


test("Apps Script keeps school operations append-only in the same atomic state commit",()=>{
  const h=scriptHarness(),state=emptySchoolState();
  insertRow(state,"users",{authUserId:"admin",email:"admin@example.test",displayName:"가상 관리자",role:"admin",status:"approved"});
  insertRow(state,"schoolOperations",{operationKey:"test:1",batchId:"test",kind:"graduate",targetType:"student",targetId:1,beforeJson:"{}",afterJson:"{}",actorId:1,actorName:"가상 관리자",reason:"가상 검증"});
  const first=h.send(h.request("commit",{expectedRevision:0,tables:state.tables}));assert.equal(first.ok,true);
  const modified=structuredClone(state.tables);modified.schoolOperations[0].reason="덮어쓰기";
  assert.equal(h.send(h.request("commit",{expectedRevision:1,tables:modified})).code,"INVALID_STATE");
  const removed=structuredClone(state.tables);removed.schoolOperations=[];
  assert.equal(h.send(h.request("commit",{expectedRevision:1,tables:removed})).code,"INVALID_STATE");
  assert.equal(h.send(h.request("read")).data.tables.schoolOperations[0].reason,"가상 검증");
});
