import { schoolSite } from "@/lib/site-runtime";
import { rejectCrossSiteWrite } from "@/lib/request-guard";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storageConnection } from "@/db/schema";
import { ensureViewer } from "@/lib/data";
import { bridgeCall, getStorageConnection, validateGoogleEndpoint } from "@/lib/google-bridge";
import { getGoogleLocations } from "@/lib/google-locations";
import { copyLegacyFile, legacyFiles, legacySchoolRows, schoolDigestInput } from "@/lib/storage-migration";
import { tableColumns, tableNames, type SchoolState } from "@/lib/school-tables";
import scriptTemplate from "@/google/Code.gs?raw";

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
    return Response.json({state:config?.state??"legacy",connected:Boolean(config?.endpoint),endpoint:config?.endpoint??"",folderUrl:`https://drive.google.com/drive/folders/${locations.folderId}`,sheetUrl:`https://docs.google.com/spreadsheets/d/${locations.spreadsheetId}/edit`,repositoryUrl:"https://github.com/yurowa90/researchtrace"},{headers});
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
      const health=await bridgeCall<{homeSiteId?:string;schemaTables?:string[]}>("health",{},config);
      if(health.homeSiteId!==schoolSite().homeSiteId||!["schoolIdentities","identityEvents"].every(name=>health.schemaTables?.includes(name)))throw new Error("최신 구글 연결 코드로 갱신한 뒤 추가 사이트를 연결하세요.");
      return Response.json({sharedConfig:JSON.stringify({TRACE_HOME_SITE_ID:schoolSite().homeSiteId,TRACE_SHARED_GOOGLE_CONNECTION:JSON.stringify({homeSiteId:schoolSite().homeSiteId,endpoint:config.endpoint,secret:config.secret})},null,2)},{headers});
    }
    if(action==="backup") {
      if(config.state!=="google")throw new Error("Google 저장소로 전환한 뒤 사용할 수 있습니다.");
      return Response.json(await bridgeCall("backup",{},config),{headers});
    }
    if(action==="health") {
      const health=await bridgeCall<{schemaTables?:string[];homeSiteId?:string}>("health",{},config);
      return Response.json({updated:health.homeSiteId===schoolSite().homeSiteId&&["guidanceEntries","schoolIdentities","identityEvents"].every(name=>health.schemaTables?.includes(name))},{headers});
    }
    if(action==="connect") {
      if(config.state!=="legacy") throw new Error("이전 진행 중이거나 이미 연결된 저장소는 변경할 수 없습니다.");
      const endpoint=validateGoogleEndpoint(body.endpoint), candidate={...config,endpoint};
      const health=await bridgeCall<{version:number;spreadsheetId:string;folderId:string;ownerEmail:string;homeSiteId?:string;schemaTables?:string[]}>("health",{},candidate);
      if(health.version!==1||health.spreadsheetId!==locations.spreadsheetId||health.folderId!==locations.folderId||health.ownerEmail.toLowerCase()!==locations.ownerEmail.toLowerCase()) throw new Error("사이트에서 제공한 설치 코드와 소유자 계정을 확인하세요.");
      if(health.homeSiteId!==schoolSite().homeSiteId||!["schoolIdentities","identityEvents"].every(name=>health.schemaTables?.includes(name)))throw new Error("최신 설치 코드로 setupTrace 실행과 웹 앱 배포 갱신을 완료하세요.");
      await getDb().update(storageConnection).set({endpoint,updatedAt:new Date().toISOString()}).where(eq(storageConnection.id,1));
      return Response.json({ok:true},{headers});
    }
    if(action==="start") {
      if(!config.endpoint||config.state==="google") throw new Error("연결 상태를 확인하세요.");
      const health=await bridgeCall<{homeSiteId?:string;schemaTables?:string[]}>("health",{},config);
      if(health.homeSiteId!==schoolSite().homeSiteId||!["guidanceEntries","schoolIdentities","identityEvents"].every(name=>health.schemaTables?.includes(name)))throw new Error("최신 구글 연결 코드로 갱신한 뒤 자료 이전을 시작하세요.");
      await getDb().update(storageConnection).set({state:"migrating",updatedAt:new Date().toISOString()}).where(eq(storageConnection.id,1));
      return Response.json({total:legacyFiles(await legacySchoolRows()).length},{headers});
    }
    if(action==="cancel") {
      if(config.state!=="migrating") throw new Error("이전 중인 경우에만 기존 저장소로 돌아갈 수 있습니다.");
      await getDb().update(storageConnection).set({state:"legacy",updatedAt:new Date().toISOString()}).where(eq(storageConnection.id,1));
      return Response.json({ok:true},{headers});
    }
    if(config.state!=="migrating") throw new Error("자료 복사 시작을 먼저 선택하세요.");
    if(action==="copyFile") {
      const index=Number(body.index); if(!Number.isSafeInteger(index)||index<0) throw new Error("파일 순서를 확인하세요.");
      return Response.json(await copyLegacyFile(index,config),{headers});
    }
    if(action==="finish") {
      const tables=await legacySchoolRows(), files=legacyFiles(tables);
      await bridgeCall("checkFiles",{files:files.map(row=>({objectKey:row.objectKey,sizeBytes:row.sizeBytes}))},config);
      const current=await bridgeCall<SchoolState>("read",{},config);
      if(current.revision===0) await bridgeCall("commit",{expectedRevision:0,tables},config);
      const verified=await bridgeCall<SchoolState>("read",{},config);
      if(schoolDigestInput(verified.tables)!==schoolDigestInput(tables)) throw new Error("복사한 데이터가 기존 자료와 다릅니다. 저장소를 전환하지 않았습니다.");
      await getDb().update(storageConnection).set({state:"google",updatedAt:new Date().toISOString()}).where(eq(storageConnection.id,1));
      return Response.json({ok:true,counts:Object.fromEntries(tableNames.map(name=>[name,tables[name].length]))},{headers});
    }
    throw new Error("지원하지 않는 설정 작업입니다.");
  }catch(error){console.error("storage setup",error instanceof Error?error.name:"UnknownError");return Response.json({error:error instanceof Error?error.message:"저장소를 설정하지 못했습니다."},{status:400,headers});}
}
