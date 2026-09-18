import { env } from "cloudflare:workers";
import type { SchoolRows } from "@/lib/school-tables";
import { readLegacySchoolTables } from "@/lib/school-snapshot";
export { schoolDigestInput } from "@/lib/school-data-digest";
import { bridgeCall, sha256, toBase64, type StorageConnection } from "@/lib/google-bridge";

export async function legacySchoolRows(): Promise<SchoolRows> {
  return readLegacySchoolTables();
}
export function legacyFiles(tables: SchoolRows) {
  return [...tables.studentRecords,...tables.referenceMaterials,...tables.activityFiles].sort((a,b)=>a.objectKey.localeCompare(b.objectKey));
}
export async function copyLegacyFile(index: number, connection: StorageConnection) {
  const files=legacyFiles(await legacySchoolRows()), row=files[index];
  if(!row) throw new Error("복사할 파일을 찾을 수 없습니다.");
  if(!env.BUCKET) throw new Error("기존 파일 저장소를 사용할 수 없습니다.");
  const original=await env.BUCKET.get(row.objectKey);
  if(!original) throw new Error("기존 원본이 없습니다. 원본 상태를 확인하세요.");
  const bytes=new Uint8Array(await original.arrayBuffer());
  if(bytes.length!==row.sizeBytes) throw new Error("기존 원본의 크기가 등록 내용과 다릅니다.");
  const hash=await sha256(bytes);
  const copied=await bridgeCall<{sha256:string;sizeBytes:number}>("putFile",{objectKey:row.objectKey,originalName:row.originalName,contentType:row.contentType,sizeBytes:bytes.length,sha256:hash,base64:toBase64(bytes)},connection);
  if(copied.sha256!==hash||copied.sizeBytes!==bytes.length) throw new Error("복사한 원본의 검증에 실패했습니다.");
  return {completed:index+1,total:files.length};
}
