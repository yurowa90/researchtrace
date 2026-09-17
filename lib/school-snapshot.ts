import { env } from "cloudflare:workers";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getStorageConnection, readGoogleState } from "@/lib/google-bridge";
import { schoolTables, tableNames, type SchoolRows } from "@/lib/school-tables";

export type SchoolSnapshot = { capturedAt: string; storage: "legacy" | "google"; revision: number | null; tables: SchoolRows };

export async function readSchoolSnapshot(): Promise<SchoolSnapshot> {
  const connection = await getStorageConnection();
  if (connection?.state === "migrating") throw new Error("저장소 이전 중에는 전체 자료 점검과 백업을 잠시 멈춥니다. 이전을 마친 뒤 다시 실행하세요.");
  if (connection?.state === "google") {
    const state = await readGoogleState();
    return { capturedAt: new Date().toISOString(), storage: "google", revision: state.revision, tables: state.tables };
  }
  if (!env.DB) throw new Error("학교 자료 저장소를 사용할 수 없습니다.");
  // One transactional D1 batch gives all tables the same read snapshot.
  // Table and column names come only from the application schema allowlist.
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const queries = tableNames.map(name => {
    const columns = getTableColumns(schoolTables[name]);
    const fields = Object.entries(columns).map(([key, column]) => `${quote(column.name)} AS ${quote(key)}`).join(", ");
    const idColumn = Object.entries(columns).find(([key]) => key === "id")?.[1];
    const order = idColumn ? ` ORDER BY ${quote(idColumn.name)}` : "";
    return env.DB!.prepare(`SELECT ${fields} FROM ${quote(getTableName(schoolTables[name]))}${order}`);
  });
  const results = await env.DB.batch(queries);
  const tables = Object.fromEntries(tableNames.map((name, index) => {
    const columns = getTableColumns(schoolTables[name]);
    if (!results[index].success) throw new Error("학교 자료를 같은 시점으로 읽지 못했습니다.");
    return [name, results[index].results.map(value => {
      const row = value as Record<string, unknown>;
      return Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, row[key] == null ? null : column.mapFromDriverValue(row[key])]));
    })];
  })) as SchoolRows;
  return { capturedAt: new Date().toISOString(), storage: "legacy", revision: null, tables };
}
