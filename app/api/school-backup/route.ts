import { ensureViewer } from "@/lib/data";
import { getStoredFile } from "@/lib/file-storage";
import { readSchoolSnapshot } from "@/lib/school-snapshot";
import { makeSchoolBackup } from "@/lib/school-backup";
import { isSchoolAdmin } from "@/lib/school-permissions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET() {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers });
    if (!isSchoolAdmin(viewer)) return Response.json({ error: "승인된 학교 관리자만 전체 자료를 백업할 수 있습니다." }, { status: 403, headers });
    const backup = await makeSchoolBackup(await readSchoolSnapshot(), getStoredFile);
    return new Response(backup.stream, { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="TRACE-school-backup-${backup.manifest.capturedAt.replace(/[:.]/g, "-")}.zip"` } });
  } catch (error) {
    console.error("school backup", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: error instanceof Error ? error.message : "전체 백업을 만들지 못했습니다." }, { status: 400, headers });
  }
}
