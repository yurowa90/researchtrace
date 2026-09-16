import { getTableColumns } from "drizzle-orm";
import * as schema from "@/db/schema";

// Explicit allowlist: connection secrets are deliberately excluded from exports.
export const schoolTables = {
  users: schema.users, classes: schema.classes, students: schema.students,
  subjects: schema.subjects, activities: schema.activities, fingerprints: schema.fingerprints,
  activityFiles: schema.activityFiles, inquiryThreads: schema.inquiryThreads,
  threadActivities: schema.threadActivities, studentRecords: schema.studentRecords,
  profileSnapshots: schema.profileSnapshots, profileSections: schema.profileSections,
  researchKeywords: schema.researchKeywords, ontologyNodes: schema.ontologyNodes,
  ontologyEdges: schema.ontologyEdges, wikiPages: schema.wikiPages,
  academicCourseRecords: schema.academicCourseRecords, academicTrends: schema.academicTrends,
  creditSummaries: schema.creditSummaries, evaluationReferences: schema.evaluationReferences,
  competencyEvaluations: schema.competencyEvaluations,
  referenceMaterials: schema.referenceMaterials, referenceSelections: schema.referenceSelections,
};
export type SchoolTable = keyof typeof schoolTables;
export type SchoolRows = { [K in SchoolTable]: (typeof schoolTables)[K]["$inferSelect"][] };
export type SchoolState = { revision: number; tables: SchoolRows };
export const tableNames = Object.keys(schoolTables) as SchoolTable[];
export const tableColumns = Object.fromEntries(tableNames.map((name) => [name, Object.keys(getTableColumns(schoolTables[name]))])) as Record<SchoolTable, string[]>;

export function emptySchoolState(): SchoolState {
  return { revision: 0, tables: Object.fromEntries(tableNames.map((name) => [name, []])) as unknown as SchoolRows };
}

export function insertRow<K extends SchoolTable>(state: SchoolState, table: K, values: Partial<SchoolRows[K][number]>): SchoolRows[K][number] {
  const rows = state.tables[table] as Record<string, unknown>[];
  const columns = getTableColumns(schoolTables[table]);
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (key in values) row[key] = (values as Record<string, unknown>)[key];
    else if (key === "id") row[key] = Math.max(0, ...rows.map((item) => Number(item.id))) + 1;
    else if (column.default !== undefined) row[key] = typeof column.default === "object" ? new Date().toISOString() : column.default;
    else row[key] = null;
  }
  rows.push(row);
  return row as SchoolRows[K][number];
}
