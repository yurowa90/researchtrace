import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storageConnection } from "@/db/schema";
import type { SchoolState } from "@/lib/school-tables";

export type StorageConnection = typeof storageConnection.$inferSelect;
export async function getStorageConnection() {
  const [row] = await getDb().select().from(storageConnection).where(eq(storageConnection.id, 1)).limit(1);
  return row ?? null;
}
export async function googleEnabled() { return (await getStorageConnection())?.state === "google"; }
export async function assertStorageWritable() {
  if ((await getStorageConnection())?.state === "migrating") throw new Error("구글 저장소로 자료를 복사 중입니다. 완료 후 다시 저장하세요.");
}
export function validateGoogleEndpoint(value: unknown) {
  if (typeof value !== "string" || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(value.trim())) throw new Error("Apps Script 배포 화면의 /exec로 끝나는 웹 앱 URL을 입력하세요.");
  return value.trim();
}
export function toBase64(bytes: Uint8Array) {
  let text = "";
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(text);
}
export function fromBase64(text: string) { return Uint8Array.from(atob(text), (character) => character.charCodeAt(0)); }
export async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), (part) => part.toString(16).padStart(2, "0")).join("");
}
export async function bridgeCall<T>(operation: string, data: unknown, connection?: StorageConnection): Promise<T> {
  const config = connection ?? await getStorageConnection();
  if (!config?.endpoint || !config.secret) throw new Error("구글 저장소 연결을 먼저 완료하세요.");
  const endpoint = validateGoogleEndpoint(config.endpoint);
  const payload = JSON.stringify({ version: 1, operation, timestamp: Date.now(), nonce: crypto.randomUUID(), data });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, signature }), redirect: "follow", signal: AbortSignal.timeout(55_000) });
  let result: { ok?: boolean; code?: string; data?: T };
  try { result = await response.json(); } catch { throw new Error("구글 웹 앱을 확인하세요. 실행 사용자는 나, 액세스는 모든 사용자로 배포하고 TRACE 서명 검증 코드를 사용해야 합니다."); }
  if (!response.ok || !result.ok) {
    if (result.code === "CONFLICT") throw new Error("다른 변경이 먼저 저장되었습니다. 최신 자료를 불러온 뒤 다시 시도하세요.");
    throw new Error(`구글 저장소 요청을 완료하지 못했습니다 (${String(result.code ?? "UNAVAILABLE").replace(/[^A-Z_]/g, "").slice(0, 50)}).`);
  }
  return result.data as T;
}
export async function readGoogleState() { return bridgeCall<SchoolState>("read", {}); }
export async function commitGoogleState(state: SchoolState) {
  await bridgeCall("commit", { expectedRevision: state.revision, tables: state.tables });
}
