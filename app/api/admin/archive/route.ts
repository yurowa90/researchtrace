import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profileSnapshots } from "@/db/schema";
import { ensureViewer } from "@/lib/data";
import { AdminAccessError,currentAdmin } from "@/lib/admin-data";
import { SiteAccessError } from "@/lib/site-runtime";
import { profileImportSchema } from "@/lib/profile-import";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  try{const viewer=await ensureViewer();if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    const {state}=await currentAdmin(viewer),params=new URL(request.url).searchParams,id=Number(params.get("snapshotId"));
    if(!Number.isSafeInteger(id)||id<1)throw new Error("분석 버전을 선택하세요.");
    const row=state?state.tables.profileSnapshots.find(p=>p.id===id):(await getDb().select().from(profileSnapshots).where(eq(profileSnapshots.id,id)).limit(1))[0];
    if(!row)throw new Error("분석 버전을 찾을 수 없습니다.");
    if(params.get("download")==="1")return new Response(row.rawJson,{headers:{...headers,"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="trace-analysis-${id}.json"`}});
    let profile=null;try{const parsed=profileImportSchema.safeParse(JSON.parse(row.rawJson));if(parsed.success)profile=parsed.data;}catch{/* Metadata remains readable for an older incompatible version. */}
    return Response.json({snapshotId:row.id,studentId:row.studentId,profile,warning:profile?null:"이전 형식으로 저장된 분석입니다. 버전 요약을 확인하거나 보존된 JSON을 내려받으세요."},{headers});
  }catch(e){const message=e instanceof Error?e.message:"";return Response.json({error:message&&!/SQLITE|D1_ERROR|Failed query/i.test(message)?message:"보관 분석을 열지 못했습니다."},{status:e instanceof AdminAccessError||e instanceof SiteAccessError?403:400,headers});}
}
