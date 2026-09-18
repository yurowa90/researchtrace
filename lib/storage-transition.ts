import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { storageConnection } from "@/db/schema";
import { bridgeCall, GoogleConflictError, type StorageConnection } from "@/lib/google-bridge";
import { assertGoogleHealth, type GoogleHealth } from "@/lib/google-health";
import type { GoogleLocations } from "@/lib/google-locations";
import { legacyFiles, legacySchoolRows, schoolDigestInput } from "@/lib/storage-migration";
import { auditSchoolData } from "@/lib/school-audit";
import { schoolSite } from "@/lib/site-runtime";
import { tableNames, type SchoolState } from "@/lib/school-tables";

export const idleMigration = { migrationId: "", migrationPhase: "idle" as const, migrationToken: "", migrationLeaseUntil: 0 };
const leaseMs = 3 * 60_000;
export function assertMigrationSession(config: StorageConnection, id: unknown) {
  if (!config.migrationId || config.migrationPhase === "idle") throw new Error("이전 작업의 확인 정보가 없습니다. 연결 상태를 관리자에게 확인하세요.");
  if (id !== config.migrationId) throw new Error("이전 작업이 변경되었습니다. 화면을 새로고침한 뒤 현재 작업을 이어서 실행하세요.");
}
export function migrationRow(config: StorageConnection) {
  return and(eq(storageConnection.id, 1), eq(storageConnection.state, "migrating"), eq(storageConnection.migrationId, config.migrationId));
}

export async function finishStorageTransition(config: StorageConnection, locations: GoogleLocations) {
  const now = Date.now(), db = getDb();
  if (config.migrationPhase !== "copying" && config.migrationLeaseUntil > now) throw new Error("다른 화면에서 자료를 검증하고 있습니다. 완료를 기다리거나 3분 뒤 현재 작업을 다시 확인하세요.");
  const token = crypto.randomUUID();
  let phase: "verifying" | "committing" = config.migrationPhase === "committing" ? "committing" : "verifying";
  const claimed = await db.update(storageConnection).set({ migrationPhase: phase, migrationToken: token, migrationLeaseUntil: now + leaseMs, updatedAt: new Date().toISOString() })
    .where(and(migrationRow(config), eq(storageConnection.migrationPhase, config.migrationPhase), eq(storageConnection.migrationToken, config.migrationToken), lte(storageConnection.migrationLeaseUntil, now))).returning({ id: storageConnection.id });
  if (!claimed.length) throw new Error("다른 이전 작업이 먼저 진행되었습니다. 화면을 새로고침하세요.");
  const owns = () => and(migrationRow(config), eq(storageConnection.migrationToken, token), eq(storageConnection.migrationPhase, phase));
  const renew = async (next: "verifying" | "committing" = phase) => {
    const rows = await db.update(storageConnection).set({ migrationPhase: next, migrationLeaseUntil: Date.now() + leaseMs, updatedAt: new Date().toISOString() }).where(owns()).returning({ id: storageConnection.id });
    if (!rows.length) throw new Error("이전 작업의 처리자가 변경되었습니다. 화면을 새로고침하세요.");
    phase = next;
  };
  try {
    assertGoogleHealth(await bridgeCall<GoogleHealth>("health", {}, config), schoolSite().homeSiteId, locations);
    const tables = await legacySchoolRows(), files = legacyFiles(tables);
    if (auditSchoolData(tables).errorCount) throw new Error("기존 자료 점검 오류로 전환을 중단했습니다.");
    for (let start = 0; start < files.length; start += 10) {
      await renew();
      const batch = files.slice(start, start + 10).map(row => ({ objectKey: row.objectKey, sizeBytes: row.sizeBytes }));
      const verified = await bridgeCall<{ checked: number; verificationVersion?: number }>("checkFiles", { files: batch }, config);
      if (verified.checked !== batch.length || verified.verificationVersion !== 1) throw new Error("원본 내용을 검증하지 못했습니다. 최신 Google 연결 코드로 갱신하세요.");
    }
    const current = await bridgeCall<SchoolState>("read", {}, config);
    if (current.revision === 0 && tableNames.some(name => current.tables[name]?.length !== 0)) throw new Error("대상 시트에 다른 자료가 있어 덮어쓰기를 중단했습니다.");
    if (current.revision !== 0 && schoolDigestInput(current.tables) !== schoolDigestInput(tables)) throw new Error("대상 자료가 기존 기록과 다릅니다. 저장소를 전환하지 않았습니다.");
    // Persist the point of no return BEFORE calling the remote commit. A lost
    // response may already have committed; cancellation must never unfreeze D1.
    await renew("committing");
    if (current.revision === 0) {
      try { await bridgeCall("commit", { expectedRevision: 0, tables }, config); }
      catch (error) { if (!(error instanceof GoogleConflictError)) throw error; }
    }
    const verified = await bridgeCall<SchoolState>("read", {}, config);
    if (schoolDigestInput(verified.tables) !== schoolDigestInput(tables)) throw new Error("복사한 데이터가 기존 자료와 다릅니다. 저장소를 전환하지 않았습니다.");
    const done = await db.update(storageConnection).set({ state: "google", ...idleMigration, updatedAt: new Date().toISOString() }).where(owns()).returning({ id: storageConnection.id });
    if (!done.length) throw new Error("이전 작업 상태가 변경되었습니다. 현재 저장 위치를 다시 확인하세요.");
    return { ok: true, counts: Object.fromEntries(tableNames.map(name => [name, tables[name].length])) };
  } catch (error) {
    // Pre-commit failures can return to copying/cancel. An uncertain commit
    // remains frozen and can be retried immediately by verifying the same data.
    await db.update(storageConnection).set({ migrationPhase: phase === "verifying" ? "copying" : "committing", migrationToken: "", migrationLeaseUntil: 0, updatedAt: new Date().toISOString() }).where(owns());
    throw error;
  }
}
