import { inArray } from "drizzle-orm";
import { students, users } from "@/db/schema";
import type { getDb } from "@/db";
import type { BulkStudentRow } from "@/lib/student-registration";

export function buildStudentRegistrationBatch(db: ReturnType<typeof getDb>, classId: number, rows: BulkStudentRow[], accountByEmail: Map<string, { id: number }>) {
  const statements: Array<Parameters<typeof db.batch>[0][number]> = [];
  // Defaults also become bound parameters. 12 rows keep every INSERT below D1's 100-parameter limit.
  for (let index = 0; index < rows.length; index += 12) {
    statements.push(db.insert(students).values(rows.slice(index, index + 12).map((row) => ({
      classId, studentNumber: row.studentNumber, name: row.name, email: row.email,
      userId: accountByEmail.get(row.email)?.id ?? null,
    }))));
  }
  const accountIds = Array.from(new Set(rows.flatMap((row) => accountByEmail.has(row.email) ? [accountByEmail.get(row.email)!.id] : [])));
  for (let index = 0; index < accountIds.length; index += 90) {
    statements.push(db.update(users).set({ role: "student", status: "approved" }).where(inArray(users.id, accountIds.slice(index, index + 90))));
  }
  return { statements: statements as unknown as Parameters<typeof db.batch>[0], linkedCount: accountIds.length };
}
