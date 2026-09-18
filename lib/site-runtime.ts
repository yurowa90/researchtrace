import { env } from "cloudflare:workers";
import hosting from "../.openai/hosting.json" with { type: "json" };

export type PortalMode = "unified" | "student" | "teacher" | "admin";
export type SchoolSite = { siteId: string; homeSiteId: string; mode: PortalMode; isHome: boolean };
export class SiteAccessError extends Error {}
export function runtimeValue(key: string) { return (env as unknown as Record<string, unknown>)[key] ?? process.env[key]; }
export function schoolSite(): SchoolSite {
  const siteId = hosting.project_id;
  const mode = runtimeValue("TRACE_PORTAL_MODE") ?? "unified";
  if (!["unified", "student", "teacher", "admin"].includes(String(mode))) throw new Error("사이트 역할 설정을 확인하세요.");
  const homeSiteId = runtimeValue("TRACE_HOME_SITE_ID") ?? (mode === "unified" ? siteId : "");
  if (typeof homeSiteId !== "string" || !homeSiteId || homeSiteId.length > 200) throw new Error("공통 계정의 기준 사이트 설정이 필요합니다.");
  return { siteId, homeSiteId, mode: mode as PortalMode, isHome: siteId === homeSiteId };
}
export function roleAllowedOnSite(role: string, mode: PortalMode) {
  if (!["student", "teacher", "admin"].includes(role)) return false;
  return role === "admin" || mode === "unified" || (mode === "student" && role === "student") || (mode === "teacher" && role === "teacher");
}
export const portalModeLabels = { unified: "통합 사이트", student: "학생 사이트", teacher: "교사 사이트", admin: "관리자 사이트" } as const;
export function portalLink(key:"TRACE_ADMIN_PORTAL_URL"|"TRACE_TEACHER_PORTAL_URL") {
  const value=runtimeValue(key);
  if(typeof value!=="string")return null;
  try {const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.origin:null;} catch {return null;}
}
