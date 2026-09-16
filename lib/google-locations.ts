import { env } from "cloudflare:workers";
export type GoogleLocations = {
  ownerEmail: string; folderId: string; recordsFolderId: string;
  referencesFolderId: string; resultsFolderId: string; backupsFolderId: string; spreadsheetId: string;
};
// Account-specific identifiers belong in runtime configuration, never in GitHub.
export function getGoogleLocations(): GoogleLocations {
  const raw = (env as unknown as Record<string, unknown>).TRACE_GOOGLE_LOCATIONS ?? process.env.TRACE_GOOGLE_LOCATIONS;
  if (typeof raw !== "string") throw new Error("관리자의 구글 저장소 정보가 아직 설정되지 않았습니다.");
  const value = JSON.parse(raw) as GoogleLocations;
  if (![value.ownerEmail,value.folderId,value.recordsFolderId,value.referencesFolderId,value.resultsFolderId,value.backupsFolderId,value.spreadsheetId].every(v=>typeof v==="string"&&v.length>3)) throw new Error("구글 저장소 설정을 확인하세요.");
  return value;
}
