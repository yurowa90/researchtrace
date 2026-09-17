import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {emptySchoolState,insertRow,tableNames} from '../lib/school-tables.ts';
import {makeSchoolBackup} from '../lib/school-backup.ts';
import {verifySchoolBackup} from '../lib/verify-school-backup.ts';
import {readSchoolSnapshot} from '../lib/school-snapshot.ts';
import {GET as backupGet} from '../app/api/school-backup/route.ts';

function fixture(){
 const {tables}=emptySchoolState();tables.storageConnection=[{secret:'NEVER-EXPORT-CONNECTION-KEY'}];
 const state={tables,revision:0};const user=insertRow(state,'users',{authUserId:'u',email:'a@example.test',displayName:'관리자',role:'admin',status:'approved'});
 const cls=insertRow(state,'classes',{teacherId:user.id,name:'가상학급',schoolYear:2026,grade:2,inviteCode:'X'});
 const student=insertRow(state,'students',{classId:cls.id,name:'가상학생',studentNumber:'001',isExample:true});
 insertRow(state,'profileSnapshots',{studentId:student.id,versionLabel:'v1',createdBy:user.id,rawJson:JSON.stringify({long:'검증용 문장'.repeat(2000)}),isActive:true});
 const content=new TextEncoder().encode('%PDF-가상 원본 파일\n');
 insertRow(state,'studentRecords',{studentId:student.id,ownerUserId:user.id,recordGrade:1,schoolYear:2025,originalName:'../../원본.pdf',objectKey:'private-original',sizeBytes:content.length,contentType:'application/pdf'});
 const snapshot={capturedAt:'2026-09-17T00:00:00.000Z',storage:'legacy',revision:null,tables};
 const read=async()=>({size:content.length,body:new Blob([content]).stream()});return {snapshot,content,read};
}
test('full backup round trip includes long analysis and original bytes, excludes connection secrets',async()=>{
 const {snapshot,read}=fixture();const backup=await makeSchoolBackup(snapshot,read);const bytes=new Uint8Array(await new Response(backup.stream).arrayBuffer());
 const result=await verifySchoolBackup(bytes);assert.equal(result.fileCount,1);assert.equal(result.tableCount,tableNames.length);assert.equal(result.rowCount,5);
 const text=new TextDecoder().decode(bytes);assert.ok(text.includes('검증용 문장'.repeat(2000)));assert.ok(!text.includes('NEVER-EXPORT-CONNECTION-KEY'));assert.match(backup.manifest.files[0].name,/^original-00001\.pdf$/);
 const changed=bytes.slice();const index=Buffer.from(changed).indexOf('%PDF-');assert.ok(index>0);changed[index+1]^=1;
 await assert.rejects(()=>verifySchoolBackup(changed),/원본 파일의 크기 또는 해시/);
 await assert.rejects(()=>verifySchoolBackup(bytes.subarray(0,bytes.length-5)),/완전한/);
});
test('missing files, metadata mismatches and mutations during streaming stop a complete backup',async()=>{
 const {snapshot,read,content}=fixture();await assert.rejects(()=>makeSchoolBackup(snapshot,async()=>null),/존재 또는 크기/);
 await assert.rejects(()=>makeSchoolBackup(snapshot,async()=>({size:1,body:new Blob([content]).stream()})),/존재 또는 크기/);
 let n=0;const backup=await makeSchoolBackup(snapshot,async()=>++n===1?read():({size:content.length,body:new Blob([new Uint8Array(content.length)]).stream()}));
 await assert.rejects(()=>new Response(backup.stream).arrayBuffer(),/원본 내용이 변경/);
});
test('D1 snapshot uses one batch, preserves typed booleans and omits connection settings',async()=>{
 const sql=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 sql.exec("INSERT INTO users(id,auth_user_id,email,display_name,role,status)VALUES(1,'u','a@example.test','관리자','admin','approved'); INSERT INTO classes(id,teacher_id,name,grade,school_year,invite_code)VALUES(1,1,'가상',2,2026,'X'); INSERT INTO students(class_id,name,student_number,is_example)VALUES(1,'가상학생','001',1);");
 let batches=0;globalThis.__portalTestEnv.DB={prepare(query){const make=params=>({bind(...args){return make(args);},async all(){return {success:true,results:sql.prepare(query).all(...params)};},async raw(){const stmt=sql.prepare(query);stmt.setReturnArrays(true);return stmt.all(...params);}});return make([]);},async batch(queries){batches++;sql.exec('BEGIN');try{const result=await Promise.all(queries.map(q=>q.all()));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const snapshot=await readSchoolSnapshot();assert.equal(batches,1);assert.equal(snapshot.tables.students[0].isExample,true);assert.equal(snapshot.tables.students[0].studentNumber,'001');assert.ok(!Object.hasOwn(snapshot.tables,'storageConnection'));
 sql.exec("INSERT INTO storage_connection(id,state,secret,owner_auth_user_id)VALUES(1,'migrating','private','u')");await assert.rejects(()=>readSchoolSnapshot(),/이전 중/);sql.close();
});
test('backup endpoint rejects unauthenticated requests before reading any school data',async()=>{
 const response=await backupGet();assert.equal(response.status,401);
});
test('HTTP preview gives an actionable message when browser digest support is unavailable',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 try {Object.defineProperty(globalThis,'crypto',{value:{},configurable:true});await assert.rejects(()=>verifySchoolBackup(new Uint8Array()),/HTTPS/);}
 finally {Object.defineProperty(globalThis,'crypto',original);}
});
