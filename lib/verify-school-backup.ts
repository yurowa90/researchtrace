const decoder = new TextDecoder();
const format = "trace-school-backup-v1";
async function hash(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join(""); }
export async function verifySchoolBackup(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) throw new Error("백업 검증에는 보안 연결이 필요합니다. HTTPS 주소로 사이트를 열고 다시 시도하세요.");
  if (bytes.length < 22 || bytes.length > 251 * 1024 * 1024) throw new Error("TRACE 백업 ZIP 파일의 크기를 확인하세요.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 22;
  const need = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  need(view.getUint32(end, true) === 0x06054b50 && view.getUint16(end + 20, true) === 0, "완전한 TRACE 백업 ZIP 파일이 아닙니다.");
  const count = view.getUint16(end + 10, true), directory = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true);
  need(count > 0 && directory + size === end, "ZIP 파일의 목록이 손상되었습니다.");
  const entries = new Map<string, Uint8Array>(); let cursor = directory;
  for (let i = 0; i < count; i++) {
    need(cursor + 46 <= end && view.getUint32(cursor, true) === 0x02014b50, "ZIP 항목 정보가 손상되었습니다.");
    const length = view.getUint32(cursor + 24, true), nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true), start = view.getUint32(cursor + 42, true);
    need(view.getUint16(cursor + 10, true) === 0 && view.getUint32(cursor + 20, true) === length, "TRACE에서 받은 원본 ZIP 파일을 선택하세요.");
    need(cursor + 46 + nameLength + extra + comment <= end && start + 30 <= directory, "ZIP 항목의 범위가 올바르지 않습니다.");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength), name = decoder.decode(nameBytes);
    need(Boolean(name) && !/[\\/\x00]/.test(name) && !name.includes("..") && !entries.has(name), "ZIP 항목 이름이 중복되거나 올바르지 않습니다.");
    need(view.getUint32(start, true) === 0x04034b50 && view.getUint16(start + 8, true) === 0, "ZIP 본문이 손상되었습니다.");
    const localNameLength = view.getUint16(start + 26, true), body = start + 30 + localNameLength + view.getUint16(start + 28, true);
    need(body + length <= directory && decoder.decode(bytes.subarray(start + 30, start + 30 + localNameLength)) === name, "ZIP 항목 이름 또는 본문 범위가 다릅니다.");
    entries.set(name, bytes.subarray(body, body + length)); cursor += 46 + nameLength + extra + comment;
  }
  need(cursor === end, "ZIP 목록의 길이가 다릅니다.");
  const rawManifest = entries.get("manifest.json");
  need(Boolean(rawManifest) && rawManifest!.length < 5 * 1024 * 1024, "백업 검증 목록을 찾을 수 없습니다.");
  const manifest = JSON.parse(decoder.decode(rawManifest));
  need(manifest.format === format && Array.isArray(manifest.files) && manifest.dataFile?.name === "school-data.json", "지원하는 TRACE 백업 형식이 아닙니다.");
  const data = entries.get(manifest.dataFile.name);
  need(Boolean(data) && data!.length === manifest.dataFile.sizeBytes && await hash(data!) === manifest.dataFile.sha256, "학교 데이터 파일의 크기 또는 해시가 다릅니다.");
  const parsed = JSON.parse(decoder.decode(data));
  need(parsed.format === format && parsed.tables && parsed.capturedAt === manifest.capturedAt && parsed.storage === manifest.storage && parsed.revision === manifest.revision, "백업 기준 정보가 다릅니다.");
  need(!Object.hasOwn(parsed.tables, "storageConnection") && !Object.hasOwn(parsed.tables, "storage_connection"), "백업에 연결 설정이 포함되어 있습니다.");
  const counts = Object.entries(manifest.tableCounts ?? {}) as Array<[string, number]>;
  need(counts.length > 0 && counts.length === Object.keys(parsed.tables).length, "백업 테이블 목록이 다릅니다.");
  for (const [table, n] of counts) need(Array.isArray(parsed.tables[table]) && parsed.tables[table].length === n, "백업 테이블의 행 수가 다릅니다.");
  const expectedFiles = new Map<string, number>();
  for (const table of ["studentRecords", "referenceMaterials", "activityFiles"]) {
    need(Array.isArray(parsed.tables[table]), "원본 파일 목록 테이블이 없습니다.");
    for (const row of parsed.tables[table]) { need(!expectedFiles.has(row.objectKey) || expectedFiles.get(row.objectKey) === row.sizeBytes, "원본 파일 정보가 충돌합니다."); expectedFiles.set(row.objectKey, row.sizeBytes); }
  }
  const seen = new Set<string>(), names = new Set<string>();
  for (const file of manifest.files) {
    need(typeof file.name === "string" && file.name.startsWith("original-") && !names.has(file.name) && !seen.has(file.objectKey) && expectedFiles.get(file.objectKey) === file.sizeBytes, "원본 파일 목록이 중복되거나 학교 데이터와 다릅니다.");
    const content = entries.get(file.name);
    need(Boolean(content) && content!.length === file.sizeBytes && await hash(content!) === file.sha256, "원본 파일의 크기 또는 해시가 다릅니다.");
    seen.add(file.objectKey); names.add(file.name);
  }
  need(seen.size === expectedFiles.size, "백업에서 빠진 원본 파일이 있습니다.");
  return { capturedAt: String(manifest.capturedAt), storage: String(manifest.storage), tableCount: counts.length, rowCount: counts.reduce((n, [, count]) => n + count, 0), fileCount: seen.size, dataSha256: String(manifest.dataFile.sha256) };
}
