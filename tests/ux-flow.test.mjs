import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getPortalData, performPortalAction } from "../lib/data.ts";
import { parsePastedStudents, validateStudentRows } from "../lib/student-registration.ts";
import { suggestedRecordYear, studentReadiness } from "../lib/portal-workflow.ts";
import { profileImportExample } from "../lib/profile-import.ts";
import { readWorkResult } from "../lib/work-result.ts";

// Local in-memory D1 adapter: real migrations, real Drizzle SQL, 100-bind limit,
// atomic batch, and deterministic failure injection. No production data/API.
class MemoryD1 {
  sql = new DatabaseSync(":memory:");
  maxParameters = 0;
  failBatchAt = -1;
  constructor() {
    this.sql.exec("PRAGMA foreign_keys=ON");
    for (const migration of ["0000_chunky_maximus.sql", "0001_harsh_ultron.sql", "0002_tidy_gabe_jones.sql", "0003_ancient_silverclaw.sql", "0004_google_storage_freeze.sql"]) this.sql.exec(readFileSync(new URL(`../drizzle/${migration}`, import.meta.url), "utf8"));
  }
  prepare(query) {
    const database = this;
    const make = (params) => ({
      bind(...values) {
        assert.ok(values.length <= 100, `D1 parameter limit: ${values.length}`);
        database.maxParameters = Math.max(database.maxParameters, values.length);
        return make(values);
      },
      async raw() {
        const statement = database.sql.prepare(query);
        statement.setReturnArrays(true);
        return statement.all(...params);
      },
      async all() { return { success: true, results: database.sql.prepare(query).all(...params), meta: {} }; },
      async run() { database.sql.prepare(query).run(...params); return { success: true, results: [], meta: {} }; },
    });
    return make([]);
  }
  async batch(statements) {
    this.sql.exec("BEGIN");
    try {
      const results = [];
      for (let index = 0; index < statements.length; index++) {
        if (index === this.failBatchAt) throw new Error("Injected failure");
        results.push(await statements[index].all());
      }
      this.sql.exec("COMMIT");
      return results;
    } catch (error) { this.sql.exec("ROLLBACK"); throw error; }
  }
  count(table) { return this.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; }
}

const admin = { id: 1, role: "admin", status: "approved", email: "admin@example.test", displayName: "관리자" };
const teacher = { id: 2, role: "teacher", status: "approved", email: "teacher@example.test", displayName: "담임" };
function setup() {
  const db = new MemoryD1();
  globalThis.__portalTestEnv.DB = db;
  db.sql.exec(`INSERT INTO users(id,auth_user_id,email,display_name,role,status) VALUES
    (1,'admin','admin@example.test','관리자','admin','approved'),
    (2,'teacher','teacher@example.test','담임','teacher','approved');
    INSERT INTO classes(id,teacher_id,name,grade,school_year,invite_code) VALUES
    (1,2,'2학년 1반',2,2026,'TEST-1'),(2,1,'3학년 2반',3,2026,'TEST-2');`);
  return db;
}
function rows(n, prefix = "test") {
  return Array.from({ length: n }, (_, i) => ({ rowNumber: i + 2, studentNumber: String(i + 1).padStart(5, "0"), name: `가상학생${i + 1}`, email: `${prefix}${i + 1}@example.test` }));
}
function add(db, n, prefix = "test", classId = 1, viewer = admin) { return performPortalAction(viewer, { action: "bulkAddStudents", classId, students: rows(n, prefix) }); }

test("paste handles Korean headers, CRLF, blanks, quoted cells, leading zeroes", () => {
  const parsed = parsePastedStudents('학번\t이름\t이메일\r\n00123\t"가상 학생"\t TEST@EXAMPLE.TEST \r\n\t\t\r\n');
  assert.deepEqual(parsed, [{ rowNumber: 2, studentNumber: "00123", name: "가상 학생", email: "test@example.test" }]);
  assert.equal(parsePastedStudents('001\t"가상""학생"\ta@example.test')[0].name, '가상"학생');
  assert.equal(parsePastedStudents("001\t가상\t")[0].email, "");
  assert.throws(() => parsePastedStudents("001\t가상\ta@example.test\t추가열"), /세 열/);
  assert.throws(() => parsePastedStudents('001\t"닫히지 않음\ta@example.test'), /따옴표/);
  assert.throws(() => parsePastedStudents(rows(301).map(r => `${r.studentNumber}\t${r.name}\t${r.email}`).join("\n")), /300/);
});

