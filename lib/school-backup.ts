import { tableColumns, tableNames, type SchoolRows } from "@/lib/school-tables";
import type { SchoolSnapshot } from "@/lib/school-snapshot";
import { streamZip, zipText, type ZipEntry } from "@/lib/zip-stream";

export const SCHOOL_BACKUP_FORMAT = "trace-school-backup-v1";
export const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
type FileReader = (key: string) => Promise<{ size: number; body: ReadableStream<Uint8Array> } | null>;
export type BackupManifest = {
  format: typeof SCHOOL_BACKUP_FORMAT;
  capturedAt: string;
  storage: "legacy" | "google";
  revision: number | null;
  dataFile: { name: string; sizeBytes: number; sha256: string };
  tableCounts: Record<string, number>;
  files: Array<{ name: string; objectKey: string; originalName: string; sizeBytes: number; sha256: string }>;
};
export async function digestBytes(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
}
export function backupFiles(tables: SchoolRows) {
  const files = new Map<string, { objectKey: string; originalName: string; sizeBytes: number }>();
  for (const row of [...tables.studentRecords, ...tables.referenceMaterials, ...tables.activityFiles]) {
    const prior = files.get(row.objectKey);
    if (prior && prior.sizeBytes !== row.sizeBytes) throw new Error("같은 원본 파일의 크기 정보가 충돌합니다. 자료 점검을 먼저 실행하세요.");
    if (!row.objectKey || !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0) throw new Error("원본 파일 정보를 확인하세요.");
    files.set(row.objectKey, { objectKey: row.objectKey, originalName: row.originalName, sizeBytes: row.sizeBytes });
  }
  return [...files.values()].sort((a, b) => a.objectKey.localeCompare(b.objectKey));
}

export async function makeSchoolBackup(snapshot: SchoolSnapshot, readFile: FileReader) {
  // Re-project every row as well as tables. Unknown settings and connection keys
  // cannot enter the exported data, even if a caller passes extra properties.
  const tables = Object.fromEntries(tableNames.map(name => [name, snapshot.tables[name].map(row => Object.fromEntries(tableColumns[name].map(key => [key, (row as Record<string, unknown>)[key] ?? null])))]));
  const text = JSON.stringify({ format: SCHOOL_BACKUP_FORMAT, capturedAt: snapshot.capturedAt, storage: snapshot.storage, revision: snapshot.revision, columns: tableColumns, tables });
  const bytes = new TextEncoder().encode(text), files = backupFiles(snapshot.tables);
  if (bytes.length + files.reduce((sum, file) => sum + file.sizeBytes, 0) > MAX_BACKUP_BYTES) throw new Error("전체 백업은 250MB까지 지원합니다. 원본과 데이터를 나누어 보관할 수 있도록 관리자에게 요청하세요.");
  const manifest: BackupManifest = { format: SCHOOL_BACKUP_FORMAT, capturedAt: snapshot.capturedAt, storage: snapshot.storage, revision: snapshot.revision, tableCounts: Object.fromEntries(tableNames.map(name => [name, snapshot.tables[name].length])), dataFile: { name: "school-data.json", sizeBytes: bytes.length, sha256: await digestBytes(bytes) }, files: [] };
  const entries: ZipEntry[] = [zipText(manifest.dataFile.name, text)];
  for (const [index, file] of files.entries()) {
    const stored = await readFile(file.objectKey);
    if (!stored || stored.size !== file.sizeBytes) throw new Error(`원본 ${index + 1}의 존재 또는 크기를 확인하지 못해 백업을 중단했습니다.`);
    const content = new Uint8Array(await new Response(stored.body).arrayBuffer());
    if (content.length !== file.sizeBytes) throw new Error("원본을 끝까지 읽지 못해 백업을 중단했습니다.");
    const name = `original-${String(index + 1).padStart(5, "0")}${/\.[a-z0-9]{1,8}$/i.exec(file.originalName)?.[0] ?? ".bin"}`;
    const hash = await digestBytes(content);
    manifest.files.push({ ...file, name, sha256: hash });
    // Original object keys are immutable. Re-check during streaming as well, so
    // an unexpected overwrite cannot silently produce a successful archive.
    entries.push({ name, size: file.sizeBytes, open: async () => {
      const current = await readFile(file.objectKey);
      if (!current || current.size !== file.sizeBytes) throw new Error("백업 도중 원본 파일이 변경되었습니다.");
      const currentBytes = new Uint8Array(await new Response(current.body).arrayBuffer());
      if (currentBytes.length !== file.sizeBytes || await digestBytes(currentBytes) !== hash) throw new Error("백업 도중 원본 내용이 변경되었습니다.");
      return new Blob([currentBytes]).stream();
    } });
  }
  entries.push(zipText("manifest.json", JSON.stringify(manifest)));
  entries.push(zipText("백업-안내.txt", "TRACE 전체 자료 백업\n학교 데이터와 모든 등록 원본의 사본을 포함합니다. 연결 비밀키는 제외합니다.\n학교 설정의 ‘백업 파일 검증’에서 ZIP 파일을 선택하면 데이터·원본의 해시와 개수를 검사합니다. 파일은 검증 과정에서 서버에 업로드되지 않습니다.\n이 파일에는 학생 개인정보가 포함됩니다. 승인된 비공개 보관 위치에서 관리하세요.\n자동 복원은 제공하지 않습니다. 복원할 때는 연결 설정을 별도로 구성하고 동일한 내부 ID·관계를 유지해야 합니다.\n"));
  return { manifest, stream: streamZip(entries) };
}
