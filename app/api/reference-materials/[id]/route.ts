import { getStoredFile } from "@/lib/file-storage";
import { getReferenceRows } from "@/lib/reference-library";
import { ensureViewer } from "@/lib/data";
import { referenceRoleAllowed } from "@/lib/reference-materials";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (!referenceRoleAllowed(viewer)) return Response.json({ error: "교사 또는 관리자만 공용 자료를 받을 수 있습니다." }, { status: 403 });
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("자료 번호를 확인하세요.");
    const [material] = await getReferenceRows(viewer, [id]);
    if (!material) return Response.json({ error: "자료를 찾을 수 없습니다." }, { status: 404 });
    const file = await getStoredFile(material.objectKey);
    if (!file) return Response.json({ error: "자료 파일을 찾을 수 없습니다." }, { status: 404 });
    return new Response(file.body, { headers: { "Content-Type": material.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`LIB-${material.id}-${material.originalName}`)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "자료를 내려받지 못했습니다." }, { status: 400 }); }
}
