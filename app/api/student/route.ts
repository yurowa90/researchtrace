import { ensureViewer } from "@/lib/data";
import { getStudentReport, getStudentHistory, saveStudentGuidance, StudentAccessError } from "@/lib/student-data";
import { SharedStorageSetupError } from "@/lib/google-bridge";
import { SiteAccessError } from "@/lib/site-runtime";
import { rejectCrossSiteWrite } from "@/lib/request-guard";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
function failure(error:unknown) {
  if(error instanceof SharedStorageSetupError)return Response.json({state:"setup",error:"학교 자료 연결을 준비하고 있습니다. 연결이 완료되면 학생 계정으로 사용할 수 있습니다."},{status:503,headers});
  if(error instanceof StudentAccessError||error instanceof SiteAccessError)return Response.json({state:"forbidden",error:error.message},{status:403,headers});
  const message=error instanceof Error?error.message:"";
  return Response.json({error:message&&!/Failed query|D1_ERROR|SQLITE_|constraint|\bSELECT\b|\bINSERT\b/i.test(message)?message:"자료를 처리하지 못했습니다. 다시 확인해 주세요."},{status:400,headers});
}
export async function GET(request:Request) {
  try {
    const viewer=await ensureViewer();if(!viewer)return Response.json({state:"login",error:"로그인이 필요합니다."},{status:401,headers});
    if(viewer.status==="pending")return Response.json({state:"pending"},{headers});
    const params=new URL(request.url).searchParams,raw=params.get("student"),studentId=raw===null?undefined:Number(raw);
    if(studentId!==undefined&&(!Number.isSafeInteger(studentId)||studentId<1))throw new StudentAccessError();
    const key=params.get("history");
    return Response.json(key!==null?{history:await getStudentHistory(viewer,key,studentId)}:await getStudentReport(viewer,studentId),{headers});
  } catch(error){return failure(error);}
}
export async function POST(request:Request) {
  const rejected=rejectCrossSiteWrite(request);if(rejected)return rejected;
  try {
    const viewer=await ensureViewer();if(!viewer)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    const raw=await request.text();if(raw.length>80000)throw new Error("한 번에 저장할 내용이 너무 큽니다.");
    const body=JSON.parse(raw);if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("입력 내용을 확인하세요.");
    return Response.json(await saveStudentGuidance(viewer,body),{headers});
  } catch(error){return failure(error);}
}
