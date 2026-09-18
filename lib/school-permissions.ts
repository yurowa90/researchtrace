export type SchoolRole = "student" | "teacher" | "admin";
type Actor = { id: number; role: string; status: string };
type Classroom = { id: number; teacherId: number };
type Student = { classId: number; userId: number | null };
export class StudentLinkConflictError extends Error {
  constructor() { super("계정이 여러 학생에게 연결되어 자료 접근을 중단했습니다. 담임 또는 관리자에게 계정 연결 수정을 요청하세요."); }
}

export function approvedSchoolRole(viewer: Actor | null | undefined): SchoolRole | null {
  if (!viewer || !Number.isSafeInteger(viewer.id) || viewer.id < 1 || viewer.status !== "approved") return null;
  return viewer.role === "student" || viewer.role === "teacher" || viewer.role === "admin" ? viewer.role : null;
}
export function isSchoolAdmin(viewer: Actor | null | undefined) { return approvedSchoolRole(viewer) === "admin"; }
export function isSchoolStaff(viewer: Actor | null | undefined) { const role = approvedSchoolRole(viewer); return role === "admin" || role === "teacher"; }
// Check every link, including archived students, before narrowing by class or status.
export function assertSingleStudentLink(viewer: Actor, linkedCount: number) {
  if (approvedSchoolRole(viewer) === "student" && linkedCount > 1) {
    throw new StudentLinkConflictError();
  }
}
export function canManageSchoolClass(viewer: Actor, classroom: Classroom | null | undefined) {
  const role = approvedSchoolRole(viewer);
  return Boolean(classroom && (role === "admin" || (role === "teacher" && classroom.teacherId === viewer.id)));
}
export function canAccessSchoolStudent(viewer: Actor, student: Student | null | undefined, classroom: Classroom | null | undefined) {
  if (!student || !classroom || student.classId !== classroom.id) return false;
  const role = approvedSchoolRole(viewer);
  return role === "admin" || (role === "teacher" && classroom.teacherId === viewer.id) || (role === "student" && student.userId === viewer.id);
}

export const schoolPermissionMatrix = [
  { feature: "학생부·성적·활동·연구 프로필 열람", student: "본인", teacher: "담당 학급", admin: "학교 전체" },
  { feature: "원본 등록·Work 결과 반영·활성 버전 변경", student: "불가", teacher: "담당 학급", admin: "학교 전체" },
  { feature: "질문·성찰·진학 계획 작성", student: "본인·허용된 기록", teacher: "담당 학급", admin: "학교 전체" },
  { feature: "교사 관찰·피드백·제출 확인", student: "공개된 피드백 열람", teacher: "담당 학급", admin: "학교 전체" },
  { feature: "학생 등록·학생 계정 연결·졸업 처리", student: "불가", teacher: "담당 학급", admin: "학교 전체" },
  { feature: "학급 생성", student: "불가", teacher: "본인 담당 학급", admin: "학교 전체" },
  { feature: "담임 지정·교사 승인·학생 학급 이동", student: "불가", teacher: "불가", admin: "학교 전체" },
  { feature: "공용 평가 자료", student: "본인에게 적용된 점검 결과", teacher: "열람·Work 자료 선택", admin: "등록·판본 승인·선택" },
  { feature: "전체 자료 점검·원본 포함 백업", student: "불가", teacher: "불가", admin: "학교 전체" },
  { feature: "구글 연결·저장소 이전", student: "불가", teacher: "불가", admin: "저장소 소유자인 관리자" },
] as const;
