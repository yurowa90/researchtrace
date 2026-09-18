import { ensureViewer } from "@/lib/data";
import { AdminAccessError, getAdminReport, performAdminAction } from "@/lib/admin-data";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { rejectCrossSiteWrite } from "@/lib/request-guard";
import { SiteAccessError } from "@/lib/site-runtime";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" };
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  console.error("admin request", error instanceof Error ? error.name : "UnknownError");
  return Response.json({error:message && !/Failed query|D1_ERROR|SQLITE_|constraint|\bSELECT\b|\bINSERT\b/i.test(message) ? message : "관리 자료를 처리하지 못했습니다. 다시 불러온 뒤 확인하세요."}, {status:error instanceof AdminAccessError||error instanceof SiteAccessError?403:400,headers});
}
export async function GET() {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    if (!isSchoolAdmin(viewer)) throw new AdminAccessError();
    return Response.json(await getAdminReport(viewer),{headers});
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  const rejected = rejectCrossSiteWrite(request); if (rejected) return rejected;
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
    if (!isSchoolAdmin(viewer)) throw new AdminAccessError();
    return Response.json(await performAdminAction(viewer,await request.json()),{headers});
  } catch(error) { return failure(error); }
}
