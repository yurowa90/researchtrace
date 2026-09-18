import { ensureViewer } from "@/lib/data";
import { getTeacherReport, performTeacherAction, TeacherAccessError } from "@/lib/teacher-data";
import { SharedStorageSetupError } from "@/lib/google-bridge";
import { SiteAccessError } from "@/lib/site-runtime";
import { rejectCrossSiteWrite } from "@/lib/request-guard";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
function failure(error:unknown) {
  if(error instanceof SharedStorageSetupError) return Response.json({state:"setup",error:error.message},{status:503,headers});
  if(error instanceof TeacherAccessError||error instanceof SiteAccessError) return Response.json({state:"forbidden",error:error.message},{status:403,headers});
  const message=error instanceof Error?error.message:"";
  console.error("teacher request",error instanceof Error?error.name:"UnknownError");
  return Response.json({error:message&&!/Failed query|D1_ERROR|SQLITE_|constraint|\bSELECT\b|\bINSERT\b/i.test(message)?message:"자료를 처리하지 못했습니다. 다시 불러온 뒤 확인하세요."},{status:400,headers});
}
export async function GET() {
  try {
    const viewer=await ensureViewer();
    if(!viewer) return Response.json({state:"login",error:"로그인이 필요합니다."},{status:401,headers});
    if(viewer.status==="pending") return Response.json({state:"pending",displayName:viewer.displayName},{headers});
    return Response.json(await getTeacherReport(viewer),{headers});
  } catch(error) {return failure(error);}
}
export async function POST(request:Request) {
  const rejected=rejectCrossSiteWrite(request);if(rejected)return rejected;
  try {
    const viewer=await ensureViewer();
    if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    return Response.json(await performTeacherAction(viewer,await request.json()),{headers});
  } catch(error) {return failure(error);}
}
