import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, schoolIdentities, identityEvents } from "@/db/schema";
import { commitGoogleState, readGoogleState, GoogleConflictError } from "@/lib/google-bridge";
import { insertRow, type SchoolState } from "@/lib/school-tables";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { roleAllowedOnSite, portalModeLabels, SiteAccessError, type SchoolSite } from "@/lib/site-runtime";

type User = typeof users.$inferSelect;
export type SchoolViewer = User & { loginIdentityId?: number; loginSiteId?: string };
export type LoginIdentity = typeof schoolIdentities.$inferSelect;
export type PlatformLogin = { userId: string; email: string; displayName: string };
type IdentityData = { users: User[]; schoolIdentities: LoginIdentity[]; identityEvents: (typeof identityEvents.$inferSelect)[] };
const updateMessage = "Google 연결 코드 갱신이 필요합니다. 학교 설정에서 최신 코드로 setupTrace를 실행하고 배포를 갱신하세요.";

function pendingViewer(auth: PlatformLogin, row: LoginIdentity): SchoolViewer {
  return { id: 0, authUserId: auth.userId, email: auth.email, displayName: auth.displayName, role: "student", status: row.status === "pending" ? "pending" : "suspended", createdAt: row.createdAt, loginIdentityId: row.id, loginSiteId: row.siteId };
}
function linkedViewer(auth: PlatformLogin, row: LoginIdentity, accounts: User[], site: SchoolSite): SchoolViewer {
  if (row.status !== "approved") return pendingViewer(auth, row);
  const user = accounts.find(u => u.id === row.userId);
  if (!user) throw new Error("연결된 학교 계정을 확인할 수 없습니다.");
  if (user.status === "approved" && !roleAllowedOnSite(user.role, site.mode)) throw new SiteAccessError(`이 계정은 ${portalModeLabels[site.mode]}를 사용할 수 없습니다. 역할에 맞는 사이트로 접속하세요.`);
  return { ...user, loginIdentityId: row.id, loginSiteId: row.siteId };
}
const identityValues = (auth: PlatformLogin, site: SchoolSite, user?: User) => ({
  siteId: site.siteId, subject: auth.userId, portalMode: site.mode, email: auth.email.trim().toLowerCase(), displayName: auth.displayName,
  userId: user?.id ?? null, status: user ? "approved" as const : "pending" as const, source: user ? "legacy" as const : "request" as const,
});
function validateLogin(auth: PlatformLogin) {
  if (!auth.userId || auth.userId.length > 512 || !auth.email || auth.email.length > 320 || !auth.displayName || auth.displayName.length > 300) throw new Error("로그인 계정 정보를 확인하세요.");
}

// Called only with dispatcher-authenticated identity and server-owned site ID.
// Email collisions produce a pending request; they never merge user accounts.
export async function ensureLegacyIdentity(auth: PlatformLogin, site: SchoolSite, writable = true): Promise<SchoolViewer> {
  validateLogin(auth);
  if (!site.isHome) throw new Error("추가 사이트에는 공통 구글 저장소 연결이 필요합니다.");
  const db = getDb();
  const predicate = and(eq(schoolIdentities.siteId, site.siteId), eq(schoolIdentities.subject, auth.userId));
  let [identity] = await db.select().from(schoolIdentities).where(predicate).limit(1);
  if (identity) {
    const accounts = identity.userId ? await db.select().from(users).where(eq(users.id, identity.userId)) : [];
    return linkedViewer(auth, identity, accounts, site);
  }
  let [user] = await db.select().from(users).where(eq(users.authUserId, auth.userId)).limit(1);
  if (!writable) {
    if (!user) throw new Error("저장소 이전 중입니다. 완료 후 로그인하세요.");
    if (!roleAllowedOnSite(user.role, site.mode)) throw new SiteAccessError("역할에 맞는 사이트로 접속하세요.");
    return user;
  }
  if (!user) {
    const email = auth.email.trim().toLowerCase();
    const all = await db.select().from(users);
    if (!all.some(u => u.email.toLowerCase() === email)) {
      const localBootstrap = process.env.NODE_ENV !== "production" && auth.userId === "local-demo-teacher" && all.length === 0;
      await db.insert(users).values({ authUserId: auth.userId, email, displayName: auth.displayName, role: localBootstrap ? "admin" : "student", status: localBootstrap ? "approved" : "pending" }).onConflictDoNothing();
      [user] = await db.select().from(users).where(eq(users.authUserId, auth.userId)).limit(1);
    }
  }
  await db.insert(schoolIdentities).values(identityValues(auth, site, user)).onConflictDoNothing();
  [identity] = await db.select().from(schoolIdentities).where(predicate).limit(1);
  if (!identity) throw new Error("계정 연결 요청을 저장하지 못했습니다. 다시 로그인하세요.");
  const accounts = identity.userId ? await db.select().from(users).where(eq(users.id, identity.userId)) : [];
  return linkedViewer(auth, identity, accounts, site);
}

