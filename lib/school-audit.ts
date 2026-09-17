import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { schoolTables, tableNames, type SchoolRows, type SchoolTable } from "@/lib/school-tables";
import { SCHOOL_CONTRACT_VERSION } from "@/lib/school-contract";

export type SchoolAuditIssue = { severity: "error" | "warning"; code: string; table: SchoolTable; row: string; message: string };
type Row = Record<string, unknown>;

// Read-only: checks both D1 and Google rows against the same contract. Messages
// contain identifiers, never names, emails, source text or connection secrets.
export function auditSchoolData(t: SchoolRows) {
  const issues: SchoolAuditIssue[] = [];
  let errorCount = 0, warningCount = 0;
  const add = (severity: SchoolAuditIssue["severity"], code: string, table: SchoolTable, row: Row, message: string) => {
    if (severity === "error") errorCount++; else warningCount++;
    if (issues.length < 200) issues.push({ severity, code, table, row: String(row.id ?? row.userId ?? `${row.threadId ?? "?"}:${row.activityId ?? "?"}`), message });
  };
  const tableBySql = new Map<string, SchoolTable>(tableNames.map(name => [getTableName(schoolTables[name]), name]));
  for (const table of tableNames) {
    const config = getTableConfig(schoolTables[table]);
    const columns = getTableColumns(schoolTables[table]);
    const keyBySql = Object.fromEntries(Object.entries(columns).map(([key, col]) => [col.name, key]));
    const rows = t[table] as Row[];
    // Schema constraints also catch corrupted manual edits in Google Sheets.
    for (const row of rows) for (const [key, col] of Object.entries(columns)) {
      if (col.notNull && row[key] == null) add("error", "required_value", table, row, `필수 항목 ${key} 값이 없습니다.`);
      if (col.enumValues && row[key] != null && !col.enumValues.includes(String(row[key]))) add("error", "invalid_enum", table, row, `${key} 값이 허용된 분류에 없습니다.`);
      if (key.endsWith("Json") && typeof row[key] === "string") {
        try { JSON.parse(row[key]); } catch { add("error", "invalid_json", table, row, `${key} JSON을 읽을 수 없습니다.`); }
      }
    }
    const uniqueKeys = [
      ...config.columns.filter(c => c.primary).map(c => [keyBySql[c.name]]),
      ...config.indexes.filter(i => i.config.unique).map(i => i.config.columns.map(c => "name" in c ? keyBySql[String(c.name)] : undefined)),
    ];
    for (const keys of uniqueKeys) {
      if (!keys.length || keys.some(k => !k)) continue;
      const seen = new Set<string>();
      for (const row of rows) {
        const values = keys.map(k => row[k!]);
        if (values.some(v => v == null)) continue;
        const signature = JSON.stringify(values);
        if (seen.has(signature)) add("error", "duplicate_key", table, row, `${keys.join(" + ")} 값이 중복됩니다.`);
        seen.add(signature);
      }
    }
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      const target = tableBySql.get(getTableName(ref.foreignTable));
      if (!target) continue;
      const targetColumns = getTableColumns(schoolTables[target]);
      const targetKeys = ref.foreignColumns.map(c => Object.entries(targetColumns).find(([, col]) => col.name === c.name)![0]);
      const keys = ref.columns.map(c => keyBySql[c.name]);
      const existing = new Set((t[target] as Row[]).map(row => JSON.stringify(targetKeys.map(k => row[k]))));
      for (const row of rows) {
        const values = keys.map(k => row[k]);
        if (values.every(v => v != null) && !existing.has(JSON.stringify(values))) add("error", "orphan_reference", table, row, `${keys.join(" + ")}에 연결된 ${target} 자료가 없습니다.`);
      }
    }
  }
  const accounts = new Map(t.users.map(r => [r.id, r]));
  const snapshots = new Map(t.profileSnapshots.map(r => [r.id, r]));
  const activities = new Map(t.activities.map(r => [r.id, r]));
  const threads = new Map(t.inquiryThreads.map(r => [r.id, r]));
  const linkedUsers = new Set<number>();
  for (const classroom of t.classes) {
    const teacher = accounts.get(classroom.teacherId);
    if (teacher && !["admin", "teacher"].includes(teacher.role)) add("error", "teacher_role", "classes", classroom, "담당 계정이 교사·관리자 역할이 아닙니다.");
    if (teacher && teacher.status !== "approved") add("warning", "teacher_not_approved", "classes", classroom, "담당 계정이 승인 상태가 아닙니다. 현재 학급인지 확인하세요.");
  }
  for (const student of t.students) {
    if (typeof student.studentNumber !== "string" || !student.studentNumber.trim()) add("error", "student_number", "students", student, "학번은 앞자리 0을 보존한 문자열로 저장해야 합니다.");
    if (student.userId == null) {
      if (!student.isExample && student.status === "active") add("warning", "unlinked_student", "students", student, "학생 로그인 계정이 아직 연결되지 않았습니다. 교사는 자료를 계속 관리할 수 있습니다.");
    } else {
      if (linkedUsers.has(student.userId)) add("error", "account_multiple_students", "students", student, "학생 계정 하나가 여러 학생에게 연결되어 있습니다.");
      linkedUsers.add(student.userId);
      const account = accounts.get(student.userId);
      if (account && account.role !== "student") add("error", "student_account_role", "students", student, "학생에게 연결된 계정의 역할이 학생이 아닙니다.");
    }
    const versions = t.profileSnapshots.filter(r => r.studentId === student.id);
    const active = versions.filter(r => r.isActive);
    if (active.length > 1) add("error", "multiple_active_profiles", "students", student, "활성 분석 버전이 둘 이상입니다.");
    if (versions.length && !active.length) add("warning", "no_active_profile", "students", student, "분석 이력은 있으나 활성 버전이 없습니다.");
  }
  // Existence alone is insufficient: analysis and activity links must belong
  // to the same student even when both referenced IDs are valid.
  for (const table of tableNames) for (const row of t[table] as Row[]) {
    if (typeof row.snapshotId === "number" && row.studentId != null) {
      const snapshot = snapshots.get(row.snapshotId);
      if (snapshot && snapshot.studentId !== row.studentId) add("error", "cross_student_snapshot", table, row, "분석 버전과 하위 항목의 학생 ID가 다릅니다.");
    }
    if (table === "fingerprints") {
      const activity = activities.get(Number(row.activityId));
      if (activity && activity.studentId !== row.studentId) add("error", "cross_student_activity", table, row, "활동과 연구지문의 학생 ID가 다릅니다.");
    }
    if (table === "threadActivities") {
      const thread = threads.get(Number(row.threadId)), activity = activities.get(Number(row.activityId));
      if (thread && activity && thread.studentId !== activity.studentId) add("error", "cross_student_thread", table, row, "탐구 흐름에 다른 학생의 활동이 연결되어 있습니다.");
    }
  }
  const nodeKeys = new Set(t.ontologyNodes.map(r => `${r.snapshotId}:${r.nodeKey}`));
  for (const edge of t.ontologyEdges) if (!nodeKeys.has(`${edge.snapshotId}:${edge.sourceKey}`) || !nodeKeys.has(`${edge.snapshotId}:${edge.targetKey}`)) add("error", "missing_ontology_node", "ontologyEdges", edge, "같은 분석 버전 안에 연결할 온톨로지 항목이 없습니다.");
  return {
    contractVersion: SCHOOL_CONTRACT_VERSION, errorCount, warningCount, issues,
    omittedIssueCount: errorCount + warningCount - issues.length,
    tableCounts: Object.fromEntries(tableNames.map(name => [name, t[name].length])),
    counts: { tables: tableNames.length, rows: tableNames.reduce((n, name) => n + t[name].length, 0), realStudents: t.students.filter(r => !r.isExample).length, exampleStudents: t.students.filter(r => r.isExample).length, classes: t.classes.length, accounts: t.users.length, originalFiles: new Set([...t.studentRecords, ...t.referenceMaterials, ...t.activityFiles].map(r => r.objectKey)).size, profileVersions: t.profileSnapshots.length },
    limits: "자료 연결과 형식을 점검합니다. 원본 파일의 존재·내용은 전체 백업으로 검증하며, 실제 접근 권한은 역할별 시험으로 확인합니다.",
  };
}
