import { putStoredFile, saveActivityFile } from "@/lib/file-storage";
import { assertStorageWritable } from "@/lib/google-bridge";
import { assertActivityAccess, ensureViewer } from "@/lib/data";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

export async function POST(request: Request) {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    await assertStorageWritable();
    const form = await request.formData();
    const file = form.get("file");
    const activityId = Number(form.get("activityId"));
    if (!(file instanceof File)) throw new Error("파일을 선택하세요.");
    if (!Number.isInteger(activityId) || activityId < 1) throw new Error("활동 정보가 올바르지 않습니다.");
    if (file.size > MAX_FILE_SIZE) throw new Error("파일은 10MB 이하만 업로드할 수 있습니다.");
    if (!ALLOWED_TYPES.has(file.type)) throw new Error("PDF, DOCX, TXT, PNG, JPG 파일만 업로드할 수 있습니다.");
    await assertActivityAccess(viewer, activityId);

    const safeName = file.name.replace(/[^0-9A-Za-z가-힣._-]/g, "_").slice(-120);
    const objectKey = `activities/${activityId}/${crypto.randomUUID()}-${safeName}`;
    await putStoredFile({ objectKey, originalName: file.name, contentType: file.type, sizeBytes: file.size }, await file.arrayBuffer());
    const stored = await saveActivityFile(viewer, {
      activityId,
      ownerUserId: viewer.id,
      objectKey,
      originalName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    return Response.json({ file: stored }, { status: 201 });
  } catch (error) {
    console.error("upload POST", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: error instanceof Error ? error.message : "업로드하지 못했습니다." }, { status: 400 });
  }
}