test("validation identifies exact fields, class-scoped numbers and global emails", () => {
  assert.ok(validateStudentRows([]).length);
  const input = rows(2); input[1].studentNumber = input[0].studentNumber; input[1].email = input[0].email.toUpperCase();
  assert.deepEqual(validateStudentRows(input).map(i => i.field), ["studentNumber", "email"]);
  assert.equal(validateStudentRows(rows(1), [{ classId: 2, studentNumber: "00001", email: null }], 1).length, 0);
  assert.equal(validateStudentRows(rows(1), [{ classId: 1, studentNumber: "00001", email: "test1@example.test" }], 1).length, 2);
  assert.equal(validateStudentRows([{ rowNumber: 2, studentNumber: "", name: "", email: "bad" }]).length, 3);
});

test("source readiness and suggested years reflect the student's current grade", () => {
  const student = { id: 1, classId: 2 };
  const data = { classes: [{ id: 2, grade: 3 }], records: [{ studentId: 1, recordGrade: 1 }], profileSnapshots: [] };
  assert.deepEqual(studentReadiness(data, student).missingGrades, [2]);
  assert.equal(suggestedRecordYear(2026, 3, 1), 2024);
  assert.equal(suggestedRecordYear(2026, 3, 2), 2025);
  assert.equal(suggestedRecordYear(2026, 2, 1), 2025);
});

test("Work preview accepts a complete JSON/code block and rejects missing references", () => {
  const json = JSON.stringify(profileImportExample);
  assert.deepEqual(readWorkResult(json).issues, []);
  assert.deepEqual(readWorkResult("\uFEFF```json\n" + json + "\n```").issues, []);
  assert.equal(readWorkResult("not json").profile, null);
  assert.equal(readWorkResult('{"schemaVersion":"1.1"}').profile, null);
  const missing = structuredClone(profileImportExample); missing.ontology.edges[0].target = "missing";
  assert.match(readWorkResult(JSON.stringify(missing)).issues.join(" "), /연결 노드/);
  const repeated = structuredClone(profileImportExample); repeated.sections.push(repeated.sections[0]);
  assert.match(readWorkResult(JSON.stringify(repeated)).issues.join(" "), /중복/);
});

test("300-student import and subsequent school/teacher reads respect D1 parameter limits", async () => {
  const db = setup();
  const result = await add(db, 300, "bulk", 1, teacher);
  assert.equal(result.createdCount, 300);
  assert.equal(db.count("students"), 300);
  assert.equal((await getPortalData(admin)).students.length, 300);
  assert.equal((await getPortalData(teacher)).students.length, 300);
  assert.ok(db.maxParameters <= 100);
  db.sql.close();
});

test("server rejects duplicate/existing students without saving any extra rows", async () => {
  const db = setup();
  await add(db, 1);
  await assert.rejects(add(db, 3), /이미|등록/);
  assert.equal(db.count("students"), 1);
  const input = rows(2, "duplicate"); input[1].email = input[0].email.toUpperCase();
  await assert.rejects(performPortalAction(admin, { action: "bulkAddStudents", classId: 2, students: input }), /중복/);
  assert.equal(db.count("students"), 1);
  await assert.rejects(add(db, 301), /300/);
  db.sql.close();
});

test("teacher/student/suspended permissions and school scope remain enforced", async () => {
  const db = setup();
  await assert.rejects(add(db, 1, "denied", 2, teacher), /접근/);
  await assert.rejects(add(db, 1, "denied", 1, { ...teacher, role: "student" }), /권한/);
  await assert.rejects(add(db, 1, "denied", 1, { ...admin, status: "suspended" }), /권한/);
  await add(db, 1, "class1", 1); await add(db, 1, "class2", 2);
  assert.equal((await getPortalData(admin)).students.length, 2);
  const ownClass = await getPortalData(teacher);
  assert.equal(ownClass.students.length, 1); assert.equal(ownClass.students[0].classId, 1);
  db.sql.exec("INSERT INTO users(id,auth_user_id,email,display_name,role,status) VALUES(3,'student','class1@example.test','가상학생','student','approved'); UPDATE students SET user_id=3 WHERE class_id=1");
  const ownStudent = await getPortalData({ ...teacher, id: 3, role: "student" });
  assert.equal(ownStudent.students.length, 1); assert.equal(ownStudent.students[0].userId, 3);
  assert.equal((await getPortalData({ ...teacher, status: "suspended" })).students.length, 0);
  db.sql.close();
});

