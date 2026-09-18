import { schoolDigestInput } from "@/lib/school-data-digest";
import { sha256, toBase64, type StorageConnection } from "@/lib/google-bridge";
import type { SchoolRows } from "@/lib/school-tables";

const encoder = new TextEncoder();
const lifetime = 30 * 60_000;
async function key(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function createMigrationBackupReceipt(tables: SchoolRows, config: StorageConnection, homeSiteId: string, now = Date.now()) {
  const payload = JSON.stringify({ purpose: "trace-migration-backup-v1", homeSiteId, owner: config.ownerAuthUserId, endpoint: config.endpoint,
    digest: await sha256(encoder.encode(schoolDigestInput(tables))), issuedAt: now, expiresAt: now + lifetime });
  return `${toBase64(encoder.encode(payload))}.${toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(config.secret), encoder.encode(payload))))}`;
}
export async function verifyMigrationBackupReceipt(receipt: unknown, tables: SchoolRows, config: StorageConnection, homeSiteId: string, now = Date.now()) {
  const invalid = () => new Error("전환 전 전체 백업을 다시 받아 검증하세요. 백업 이후 자료가 바뀌었거나 30분이 지나면 새 백업이 필요합니다.");
  try {
    if (typeof receipt !== "string" || receipt.length > 4096) throw invalid();
    const parts = receipt.split("."); if (parts.length !== 2) throw invalid();
    const bytes = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
    const signature = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify("HMAC", await key(config.secret), signature, bytes)) throw invalid();
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (value.purpose !== "trace-migration-backup-v1" || value.homeSiteId !== homeSiteId || value.owner !== config.ownerAuthUserId || value.endpoint !== config.endpoint ||
      !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt) || value.issuedAt > now || value.expiresAt <= now || value.expiresAt - value.issuedAt !== lifetime ||
      value.digest !== await sha256(encoder.encode(schoolDigestInput(tables)))) throw invalid();
  } catch { throw invalid(); }
}
