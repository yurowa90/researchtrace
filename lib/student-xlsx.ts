import { validateStudentRows, MAX_STUDENTS, type BulkStudentRow } from "@/lib/student-registration";
export type { BulkStudentRow } from "@/lib/student-registration";

export type StudentWorkbookResult = {
  rows: BulkStudentRow[];
  issues: string[];
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ENTRY_SIZE = 20 * 1024 * 1024;

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function zipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.length - 65_557);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("정상적인 XLSX 파일이 아닙니다.");

  const totalEntries = readUint16(view, end + 10);
  const directoryOffset = readUint32(view, end + 16);
  if (totalEntries > 2_000 || directoryOffset >= bytes.length) {
    throw new Error("엑셀 파일 구조가 너무 크거나 올바르지 않습니다.");
  }

  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let offset = directoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) throw new Error("XLSX 파일 목록을 읽을 수 없습니다.");
    const method = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (uncompressedSize > MAX_ENTRY_SIZE) throw new Error("엑셀 내부 파일이 너무 큽니다.");
    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return { entries, view };
}

async function readZipText(bytes: Uint8Array, entries: Map<string, ZipEntry>, view: DataView, name: string) {
  const entry = entries.get(name);
  if (!entry) return null;
  if (readUint32(view, entry.localOffset) !== 0x04034b50) throw new Error("XLSX 내부 파일을 읽을 수 없습니다.");
  const nameLength = readUint16(view, entry.localOffset + 26);
  const extraLength = readUint16(view, entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(start, start + entry.compressedSize);
  let output: Uint8Array;
  if (entry.method === 0) {
    output = compressed;
  } else if (entry.method === 8) {
    const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat)).getReader();
    const pieces: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_ENTRY_SIZE) { await reader.cancel(); throw new Error("엑셀 내부 파일이 너무 큽니다."); }
      pieces.push(value);
    }
    output = new Uint8Array(size);
    let position = 0;
    for (const piece of pieces) { output.set(piece, position); position += piece.length; }
  } else {
    throw new Error("지원하지 않는 XLSX 압축 방식입니다.");
  }
  if (output.length > MAX_ENTRY_SIZE) throw new Error("엑셀 내부 파일이 너무 큽니다.");
  return new TextDecoder().decode(output);
}

function parseXml(value: string, label: string) {
  const document = new DOMParser().parseFromString(value, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error(`${label}을(를) 읽을 수 없습니다.`);
  return document;
}

function normalizedTarget(target: string) {
  if (target.startsWith("/")) return target.slice(1);
  return new URL(target, "https://xlsx.local/xl/workbook.xml").pathname.slice(1);
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function cellText(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return Array.from(cell.getElementsByTagNameNS("*", "t")).map((node) => node.textContent ?? "").join("");
  }
  const raw = cell.getElementsByTagNameNS("*", "v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

function worksheetRows(document: Document, sharedStrings: string[]) {
  return Array.from(document.getElementsByTagNameNS("*", "row")).map((row, index) => {
    const rowNumber = Number(row.getAttribute("r")) || index + 1;
    const values: string[] = [];
    for (const cell of Array.from(row.getElementsByTagNameNS("*", "c"))) {
      const position = columnIndex(cell.getAttribute("r") ?? "");
      if (position >= 0 && position < 30) values[position] = cellText(cell, sharedStrings).trim();
    }
    return { rowNumber, values };
  });
}

export async function parseStudentWorkbook(file: File): Promise<StudentWorkbookResult> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error(".xlsx 형식의 엑셀 파일을 선택하세요.");
  if (file.size > MAX_FILE_SIZE) throw new Error("엑셀 파일은 5MB 이하만 업로드할 수 있습니다.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { entries, view } = zipEntries(bytes);
  const workbookText = await readZipText(bytes, entries, view, "xl/workbook.xml");
  const relationshipsText = await readZipText(bytes, entries, view, "xl/_rels/workbook.xml.rels");
  if (!workbookText || !relationshipsText) throw new Error("XLSX 통합문서 정보를 찾을 수 없습니다.");

  const workbook = parseXml(workbookText, "통합문서");
  const relationships = parseXml(relationshipsText, "통합문서 연결 정보");
  const sheet = Array.from(workbook.getElementsByTagNameNS("*", "sheet")).find((item) => item.getAttribute("name") === "학생등록");
  if (!sheet) throw new Error("‘학생등록’ 시트가 없습니다. 내려받은 양식을 그대로 사용하세요.");
  const relationId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const relationship = Array.from(relationships.getElementsByTagNameNS("*", "Relationship")).find((item) => item.getAttribute("Id") === relationId);
  const target = relationship?.getAttribute("Target");
  if (!target || relationship?.getAttribute("TargetMode") === "External") throw new Error("학생등록 시트 연결 정보가 올바르지 않습니다.");

  const worksheetText = await readZipText(bytes, entries, view, normalizedTarget(target));
  if (!worksheetText) throw new Error("학생등록 시트를 찾을 수 없습니다.");
  const sharedText = await readZipText(bytes, entries, view, "xl/sharedStrings.xml");
  const sharedStrings = sharedText
    ? Array.from(parseXml(sharedText, "공유 문자열").getElementsByTagNameNS("*", "si")).map((item) => Array.from(item.getElementsByTagNameNS("*", "t")).map((node) => node.textContent ?? "").join(""))
    : [];
  const rows = worksheetRows(parseXml(worksheetText, "학생등록 시트"), sharedStrings);
  const header = rows.find((item) => item.rowNumber === 1)?.values ?? [];
  const expected = ["학번", "이름", "이메일"];
  if (expected.some((value, index) => header[index]?.replace(/^\uFEFF/, "") !== value)) {
    throw new Error("1행 머리글은 ‘학번, 이름, 이메일’ 순서여야 합니다.");
  }

  const dataRows = rows
    .filter((item) => item.rowNumber > 1)
    .map((item) => ({
      rowNumber: item.rowNumber,
      studentNumber: item.values[0]?.trim() ?? "",
      name: item.values[1]?.trim() ?? "",
      email: item.values[2]?.trim().toLowerCase() ?? "",
    }))
    .filter((item) => item.studentNumber || item.name || item.email);
  if (dataRows.length > MAX_STUDENTS) throw new Error(`한 번에 최대 ${MAX_STUDENTS}명까지 등록할 수 있습니다. 파일을 나누어 올리세요.`);
  return { rows: dataRows, issues: validateStudentRows(dataRows).map((issue) => `${issue.rowNumber ? `${issue.rowNumber}행: ` : ""}${issue.message}`) };
}
