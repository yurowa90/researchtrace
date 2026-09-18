import { tableColumns, tableNames } from "@/lib/school-tables";
import type { GoogleLocations } from "@/lib/google-locations";

export type GoogleHealth = {
  version?: number; homeSiteId?: string; spreadsheetId?: string; folderId?: string;
  ownerEmail?: string; schemaTables?: string[]; schemaColumns?: Record<string, string[]>;
  fileVerificationVersion?: number;
};
export function inspectGoogleHealth(health: GoogleHealth, homeSiteId: string, locations?: GoogleLocations) {
  const missingTables = tableNames.filter(name => !health.schemaTables?.includes(name));
  const mismatchedTables = tableNames.filter(name => JSON.stringify(health.schemaColumns?.[name]) !== JSON.stringify(tableColumns[name]));
  const identityMatches = health.version === 1 && health.homeSiteId === homeSiteId && (!locations || (
    health.spreadsheetId === locations.spreadsheetId && health.folderId === locations.folderId &&
    typeof health.ownerEmail === "string" && health.ownerEmail.toLowerCase() === locations.ownerEmail.toLowerCase()
  ));
  const fileVerificationReady = health.fileVerificationVersion === 1;
  return { updated: Boolean(identityMatches && !missingTables.length && !mismatchedTables.length && fileVerificationReady), identityMatches: Boolean(identityMatches), missingTables, mismatchedTables, fileVerificationReady };
}
export function assertGoogleHealth(health: GoogleHealth, homeSiteId: string, locations?: GoogleLocations) {
  const result = inspectGoogleHealth(health, homeSiteId, locations);
  if (!result.identityMatches) throw new Error("구글 저장소의 소유자·기준 사이트·폴더·시트가 현재 학교 설정과 일치하지 않습니다.");
  if (!result.updated) throw new Error("최신 설치 코드로 setupTrace 실행과 웹 앱 배포 갱신을 완료하세요. 모든 시트·열과 원본 내용 검증 기능을 확인해야 합니다.");
  return result;
}
