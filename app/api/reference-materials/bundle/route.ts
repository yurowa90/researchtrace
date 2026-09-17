import { getStoredFile, headStoredFile } from "@/lib/file-storage";
import { ensureViewer } from "@/lib/data";
import { getReferenceGuidance, getReferenceLibrary, getReferenceRows } from "@/lib/reference-library";
import { MAX_REFERENCE_SELECTION, referenceContextText, referenceFileName, referenceKey, referenceManifest, referenceRoleAllowed } from "@/lib/reference-materials";
import { streamZip, zipText, type ZipEntry } from "@/lib/zip-stream";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (!referenceRoleAllowed(viewer)) return Response.json({ error: "교사 또는 관리자만 자료 묶음을 받을 수 있습니다." }, { status: 403 });
    const library = await getReferenceLibrary(viewer);
    const input = new URL(request.url).searchParams.get("ids");
    const ids = input === null ? library.selectedReferenceMaterialIds : input.split(",").map(Number);
    if (!ids.length || ids.length > MAX_REFERENCE_SELECTION || ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) throw new Error("받을 자료를 1~20건 선택하세요.");
    const rows = await getReferenceRows(viewer, ids);
    if (rows.length !== ids.length || rows.some((row) => row.status !== "active")) throw new Error("선택 자료가 없거나 보관 처리되었습니다. 목록을 다시 확인하세요.");
    if (rows.reduce((total, row) => total + row.sizeBytes, 0) > 100 * 1024 * 1024) throw new Error("묶음은 100MB 이하로 나누어 받으세요.");
    rows.sort((a, b) => a.id - b.id);
    for (const row of rows) if (!(await headStoredFile(row.objectKey))) throw new Error(`${referenceKey(row.id)} 파일이 없어 묶음을 만들 수 없습니다.`);
    const guidance=await getReferenceGuidance(viewer);
    const files: ZipEntry[] = rows.map((row) => ({ name: referenceFileName(row), size: row.sizeBytes, open: async () => {
      const file = await getStoredFile(row.objectKey); if (!file) throw new Error("자료 파일을 읽지 못했습니다."); return file.body;
    } }));
    files.push(zipText("reference-manifest.json", JSON.stringify(referenceManifest(rows,guidance), null, 2)));
    files.push(zipText("Work-공통자료-읽기.txt", referenceContextText(rows,guidance)));
    return new Response(streamZip(files), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="trace-reference-materials.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "자료 묶음을 만들지 못했습니다." }, { status: 400 }); }
}
