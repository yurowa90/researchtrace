import { ensureViewer } from "@/lib/data";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { readSchoolSnapshot } from "@/lib/school-snapshot";
import { auditSchoolData } from "@/lib/school-audit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET() {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers });
    if (!isSchoolAdmin(viewer)) return Response.json({ error: "승인된 학교 관리자만 전체 자료를 점검할 수 있습니다." }, { status: 403, headers });
    const { capturedAt, storage, revision, tables } = await readSchoolSnapshot();
    return Response.json({ capturedAt, storage, revision, audit: auditSchoolData(tables) }, { headers });
  } catch (error) {
    console.error("school baseline", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "자료 점검을 마치지 못했습니다. 저장소 연결 상태나 진행 중인 이전 작업을 확인하고 다시 시도하세요." }, { status: 503, headers });
  }
}