export function resolveGoogleIdentity(state: SchoolState, auth: PlatformLogin, site: SchoolSite): { viewer: SchoolViewer; changed: boolean } {
  validateLogin(auth);
  const t = state.tables;
  const identity = t.schoolIdentities.find(r => r.siteId === site.siteId && r.subject === auth.userId);
  if (identity) return { viewer: linkedViewer(auth, identity, t.users, site), changed: false };
  let user = site.isHome ? t.users.find(u => u.authUserId === auth.userId) : undefined;
  if (state.sourceTables && !state.sourceTables.includes("schoolIdentities")) {
    // Preserve old primary logins until the owner updates the Google script.
    if (user && roleAllowedOnSite(user.role, site.mode)) return { viewer: user, changed: false };
    throw new Error(updateMessage);
  }
  if (!user && site.isHome && !t.users.some(u => u.email.toLowerCase() === auth.email.trim().toLowerCase())) {
    user = insertRow(state, "users", { authUserId: auth.userId, email: auth.email.trim().toLowerCase(), displayName: auth.displayName, role: "student", status: "pending" });
  }
  const created = insertRow(state, "schoolIdentities", identityValues(auth, site, user));
  return { viewer: linkedViewer(auth, created, t.users, site), changed: true };
}
export async function ensureSharedIdentity(auth: PlatformLogin, site: SchoolSite) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await readGoogleState(), result = resolveGoogleIdentity(state, auth, site);
    if (!result.changed) return result.viewer;
    try { await commitGoogleState(state); return result.viewer; }
    catch (error) { if (!(error instanceof GoogleConflictError) || attempt === 2) throw error; }
  }
  throw new Error("계정 연결을 다시 확인하세요.");
}

