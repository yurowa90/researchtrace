import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { activityFiles, referenceMaterials, studentRecords } from "@/db/schema";
import { assertStorageWritable, bridgeCall, commitGoogleState, fromBase64, googleEnabled, readGoogleState, sha256, toBase64 } from "@/lib/google-bridge";
import { currentGoogleViewer, googleStudentAccess } from "@/lib/google-school";
import { insertRow } from "@/lib/school-tables";
import type { Viewer } from "@/lib/data";

type FileRow = { originalName: string; contentType: string; sizeBytes: number; objectKey: string };
type BlobResult = { base64: string; sha256: string; sizeBytes: number; contentType: string };
export async function putStoredFile(row: FileRow, bytes: ArrayBuffer) {
  await assertStorageWritable();
  if (await googleEnabled()) {
    const input = new Uint8Array(bytes);
    return bridgeCall("putFile", { ...row, base64: toBase64(input), sha256: await sha256(input) });
  }
  if (!env.BUCKET) throw new Error("파일 저장소를 사용할 수 없습니다.");
  await env.BUCKET.put(row.objectKey, bytes, { httpMetadata: { contentType: row.contentType } });
}
export async function getStoredFile(key: string) {
  if (await googleEnabled()) {
    const file = await bridgeCall<BlobResult>("getFile", { objectKey: key });
    const bytes = fromBase64(file.base64);
    if (bytes.length !== file.sizeBytes || await sha256(bytes) !== file.sha256) throw new Error("원본 파일 검증에 실패했습니다.");
    return { body: new Blob([bytes]).stream(), size: file.sizeBytes };
  }
  if (!env.BUCKET) throw new Error("파일 저장소를 사용할 수 없습니다.");
  const file = await env.BUCKET.get(key); return file ? { body: file.body, size: file.size } : null;
}
export async function headStoredFile(key: string) {
  if (await googleEnabled()) return bridgeCall<{sizeBytes:number;sha256:string}>("headFile",{objectKey:key});
  if (!env.BUCKET) throw new Error("파일 저장소를 사용할 수 없습니다."); return env.BUCKET.head(key);
}
export async function cleanupFailedFile(key: string) {
  // An uncertain Google response could have committed metadata. Retain the private
  // original for recovery instead of deleting a possibly referenced Drive file.
  if (!(await googleEnabled())) await env.BUCKET?.delete(key);
}
export async function saveRecord(viewer: Viewer, values: typeof studentRecords.$inferInsert) {
  await assertStorageWritable();
  if (!(await googleEnabled())) { const [row] = await getDb().insert(studentRecords).values(values).returning(); return row; }
  const state=await readGoogleState(), current=currentGoogleViewer(state,viewer);
  if(current.status!=="approved" || current.role==="student") throw new Error("교사 권한이 필요합니다.");
  googleStudentAccess(state,current,values.studentId);
  const row=insertRow(state,"studentRecords",values); await commitGoogleState(state); return row;
}
export async function saveReference(viewer: Viewer, values: typeof referenceMaterials.$inferInsert) {
  await assertStorageWritable();
  if (!(await googleEnabled())) { const [row]=await getDb().insert(referenceMaterials).values(values).returning();return row; }
  const state=await readGoogleState(), current=currentGoogleViewer(state,viewer);
  if(current.status!=="approved" || current.role!=="admin") throw new Error("관리자 권한이 필요합니다.");
  const row=insertRow(state,"referenceMaterials",values); await commitGoogleState(state); return row;
}
export async function saveActivityFile(viewer: Viewer, values: typeof activityFiles.$inferInsert) {
  await assertStorageWritable();
  if (!(await googleEnabled())) { const [row]=await getDb().insert(activityFiles).values(values).returning();return row; }
  const state=await readGoogleState(), current=currentGoogleViewer(state,viewer);
  const activity=state.tables.activities.find(row=>row.id===values.activityId); if(!activity) throw new Error("활동을 찾을 수 없습니다."); googleStudentAccess(state,current,activity.studentId);
  const row=insertRow(state,"activityFiles",values); await commitGoogleState(state); return row;
}
