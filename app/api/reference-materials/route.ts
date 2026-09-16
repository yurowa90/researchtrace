import { putStoredFile, saveReference, cleanupFailedFile } from "@/lib/file-storage";
import { assertStorageWritable } from "@/lib/google-bridge";
import { ensureViewer } from "@/lib/data";
import { referenceCategories, referenceRoleAllowed } from "@/lib/reference-materials";

export const dynamic = "force-dynamic";
const extensions = new Set(["pdf", "hwp", "hwpx", "docx", "pptx", "txt", "md"]);

export async function POST(request: Request) {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (!referenceRoleAllowed(viewer, true)) return Response.json({ error: "관리자만 공용 평가 자료를 등록할 수 있습니다." }, { status: 403 });
    await assertStorageWritable();
    const form = await request.formData();
    const value = (key: string, max: number) => {
      const raw = form.get(key); const text = typeof raw === "string" ? raw.trim() : "";
      if (text.length > max) throw new Error(`${key} 입력이 너무 깁니다.`); return text;
    };
    const title = value("title", 300), institution = value("institution", 150), admissionTrack = value("admissionTrack", 150), note = value("note", 2000);
    const category = value("category", 40) as keyof typeof referenceCategories;
    const yearText = value("admissionsYear", 4), admissionsYear = yearText ? Number(yearText) : null;
    if (!title || !Object.hasOwn(referenceCategories, category)) throw new Error("자료 제목과 종류를 확인하세요.");
    if (admissionsYear !== null && (!Number.isInteger(admissionsYear) || admissionsYear < 2022 || admissionsYear > 2100)) throw new Error("모집 학년도를 확인하세요.");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) throw new Error("20MB 이하의 자료 파일을 선택하세요.");
    if (!extensions.has(file.name.split(".").pop()?.toLowerCase() ?? "")) throw new Error("PDF·HWP·HWPX·DOCX·PPTX·TXT·MD 파일을 등록하세요.");
    const bytes = await file.arrayBuffer();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((part) => part.toString(16).padStart(2, "0")).join("");
    const safeName = file.name.replace(/[^0-9A-Za-z가-힣._-]/g, "_").slice(-120);
    const objectKey = `reference-materials/${crypto.randomUUID()}-${safeName}`;
    await putStoredFile({ objectKey, originalName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }, bytes);
    try {
      const material = await saveReference(viewer, { uploadedBy: viewer.id, title, institution, admissionsYear, admissionTrack, category, note, objectKey, originalName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, sha256 });
      return Response.json({ material }, { status: 201 });
    } catch (error) { await cleanupFailedFile(objectKey).catch(() => console.error("reference material cleanup failed")); throw error; }
  } catch (error) {
    console.error("reference material upload failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: error instanceof Error ? error.message : "자료를 등록하지 못했습니다." }, { status: 400 });
  }
}
