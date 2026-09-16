export type BulkStudentRow = { rowNumber: number; studentNumber: string; name: string; email: string };
export type RegistrationIssue = { rowNumber?: number; field?: "studentNumber" | "name" | "email"; message: string };
export const MAX_STUDENTS = 300;

export function normalizeStudentRow(row: BulkStudentRow): BulkStudentRow {
  return { ...row, studentNumber: row.studentNumber.trim(), name: row.name.trim(), email: row.email.trim().toLowerCase() };
}

export function validateStudentRows(rows: BulkStudentRow[], existing: Array<{ classId: number; studentNumber: string; email: string | null }> = [], classId?: number): RegistrationIssue[] {
  const issues: RegistrationIssue[] = [];
  if (!rows.length) issues.push({ message: "등록할 학생이 없습니다. 학생 정보를 입력하세요." });
  if (rows.length > MAX_STUDENTS) issues.push({ message: `한 번에 최대 ${MAX_STUDENTS}명까지 등록할 수 있습니다. 파일을 나누어 올리세요.` });
  const numbers = new Map<string, number>();
  const emails = new Map<string, number>();
  const existingNumbers = new Set(existing.filter((student) => student.classId === classId).map((student) => student.studentNumber));
  const existingEmails = new Set(existing.flatMap((student) => student.email ? [student.email.toLowerCase()] : []));
  for (const source of rows) {
    const row = normalizeStudentRow(source);
    const add = (field: RegistrationIssue["field"], message: string) => issues.push({ rowNumber: row.rowNumber, field, message });
    if (!row.studentNumber) add("studentNumber", "학번을 입력하세요.");
    else if (row.studentNumber.length > 30) add("studentNumber", "학번은 30자 이하여야 합니다.");
    else if (numbers.has(row.studentNumber)) add("studentNumber", `${numbers.get(row.studentNumber)}행과 학번이 중복됩니다.`);
    else if (existingNumbers.has(row.studentNumber)) add("studentNumber", "선택한 학급에 이미 등록된 학번입니다.");
    if (row.studentNumber) numbers.set(row.studentNumber, numbers.get(row.studentNumber) ?? row.rowNumber);
    if (!row.name) add("name", "이름을 입력하세요.");
    else if (row.name.length > 80) add("name", "이름은 80자 이하여야 합니다.");
    if (!row.email) add("email", "이메일을 입력하세요.");
    else if (row.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) add("email", "이메일 형식을 확인하세요.");
    else if (emails.has(row.email)) add("email", `${emails.get(row.email)}행과 이메일이 중복됩니다.`);
    else if (existingEmails.has(row.email)) add("email", "이미 학생에게 등록된 이메일입니다.");
    if (row.email) emails.set(row.email, emails.get(row.email) ?? row.rowNumber);
  }
  return issues;
}

export function parsePastedStudents(text: string): BulkStudentRow[] {
  if (text.length > 500_000) throw new Error("붙여넣은 내용이 너무 큽니다. 최대 300명씩 나누어 입력하세요.");
  const matrix: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (quoted || cell === "") quoted = !quoted;
      else cell += char;
    } else if (!quoted && (char === "\t" || char === "\n")) {
      row.push(cell); cell = "";
      if (char === "\n") { matrix.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("닫히지 않은 따옴표가 있습니다. 엑셀의 세 열을 다시 복사하세요.");
  row.push(cell); matrix.push(row);
  const hasHeader = ["학번", "이름", "이메일"].every((label, index) => matrix[0]?.[index]?.trim() === label);
  const result = matrix.flatMap((cells, index) => {
    if ((hasHeader && index === 0) || cells.every((value) => !value.trim())) return [];
    if (cells.length !== 3) throw new Error(`${index + 1}행: 학번·이름·이메일 세 열만 복사하세요. 열은 탭으로 구분합니다.`);
    return [normalizeStudentRow({ rowNumber: index + 1 + (hasHeader ? 0 : 1), studentNumber: cells[0], name: cells[1], email: cells[2] })];
  });
  if (result.length > MAX_STUDENTS) throw new Error(`한 번에 최대 ${MAX_STUDENTS}명까지 등록할 수 있습니다. 내용을 나누어 붙여넣으세요.`);
  return result;
}
