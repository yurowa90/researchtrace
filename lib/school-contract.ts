// Shared definitions for the three future sites. This version is independent
// of the Work JSON schema version and does not rewrite existing identifiers.
export const SCHOOL_CONTRACT_VERSION = "1.1";
export const schoolDataContract = [
  { entity: "학생", key: "students.id", rule: "이름·이메일·학번이 바뀌어도 같은 ID를 사용합니다. 학번은 앞자리 0을 보존하는 문자열이며 현재 학급 안에서 중복될 수 없습니다." },
  { entity: "계정", key: "users.id → students.userId", rule: "내부 계정 ID와 학생 ID를 구분합니다. 학생 계정 하나는 학생 한 명에게 연결합니다. 미연결 학생도 자료를 누적할 수 있습니다." },
  { entity: "학급·담임", key: "classes.id / teacherId / schoolYear", rule: "현재 소속은 students.classId, 현재 담당자는 classes.teacherId로 판단합니다. 학급 이동은 학생 ID를 유지하고 enrollment 지도 이력에 남깁니다." },
  { entity: "기록 시점", key: "grade / schoolYear / sourceYears", rule: "학년, 기록의 학년도, 분석에 포함된 학년도를 구분합니다. 2·3학년 모두 원본에 현재 학년 기록이 있으면 분석에 포함합니다." },
  { entity: "원본·분석", key: "studentRecords.id / profileSnapshots.id", rule: "원본 파일과 분석 버전을 각각 식별합니다. 분석 하위 항목은 같은 학생·같은 분석 버전에 속하며 활성 버전은 학생당 하나입니다." },
  { entity: "평가 자료", key: "referenceMaterials.id / admissionsYear", rule: "모집요강의 대입 학년도는 학생부 학년도와 구분합니다. 파일·판본·승인 정보와 학생에게 적용한 기준을 함께 보존합니다." },
  { entity: "사이트 간 로그인", key: "사이트 + 로그인 식별자 → users.id", rule: "세 사이트의 로그인 식별자는 서로 다를 수 있습니다. 별도 로그인 연결 요청을 관리자가 본인 확인 후 승인합니다. 연결 해제 이력을 보존하며 이메일 일치만으로 계정을 자동 병합하지 않습니다." },
] as const;

export const phaseOneInventory = [
  { feature: "학생·학급 관리", current: "학급 생성, 엑셀 일괄 등록·오류 확인, 학생 계정 연결, 담임 지정", next: "세 사이트의 공통 관리 API로 연결" },
  { feature: "학생부·분석 누적", current: "원본 등록, 포함 학년 지정, Work JSON 반영, 버전 이력·비교", next: "현재 데이터와 ID를 유지해 각 사이트에 표시" },
  { feature: "교과·활동 검토", current: "성적 꺾은선, 과목선택·학점, 활동별 목차, 원본 근거 연결", next: "교사 화면과 학생 화면으로 메뉴 분리" },
  { feature: "연구 프로필", current: "키워드·연구지문, 탐구 흐름, 온톨로지, LLM 위키", next: "Work에서 만든 결과를 공통 저장소로 가져오는 방식 유지" },
  { feature: "진학·지도", current: "공용 모집요강·판본, 과목 계획·기준 점검, 질문·성찰·교사 피드백", next: "학생 제출과 교사 확인 흐름을 각 사이트에 배치" },
  { feature: "진급·졸업", current: "학생 ID를 유지하는 학급 이동 이력, 졸업·보관 상태", next: "담임 변경 이력과 학교의 보존·졸업생 접근 정책 구체화" },
  { feature: "저장소", current: "기존 DB·파일 저장소, 구글 Drive·Sheets 연결 및 이전 기능", next: "구글 운영 연결·이전 결과와 세 사이트 동시 접근 검증" },
  { feature: "전체 백업", current: "원본·분석 버전 포함 ZIP 생성, 파일 해시·개수 검증", next: "관리자 실제 백업 보관 확인, 복원 절차는 후속 단계" },
  { feature: "역할 분리", current: "한 사이트 안에서 학생·담임·관리자 접근 범위 적용", next: "공통 계정 연결을 사용해 관리자 → 교사 → 학생 사이트 구현" },
] as const;
