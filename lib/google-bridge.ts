import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storageConnection } from "@/db/schema";
import type { SchoolState } from "@/lib/school-tables";
import { runtimeValue, schoolSite } from "@/lib/site-runtime";

export type StorageConnection = typeof storageConnection.$inferSelect;
export class SharedStorageSetupError extends Error {
  constructor() { super("학교 공통 구글 저장소 연결을 준비하고 있습니다. 관리자가 Google 저장소 연결을 완료하면 이 사이트에서 담당 학급 자료를 사용할 수 있습니다."); }
}
export class GoogleConflictError extends Error {
  constructor() { super("다른 변경이 먼저 저장되었습니다. 최신 자료를 불러온 뒤 다시 시도하세요."); this.name = "GoogleConflictError"; }
}
export async function getStorageConnection() {
  const site = schoolSite();
  if (!site.isHome) {
    const raw = runtimeValue("TRACE_SHARED_GOOGLE_CONNECTION");
    if (typeof raw !== "string") throw new SharedStorageSetupError();
    let shared: { endpoint?: unknown; secret?: unknown; homeSiteId?: unknown };
    try { shared = JSON.parse(raw); } catch { throw new Error("공통 구글 저장소 설정 형식을 확인하세요."); }
    if (shared?.homeSiteId !== site.homeSiteId || typeof shared.secret !== "string" || shared.secret.length < 40) throw new Error("공통 구글 저장소의 기준 사이트와 연결 키를 확인하세요.");
    return { id: 1, state: "google" as const, endpoint: validateGoogleEndpoint(shared.endpoint), secret: shared.secret, ownerAuthUserId: "", updatedAt: "", migrationId: "", migrationPhase: "idle" as const, migrationToken: "", migrationLeaseUntil: 0 };
  }
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
  const site = schoolSite();
  const payload = JSON.stringify({ version: 1, operation, timestamp: Date.now(), nonce: crypto.randomUUID(), siteId: site.siteId, homeSiteId: site.homeSiteId, data });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = toBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, signature }), redirect: "follow", signal: AbortSignal.timeout(55_000) });
  let result: { ok?: boolean; code?: string; data?: T };
  try { result = await response.json(); } catch { throw new Error("구글 웹 앱을 확인하세요. 실행 사용자는 나, 액세스는 모든 사용자로 배포하고 TRACE 서명 검증 코드를 사용해야 합니다."); }
  if (!response.ok || !result.ok) {
    if (result.code === "CONFLICT") throw new GoogleConflictError();
    throw new Error(`구글 저장소 요청을 완료하지 못했습니다 (${String(result.code ?? "UNAVAILABLE").replace(/[^A-Z_]/g, "").slice(0, 50)}).`);
  }
  return result.data as T;
}
export function normalizeGoogleState(state:SchoolState):SchoolState {
  const sourceTables=Object.keys(state.tables);
  for (const name of ["guidanceEntries", "schoolIdentities", "identityEvents", "schoolOperations"] as const) if (!sourceTables.includes(name)) state.tables[name]=[];
  return {...state,sourceTables};
}
export async function readGoogleState() {
  const site = schoolSite();
  const state = await bridgeCall<SchoolState & {homeSiteId?: string}>("read", {});
  if ((!site.isHome || state.homeSiteId) && state.homeSiteId !== site.homeSiteId) throw new Error("공통 저장소의 기준 사이트가 다릅니다. 연결 코드 갱신과 설정을 확인하세요.");
  return normalizeGoogleState(state);
}
export async function commitGoogleState(state: SchoolState) {
  const tables={...state.tables} as Record<string,unknown>;
  for (const name of ["guidanceEntries", "schoolIdentities", "identityEvents", "schoolOperations"] as const) if(state.sourceTables && !state.sourceTables.includes(name)) {
    if(state.tables[name].length)throw new Error("Google 연결 코드 갱신이 필요합니다. 관리자 학교 설정에서 최신 코드를 설치하고 setupTrace를 실행하세요.");
    delete tables[name];
  }
  await bridgeCall("commit", { expectedRevision: state.revision, tables });
}
