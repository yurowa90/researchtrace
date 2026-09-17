import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedSchoolRole, canAccessSchoolStudent, canManageSchoolClass, isSchoolAdmin, isSchoolStaff } from '../lib/school-permissions.ts';
import { emptySchoolState, insertRow } from '../lib/school-tables.ts';
import { applyGoogleAction, googleStudentAccess, googlePortalData } from '../lib/google-school.ts';
import { applyGuidanceAction } from '../lib/guidance-store.ts';

test('shared access rules enforce own student, current teacher and school admin scopes', () => {
  const classroom = {id:10, teacherId:2}, student = {classId:10, userId:3};
  for (const [role,id,read,manage] of [['admin',1,true,true], ['teacher',2,true,true], ['teacher',8,false,false], ['student',3,true,false], ['student',9,false,false], ['unknown',3,false,false]]) {
    const viewer = {role,id,status:'approved'};
    assert.equal(canAccessSchoolStudent(viewer,student,classroom),read,`${role}:${id}`);
    assert.equal(canManageSchoolClass(viewer,classroom),manage);
    for (const status of ['pending','suspended']) {
      const blocked={...viewer,status}; assert.equal(canAccessSchoolStudent(blocked,student,classroom),false); assert.equal(canManageSchoolClass(blocked,classroom),false); assert.equal(isSchoolAdmin(blocked),false); assert.equal(isSchoolStaff(blocked),false);
    }
  }
  assert.equal(approvedSchoolRole({id:0,role:'admin',status:'approved'}),null);
  assert.equal(canAccessSchoolStudent({id:1,role:'admin',status:'approved'},student,{...classroom,id:11}),false);
  assert.equal(isSchoolAdmin({id:2,role:'teacher',status:'approved'}),false);
});

function fixture() {
  const state=emptySchoolState();
  const account=(role,auth)=>insertRow(state,'users',{authUserId:auth,email:`${auth}@example.test`,displayName:'가상 계정',role,status:'approved'});
  const admin=account('admin','admin'),oldTeacher=account('teacher','old'),newTeacher=account('teacher','new'),pupil=account('student','pupil');
  const classroom=(teacher,code,year)=>insertRow(state,'classes',{teacherId:teacher.id,name:'가상 학급',grade:year===2026?2:3,schoolYear:year,inviteCode:code});
  const oldClass=classroom(oldTeacher,'A',2026),newClass=classroom(newTeacher,'B',2027);
  const student=insertRow(state,'students',{classId:oldClass.id,userId:pupil.id,studentNumber:'001',name:'가상 학생'});
  return {state,admin,oldTeacher,newTeacher,pupil,oldClass,newClass,student};
}
test('class transfer keeps student and account identity, preserves history and changes teacher scope', () => {
  const f=fixture(), beforeId=f.student.id, beforeUser=f.student.userId;
  assert.equal(googleStudentAccess(f.state,f.oldTeacher,beforeId).student.id,beforeId);
  assert.throws(()=>googleStudentAccess(f.state,f.newTeacher,beforeId),/접근/);
  const body={kind:'enrollment',studentId:beforeId,payload:{title:'2027학년도 진급',enrollment:{fromClassId:f.oldClass.id,toClassId:f.newClass.id,previousNumber:'001',studentNumber:'002'}}};
  assert.throws(()=>applyGuidanceAction(f.state,f.oldTeacher,body),/관리자/);
  applyGuidanceAction(f.state,f.admin,body);
  assert.equal(f.student.id,beforeId); assert.equal(f.student.userId,beforeUser); assert.equal(f.student.studentNumber,'002');
  assert.equal(f.state.tables.guidanceEntries.length,1);
  const payload=JSON.parse(f.state.tables.guidanceEntries[0].payloadJson); assert.equal(payload.enrollment.fromClassId,f.oldClass.id); assert.equal(payload.enrollment.previousNumber,'001');
  assert.throws(()=>googleStudentAccess(f.state,f.oldTeacher,beforeId),/접근/);
  assert.equal(googleStudentAccess(f.state,f.newTeacher,beforeId).student.id,beforeId);
  assert.equal(googlePortalData(f.state,f.pupil).students[0].id,beforeId);
});
test('Google boundaries re-read persisted role and deny forged or stale permissions', () => {
  const {state,pupil,student,oldTeacher,newClass}=fixture();
  const forged={...pupil,role:'admin'};
  assert.throws(()=>applyGoogleAction(state,forged,{action:'addClass',grade:2,schoolYear:2026,name:'위조 학급',teacherId:pupil.id}),/교사/);
  student.classId=newClass.id;
  assert.throws(()=>googleStudentAccess(state,{...oldTeacher,role:'admin'},student.id),/접근/);
  oldTeacher.status='suspended'; assert.throws(()=>googleStudentAccess(state,{...oldTeacher,status:'approved'},student.id),/접근/);
});
