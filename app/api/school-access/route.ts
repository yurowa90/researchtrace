import { ensureViewer } from "@/lib/data";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { schoolSite } from "@/lib/site-runtime";
import { getStorageConnection, assertStorageWritable, readGoogleState, commitGoogleState } from "@/lib/google-bridge";
import { currentIdentityActor, readLegacyIdentityData, saveLegacyIdentityReview, applyIdentityReview } from "@/lib/school-identities";
import { rejectCrossSiteWrite } from "@/lib/request-guard";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  console.error("school access",error instanceof Error?error.name:"UnknownError");
  return Response.json({error: message && !/Failed query|D1_ERROR|SQLITE_|constraint|SELECT|INSERT|UPDATE/i.test(message) ? message : "계정 연결을 처리하지 못했습니다. 목록을 다시 불러온 뒤 확인하세요."},{status:400,headers});
}
export async function GET() {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    if (!isSchoolAdmin(viewer)) return Response.json({error:"학교 관리자만 연결 현황을 볼 수 있습니다."},{status:403,headers});
    const config=await getStorageConnection(), google=config?.state==="google"?await readGoogleState():null;
    const t=google?.tables??await readLegacyIdentityData();
    if(!isSchoolAdmin(currentIdentityActor(t,viewer))) return Response.json({error:"현재 관리자 권한을 확인하세요."},{status:403,headers});
    return Response.json({site:schoolSite(),storage:config?.state??"legacy",identitySchemaReady:!google?.sourceTables||["schoolIdentities","identityEvents"].every(n=>google.sourceTables!.includes(n)),currentIdentityId:viewer.loginIdentityId??null,
      accounts:t.users.map(({id,displayName,email,role,status})=>({id,displayName,email,role,status})),
      identities:t.schoolIdentities.map(({subject,...row})=>({...row,hasVerifiedSubject:Boolean(subject)})),
      events:[...t.identityEvents].sort((a,b)=>b.id-a.id).slice(0,100),
    },{headers});
  } catch(error) {return failure(error);}
}
export async function POST(request: Request) {
  const rejected=rejectCrossSiteWrite(request);if(rejected)return rejected;
  try {
    const viewer=await ensureViewer();
    if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    if(!isSchoolAdmin(viewer))return Response.json({error:"학교 관리자만 계정을 연결할 수 있습니다."},{status:403,headers});
    await assertStorageWritable();
    const body=await request.json() as Record<string,unknown>;
    if((await getStorageConnection())?.state==="google") {
      const state=await readGoogleState();applyIdentityReview(state,viewer,body);await commitGoogleState(state);
    } else await saveLegacyIdentityReview(viewer,body);
    return Response.json({ok:true},{headers});
  } catch(error) {return failure(error);}
}