test("a failed bulk batch rolls back every student and account approval", async () => {
  const db = setup();
  db.sql.exec("INSERT INTO users(id,auth_user_id,email,display_name,role,status) VALUES(3,'pending','test1@example.test','가상계정','student','pending')");
  db.failBatchAt = 2; // After both student INSERTs, before account approval.
  await assert.rejects(add(db, 24), /완료하지 못했/);
  assert.equal(db.count("students"), 0);
  assert.equal(db.sql.prepare("SELECT status FROM users WHERE id=3").get().status, "pending");
  db.failBatchAt = -1;
  const result = await add(db, 24);
  assert.equal(result.linkedCount, 1);
  assert.equal(db.sql.prepare("SELECT status FROM users WHERE id=3").get().status, "approved");
  assert.equal(db.sql.prepare("SELECT user_id FROM students WHERE email='test1@example.test'").get().user_id, 3);
  db.sql.close();
});

test("Work import enforces originals, student identity, unique versions and larger course sets", async () => {
  const db = setup(); await add(db, 1);
  const profile = structuredClone(profileImportExample);
  profile.studentReference = { studentNumber: "00001", name: "가상학생1" };
  profile.academicAnalysis.courses = Array.from({ length: 30 }, (_, i) => ({ ...profile.academicAnalysis.courses[0], subject: `가상교과${i}` }));
  const importResult = (value = profile) => performPortalAction(admin, { action: "importProfile", studentId: 1, profile: value });
  await assert.rejects(importResult(), /원본/);
  assert.equal(db.count("profile_snapshots"), 0);
  db.sql.exec("INSERT INTO student_records(student_id,owner_user_id,school_year,record_grade,object_key,original_name,content_type,size_bytes) VALUES(1,1,2025,1,'test-source','가상학생부.pdf','application/pdf',1)");
  await assert.rejects(importResult({ ...profile, studentReference: { studentNumber: "99999", name: "다른학생" } }), /학번·이름/);
  await importResult();
  assert.equal(db.count("academic_course_records"), 30);
  assert.equal((await getPortalData(teacher)).academicCourses.length, 30);
  await assert.rejects(importResult(), /이미 저장된 버전/);
  assert.equal(db.count("profile_snapshots"), 1);
  await importResult({ ...profile, versionLabel: "두번째검토" });
  assert.equal(db.count("profile_snapshots"), 2);
  assert.equal(db.sql.prepare("SELECT count(*) n FROM profile_snapshots WHERE is_active=1").get().n, 1);
  assert.ok(db.maxParameters <= 100);
  db.sql.close();
});

test("migration freezes legacy writes at the database level and can safely cancel", async () => {
  const db=setup();await add(db,1);
  db.sql.exec("INSERT INTO storage_connection(id,state,secret,owner_auth_user_id) VALUES(1,'migrating','test-only-secret','admin')");
  await assert.rejects(performPortalAction(admin,{action:"addStudent",classId:1,studentNumber:"999",name:"가상"}),/복사 중/);
  assert.throws(()=>db.sql.exec("UPDATE students SET name='변경' WHERE id=1"),/frozen/);
  assert.throws(()=>db.sql.exec("DELETE FROM students WHERE id=1"),/frozen/);
  assert.equal((await getPortalData(admin)).students.length,1);
  db.sql.exec("UPDATE storage_connection SET state='legacy' WHERE id=1");
  await performPortalAction(admin,{action:"addStudent",classId:1,studentNumber:"999",name:"가상"});
  assert.equal(db.count("students"),2);db.sql.close();
});

test("legacy imports accept combined current-year records and validate shared source identity",async()=>{
  const db=setup();await add(db,1);
  db.sql.prepare("INSERT INTO student_records(student_id,owner_user_id,school_year,record_grade,coverage_json,object_key,original_name,content_type,size_bytes) VALUES(1,1,2026,2,?,'combined','가상통합.pdf','application/pdf',1)").run(JSON.stringify([{grade:1,schoolYear:2025},{grade:2,schoolYear:2026}]));
  const profile=structuredClone(profileImportExample);profile.studentReference={name:"가상학생1",studentNumber:"00001"};
  await assert.rejects(performPortalAction(admin,{action:"importProfile",studentId:1,profile}),/2026/);
  profile.sourceYears=[2025,2026];await performPortalAction(admin,{action:"importProfile",studentId:1,profile});
  assert.equal((await getPortalData(admin)).profileSnapshots[0].sourceYears.length,2);
  await assert.rejects(performPortalAction(teacher,{action:"setReferenceStatus",materialId:1,status:"archived"}),/관리자/);
  db.sql.close();
});
