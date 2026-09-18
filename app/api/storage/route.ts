import { schoolSite } from "@/lib/site-runtime";
import { rejectCrossSiteWrite } from "@/lib/request-guard";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storageConnection } from "@/db/schema";
import { ensureViewer } from "@/lib/data";
import { bridgeCall, getStorageConnection, validateGoogleEndpoint } from "@/lib/google-bridge";
import { getGoogleLocations } from "@/lib/google-locations";
import { copyLegacyFile, legacyFiles, legacySchoolRows } from "@/lib/storage-migration";
import { tableColumns, tableNames, type SchoolState } from "@/lib/school-tables";
import scriptTemplate from "@/google/Code.gs?raw";
import { assertGoogleHealth, inspectGoogleHealth, type GoogleHealth } from "@/lib/google-health";
import { auditSchoolData } from "@/lib/school-audit";
import { verifyMigrationBackupReceipt } from "@/lib/migration-backup";
import { assertMigrationSession, finishStorageTransition, idleMigration, migrationRow } from "@/lib/storage-transition";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
async function owner() {
  if (!schoolSite().isHome) throw new Error("저장소 연결과 이전은 기준 관리 사이트에서만 변경할 수 있습니다.");
  const viewer=await ensureViewer(), locations=getGoogleLocations();
  if(!viewer||viewer.status!=="approved"||viewer.role!=="admin"||viewer.email.toLowerCase()!==locations.ownerEmail.toLowerCase()) throw new Error("구글 저장소 소유자인 관리자만 연결 설정을 변경할 수 있습니다.");
  const config=await getStorageConnection();
  if(config&&config.ownerAuthUserId!==viewer.authUserId) throw new Error("저장소를 설정한 계정으로 로그인하세요.");
  return {viewer,locations,config};
}
export async function GET() {
  try {
    const {config,locations}=await owner();
    return Response.json({state:config?.state??"legacy",migrationId:config?.migrationId??"",migrationPhase:config?.migrationPhase??"idle",connected:Boolean(config?.endpoint),endpoint:config?.endpoint??"",folderUrl:`https://drive.google.com/drive/folders/${locations.folderId}`,sheetUrl:`https://docs.google.com/spreadsheets/d/${locations.spreadsheetId}/edit`,repositoryUrl:"https://github.com/yurowa90/researchtrace"},{headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"설정을 읽지 못했습니다."},{status:403,headers});}
}
export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request); if (rejected) return rejected;
  try {
    const {viewer,locations,config}=await owner();
    const body=await request.json() as Record<string,unknown>, action=body.action;
    if(action==="prepare") {
      let current=config;
      if(!current) { const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join(""); await getDb().insert(storageConnection).values({id:1,secret,ownerAuthUserId:viewer.authUserId}).onConflictDoNothing(); current=await getStorageConnection(); }
      if(!current) throw new Error("연결 코드를 준비하지 못했습니다.");
      const code=scriptTemplate.replace("__TRACE_CONFIG__",JSON.stringify({...locations,homeSiteId:schoolSite().homeSiteId,secret:current.secret,columns:tableColumns},null,2));
      return Response.json({code},{headers});
    }
    if(!config) throw new Error("설치 코드 준비부터 시작하세요.");
    if(action==="sharedConnection") {
      if(config.state!=="google")throw new Error("공통 구글 저장소로 자료 이전을 마친 뒤 추가 사이트를 연결하세요.");
      assertGoogleHealth(await bridgeCall<GoogleHealth>("health",{},config),schoolSite().homeSiteId,locations);
      return Response.json({sharedConfig:JSON.stringify({TRACE_HOME_SITE_ID:schoolSite().homeSiteId,TRACE_SHARED_GOOGLE_CONNECTION:JSON.stringify({homeSiteId:schoolSite().homeSiteId,endpoint:config.endpoint,secret:config.secret})},null,2)},{headers});
    }
    if(action==="backup") {
      if(config.state!=="google")throw new Error("Google 저장소로 전환한 뒤 사용할 수 있습니다.");
      return Response.json(await bridgeCall("backup",{},config),{headers});
    }
    if(action==="health") {
      return Response.json(inspectGoogleHealth(await bridgeCall<GoogleHealth>("health",{},config),schoolSite().homeSiteId,locations),{headers});
    }
    if(action==="connect") {
      if(config.state!=="legacy") throw new Error("이전 진행 중이거나 이미 연결된 저장소는 변경할 수 없습니다.");
      const endpoint=validateGoogleEndpoint(body.endpoint), candidate={...config,endpoint};
      assertGoogleHealth(await bridgeCall<GoogleHealth>("health",{},candidate),schoolSite().homeSiteId,locations);
      const changed=await getDb().update(storageConnection).set({endpoint,updatedAt:new Date().toISOString()}).where(and(eq(storageConnection.id,1),eq(storageConnection.state,"legacy"),eq(storageConnection.updatedAt,config.updatedAt))).returning({id:storageConnection.id});
      if(!changed.length)throw new Error("연결 설정이 변경되었거나 이전이 시작되었습니다. 화면을 새로고침하세요.");
      return Response.json({ok:true},{headers});
    }
    if(action==="start") {
      if(!config.endpoint||config.state==="google") throw new Error("연결 상태를 확인하세요.");
      assertGoogleHealth(await bridgeCall<GoogleHealth>("health",{},config),schoolSite().homeSiteId,locations);
      let migrationId=config.migrationId, migrationPhase=config.migrationPhase;
      if(config.state==="legacy") {
        const tables=await legacySchoolRows();
        if(auditSchoolData(tables).errorCount)throw new Error("자료 점검에서 오류가 발견되었습니다. 학교 설정의 자료 점검을 확인하고 수정한 뒤 전환하세요.");
        await verifyMigrationBackupReceipt(body.backupReceipt,tables,config,schoolSite().homeSiteId);
        const target=await bridgeCall<SchoolState>("read",{},config);
        if(target.revision!==0||tableNames.some(name=>target.tables[name]?.length!==0))throw new Error("대상 구글 시트에 이미 자료가 있습니다. 기존 자료를 덮어쓰지 않았습니다. 연결 대상과 이전 진행 상태를 확인하세요.");
        const frozenAt=new Date().toISOString();
        migrationId=crypto.randomUUID();migrationPhase="copying";
        const changed=await getDb().update(storageConnection).set({state:"migrating",...idleMigration,migrationId,migrationPhase,updatedAt:frozenAt}).where(and(eq(storageConnection.id,1),eq(storageConnection.state,"legacy"),eq(storageConnection.updatedAt,config.updatedAt))).returning({id:storageConnection.id});
        if(!changed.length)throw new Error("다른 이전 작업이 먼저 시작되었습니다. 화면을 새로고침하세요.");
        try {
          // SQL freeze triggers now prevent in-flight legacy writes as well.
          await verifyMigrationBackupReceipt(body.backupReceipt,await legacySchoolRows(),config,schoolSite().homeSiteId);
        } catch(error) {
          await getDb().update(storageConnection).set({state:"legacy",...idleMigration,updatedAt:new Date().toISOString()}).where(and(eq(storageConnection.id,1),eq(storageConnection.state,"migrating"),eq(storageConnection.migrationId,migrationId),eq(storageConnection.migrationPhase,"copying")));
          throw error;
        }
      } else assertMigrationSession(config,body.migrationId);
      return Response.json({total:legacyFiles(await legacySchoolRows()).length,migrationId,migrationPhase},{headers});
    }
    if(action==="cancel") {
      if(config.state!=="migrating") throw new Error("이전 중인 경우에만 기존 저장소로 돌아갈 수 있습니다.");
      assertMigrationSession(config,body.migrationId);
      if(config.migrationPhase!=="copying")throw new Error("최종 검증·저장을 시작한 작업은 취소할 수 없습니다. 검증이 끝나기를 기다리거나 완료 확인을 다시 실행하세요.");
      const canceled=await getDb().update(storageConnection).set({state:"legacy",...idleMigration,updatedAt:new Date().toISOString()}).where(and(migrationRow(config),eq(storageConnection.migrationPhase,"copying"))).returning({id:storageConnection.id});
      if(!canceled.length)throw new Error("다른 화면에서 최종 검증을 시작했습니다. 현재 작업을 다시 확인하세요.");
      return Response.json({ok:true},{headers});
    }
    if(config.state!=="migrating") throw new Error("자료 복사 시작을 먼저 선택하세요.");
    assertMigrationSession(config,body.migrationId);
    if(action==="copyFile") {
      if(config.migrationPhase!=="copying")throw new Error("최종 검증·저장 중입니다. 완료 확인을 다시 실행하세요.");
      const index=Number(body.index); if(!Number.isSafeInteger(index)||index<0) throw new Error("파일 순서를 확인하세요.");
      const result=await copyLegacyFile(index,config),current=await getStorageConnection();
      if(!current||current.state!=="migrating"||current.migrationId!==config.migrationId)throw new Error("이전 작업이 중단되거나 변경되었습니다. 화면을 새로고침하세요.");
      return Response.json(result,{headers});
    }
    if(action==="finish") {
      return Response.json(await finishStorageTransition(config,locations),{headers});
    }
    throw new Error("지원하지 않는 설정 작업입니다.");
  }catch(error){console.error("storage setup",error instanceof Error?error.name:"UnknownError");return Response.json({error:error instanceof Error?error.message:"저장소를 설정하지 못했습니다."},{status:400,headers});}
}
