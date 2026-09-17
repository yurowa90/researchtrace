import assert from 'node:assert/strict';
import test from 'node:test';
import { emptySchoolState, insertRow, tableNames } from '../lib/school-tables.ts';
import { auditSchoolData } from '../lib/school-audit.ts';
import { GET as baselineGet } from '../app/api/school-baseline/route.ts';

function fixture() {
  const state = emptySchoolState();
  const admin = insertRow(state, 'users', {authUserId:'admin', email:'private-admin@example.test', displayName:'비공개 이름', role:'admin', status:'approved'});
  const pupil = insertRow(state, 'users', {authUserId:'student', email:'private-student@example.test', displayName:'비공개 학생', role:'student', status:'approved'});
  const cls = insertRow(state, 'classes', {teacherId:admin.id, name:'가상 학급', grade:2, schoolYear:2026, inviteCode:'X'});
  const student = insertRow(state, 'students', {classId:cls.id, userId:pupil.id, name:'개인정보 학생', studentNumber:'001'});
  const snapshot = insertRow(state, 'profileSnapshots', {studentId:student.id, createdBy:admin.id, versionLabel:'v1', oneLineProfile:'가상 분석', narrative:'가상 서술', rawJson:'{}'});
  return {state, admin, pupil, cls, student, snapshot};
}
test('school audit accepts a valid baseline without changing data or exposing identity fields', () => {
  const {state} = fixture(); const before = structuredClone(state);
  const result = auditSchoolData(state.tables);
  assert.equal(result.errorCount, 0); assert.equal(result.warningCount, 0);
  assert.equal(result.counts.realStudents, 1); assert.equal(result.counts.tables, tableNames.length);
  assert.deepEqual(state, before); assert.equal(state.tables.students[0].studentNumber, '001');
  assert.ok(!JSON.stringify(result).includes('private-')); assert.ok(!JSON.stringify(result).includes('개인정보'));
});
test('school audit detects duplicates, cross student analysis and invalid foreign keys', () => {
  const {state, pupil, cls, snapshot} = fixture();
  const other = insertRow(state, 'students', {classId:cls.id, userId:pupil.id, name:'다른 학생', studentNumber:'001'});
  insertRow(state, 'researchKeywords', {snapshotId:snapshot.id, studentId:other.id, keyword:'가상 키워드'});
  cls.teacherId = 999;
  const codes = new Set(auditSchoolData(state.tables).issues.map(i => i.code));
  for (const code of ['duplicate_key', 'account_multiple_students', 'cross_student_snapshot', 'orphan_reference']) assert.ok(codes.has(code), code);
});
test('audit distinguishes unlinked accounts from corruption and limits issue output', () => {
  const {state, student, snapshot} = fixture(); student.userId = null;
  let result = auditSchoolData(state.tables); assert.equal(result.errorCount, 0); assert.equal(result.warningCount, 1); assert.equal(result.issues[0].code, 'unlinked_student');
  snapshot.rawJson = '{broken'; snapshot.id = 999;
  for (let i=0; i<220; i++) insertRow(state, 'ontologyEdges', {snapshotId:999, studentId:student.id, sourceKey:'absent', targetKey:'absent', relation:'연결'});
  result = auditSchoolData(state.tables); assert.ok(result.issues.some(i => i.code === 'invalid_json')); assert.ok(result.errorCount > 200); assert.equal(result.issues.length, 200); assert.equal(result.omittedIssueCount, result.errorCount + result.warningCount - 200);
});
test('audit checks active versions and requires ontology nodes from the same snapshot', () => {
  const {state, student, snapshot} = fixture();
  state.tables.profileSnapshots.push({...snapshot, id:2, versionLabel:'v2'});
  insertRow(state, 'ontologyNodes', {snapshotId:2, studentId:student.id, nodeKey:'N1', nodeType:'topic', label:'주제'});
  insertRow(state, 'ontologyEdges', {snapshotId:1, studentId:student.id, sourceKey:'N1', targetKey:'N1', relation:'연결'});
  const codes = auditSchoolData(state.tables).issues.map(i=>i.code);
  assert.ok(codes.includes('multiple_active_profiles')); assert.ok(codes.includes('missing_ontology_node'));
});
test('audit endpoint requires authentication and disables shared caching', async () => {
  const response=await baselineGet();assert.equal(response.status,401);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
