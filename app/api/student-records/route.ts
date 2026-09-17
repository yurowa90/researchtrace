import { putStoredFile, saveRecord } from "@/lib/file-storage";
import { assertStorageWritable, sha256 } from "@/lib/google-bridge";
import { assertStudentAccess, ensureViewer } from "@/lib/data";
import { validateRecordCoverage } from "@/lib/record-coverage";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "hwp", "hwpx", "docx"]);

export async function POST(request: Request) {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (viewer.role !== "teacher" && viewer.role !== "admin") throw new Error("교사 또는 관리자만 학생부를 업로드할 수 있습니다.");
    await assertStorageWritable();
    const form = await request.formData();
    const file = form.get("file");
    const studentId = Number(form.get("studentId"));
    const recordGrade = Number(form.get("recordGrade"));
    const schoolYear = Number(form.get("schoolYear"));
    if (!(file instanceof File)) throw new Error("학생부 파일을 선택하세요.");
    if (!Number.isInteger(studentId) || studentId < 1) throw new Error("학생 정보가 올바르지 않습니다.");
    if (!Number.isInteger(schoolYear) || schoolYear < 2022 || schoolYear > 2100) throw new Error("학년도를 확인하세요.");
    const { classroom } = await assertStudentAccess(viewer, studentId);
    let rawCoverage: unknown = [{ grade: recordGrade, schoolYear }];
    const coverageInput = form.get("coverage");
    if (typeof coverageInput === "string") {
      if (coverageInput.length > 1000) throw new Error("포함 학년 정보를 확인하세요.");
      try { rawCoverage = JSON.parse(coverageInput); } catch { throw new Error("포함 학년 정보를 확인하세요."); }
    }
    const coverage = validateRecordCoverage(rawCoverage, classroom.grade);
    const latest = coverage[coverage.length - 1];
    if (file.size === 0 || file.size > MAX_FILE_SIZE) throw new Error("빈 파일을 제외한 20MB 이하 파일만 업로드할 수 있습니다.");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("PDF, HWP, HWPX, DOCX 파일만 업로드할 수 있습니다.");

    const bytes=await file.arrayBuffer();
    const hash=await sha256(new Uint8Array(bytes));
    const rangeHash=await sha256(new TextEncoder().encode(JSON.stringify(coverage)));
    const objectKey = `student-records/${studentId}/${rangeHash}-${hash}`;
    await putStoredFile({ objectKey, originalName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }, bytes);
    let stored;
    try { stored = await saveRecord(viewer, {
      studentId,
      ownerUserId: viewer.id,
      schoolYear: latest.schoolYear,
      recordGrade: latest.grade,
      coverageJson: JSON.stringify(coverage),
      objectKey,
      originalName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      processingStatus: "source_only",
    }); } catch (error) {
      // Immutable content key may already be referenced by a concurrent successful retry.
      throw error;
    }
    return Response.json({ record: stored }, { status: 201 });
  } catch (error) {
    console.error("student-records POST", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: error instanceof Error ? error.message : "업로드하지 못했습니다." }, { status: 400 });
  }
}