export function currentIdentityActor(t: IdentityData, viewer: SchoolViewer) {
  const actor = t.users.find(u => u.id === viewer.id && u.authUserId === viewer.authUserId);
  if (!actor) throw new SiteAccessError("학교 계정 권한을 확인할 수 없습니다.");
  if (viewer.loginIdentityId && !t.schoolIdentities.some(r => r.id === viewer.loginIdentityId && r.siteId === viewer.loginSiteId && r.userId === actor.id && r.status === "approved")) throw new SiteAccessError("사이트 계정 연결이 해제되었습니다. 다시 로그인하세요.");
  return { ...actor, loginIdentityId: viewer.loginIdentityId, loginSiteId: viewer.loginSiteId };
}
export function prepareIdentityReview(t: IdentityData, givenViewer: SchoolViewer, body: Record<string, unknown>) {
  const viewer = currentIdentityActor(t, givenViewer);
  if (!isSchoolAdmin(viewer)) throw new Error("학교 관리자만 계정을 연결하거나 해제할 수 있습니다.");
  const identity = t.schoolIdentities.find(r => r.id === Number(body.identityId));
  if (!identity || identity.revision !== Number(body.expectedRevision)) throw new Error("다른 변경이 먼저 저장되었습니다. 연결 목록을 다시 불러오세요.");
  if (identity.id === viewer.loginIdentityId || (identity.userId === viewer.id && identity.subject === viewer.authUserId && identity.siteId === viewer.loginSiteId)) throw new Error("현재 로그인에 사용 중인 연결은 해제하거나 바꿀 수 없습니다.");
  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "revoke") throw new Error("연결 작업을 확인하세요.");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length < 3 || note.length > 500) throw new Error("본인 확인 근거나 처리 사유를 3~500자로 입력하세요.");
  let userId = identity.userId;
  if (action === "approve") {
    if (identity.status === "approved") throw new Error("이미 연결된 로그인입니다.");
    const target = t.users.find(u => u.id === Number(body.userId));
    if (!target || target.status !== "approved" || !roleAllowedOnSite(target.role, identity.portalMode)) throw new Error("사이트 역할에 맞는 승인된 학교 계정을 선택하세요.");
    if (userId !== null && userId !== target.id) throw new Error("이 로그인은 이전에 연결한 학교 계정에만 다시 연결할 수 있습니다.");
    userId = target.id;
  } else if (action === "reject" && identity.status !== "pending") throw new Error("승인 대기 중인 연결만 거절할 수 있습니다.");
  else if (action === "revoke" && identity.status !== "approved") throw new Error("사용 중인 연결만 해제할 수 있습니다.");
  const revision = identity.revision + 1;
  const update = { userId, status: action === "approve" ? "approved" as const : action === "reject" ? "rejected" as const : "revoked" as const, revision, reviewedBy: viewer.id, reviewedAt: new Date().toISOString(), verificationNote: note };
  const event: typeof identityEvents.$inferInsert = { identityId: identity.id, revision, action, targetUserId: userId, actorId: viewer.id, note };
  return { identity, update, event };
}
export function applyIdentityReview(state: SchoolState, viewer: SchoolViewer, body: Record<string, unknown>) {
  const prepared = prepareIdentityReview(state.tables, viewer, body);
  Object.assign(prepared.identity, prepared.update);
  insertRow(state, "identityEvents", prepared.event);
  return { ok: true };
}
export function registerTeacherIdentity(state: SchoolState, givenViewer: SchoolViewer, body: Record<string, unknown>) {
  const viewer=currentIdentityActor(state.tables,givenViewer);
  if(!isSchoolAdmin(viewer))throw new SiteAccessError("학교 관리자만 새 교사 계정을 등록할 수 있습니다.");
  const identity=state.tables.schoolIdentities.find(r=>r.id===Number(body.identityId));
  if(!identity||identity.revision!==Number(body.expectedRevision)||identity.status!=="pending"||identity.userId!==null||identity.portalMode!=="teacher")throw new Error("새 교사의 연결 승인 대기 요청을 다시 확인하세요.");
  const email=identity.email.trim().toLowerCase(),note=typeof body.note==="string"?body.note.trim():"";
  if(!email||!identity.displayName.trim()||!identity.subject)throw new Error("로그인 요청 정보를 확인하세요.");
  if(note.length<3||note.length>450||body.confirmTeacher!==true)throw new Error("학교 소속 교사 본인 확인을 표시하고 확인 근거를 3~450자로 입력하세요.");
  if(state.tables.users.some(u=>u.email.trim().toLowerCase()===email))throw new Error("같은 이메일의 학교 계정이 있습니다. 기존 계정의 역할과 승인 상태를 확인한 뒤 연결하세요.");
  // A school ID is independent of both Sites' login subjects. Never merge by email.
  // Account, binding and audit event are committed in one revision-checked Sheets batch.
  const account=insertRow(state,"users",{authUserId:`school:${crypto.randomUUID()}`,email,displayName:identity.displayName,role:"teacher",status:"approved"});
  return applyIdentityReview(state,viewer,{...body,action:"approve",userId:account.id,note:`새 교사 계정 등록 · ${note}`});
}
export async function readLegacyIdentityData(): Promise<IdentityData> {
  const db = getDb();
  const [accounts, identities, events] = await db.batch([db.select().from(users), db.select().from(schoolIdentities), db.select().from(identityEvents)]);
  return { users: accounts, schoolIdentities: identities, identityEvents: events };
}
export async function saveLegacyIdentityReview(viewer: SchoolViewer, body: Record<string, unknown>) {
  const prepared = prepareIdentityReview(await readLegacyIdentityData(), viewer, body), db = getDb();
  // The unique identity+revision event makes competing reviews roll back the
  // entire batch rather than allowing a second writer to overwrite a decision.
  await db.batch([
    db.insert(identityEvents).values(prepared.event),
    db.update(schoolIdentities).set(prepared.update).where(and(eq(schoolIdentities.id, prepared.identity.id), eq(schoolIdentities.revision, prepared.identity.revision))),
  ]);
  return { ok: true };
}
