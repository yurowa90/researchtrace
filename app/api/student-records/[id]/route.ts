import { getStoredFile } from "@/lib/file-storage";
import { assertStudentRecordAccess, ensureViewer } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const { id } = await context.params;
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId < 1) throw new Error("학생부 원본 정보가 올바르지 않습니다.");
    const record = await assertStudentRecordAccess(viewer, recordId);
    const object = await getStoredFile(record.objectKey);
    if (!object) return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    const inline = new URL(_request.url).searchParams.get("inline") === "1" && /\.pdf$/i.test(record.originalName);
    return new Response(object.body, {
      headers: {
        "Content-Type": inline ? "application/pdf" : record.contentType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("student-records GET", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: error instanceof Error ? error.message : "파일을 열 수 없습니다." }, { status: 400 });
  }
}
