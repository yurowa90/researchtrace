import { ensureViewer } from "@/lib/data";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { getStorageConnection, bridgeCall } from "@/lib/google-bridge";
import { getGoogleLocations } from "@/lib/google-locations";
import { inspectGoogleHealth, type GoogleHealth } from "@/lib/google-health";
import { portalLink, portalModeLabels, schoolSite } from "@/lib/site-runtime";
import { readSchoolSnapshot } from "@/lib/school-snapshot";
import { auditSchoolData } from "@/lib/school-audit";
import { accountReadiness, type ReadinessCheck, type ReadinessReport } from "@/lib/operational-readiness";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET() {
  try {
    const viewer = await ensureViewer();
    if (!viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401, headers });
    if (!isSchoolAdmin(viewer)) return Response.json({ error: "승인된 관리자만 운영 연결을 점검할 수 있습니다." }, { status: 403, headers });
    const site = schoolSite(), config = await getStorageConnection(), storage = config?.state ?? "legacy";
    const checks: ReadinessCheck[] = [];
    checks.push({ id: "storage", title: "공통 저장소 전환", state: storage === "google" ? "pass" : "action",
      detail: storage === "google" ? "이 사이트는 Google Drive·Sheets를 사용합니다." : storage === "migrating" ? "자료 복사·검증을 진행 중입니다." : "현재 자료는 기존 사이트 저장소에 있습니다.",
      next: storage === "google" ? "아래 연결 검사 결과를 확인하세요." : "아래 구글 저장소 연결에서 설치 → 연결 확인 → 백업 → 자료 전환을 진행하세요." });
    if (config?.endpoint) {
      try {
        const result = inspectGoogleHealth(await bridgeCall<GoogleHealth>("health", {}, config), site.homeSiteId, site.isHome ? getGoogleLocations() : undefined);
        checks.push({ id: "schema", title: "저장소 응답·전체 시트 형식", state: result.updated ? "pass" : "action",
          detail: result.updated ? "서명된 요청에 응답했고 학교 기준과 모든 시트·열이 일치합니다." : `학교 기준 또는 시트 형식을 확인해야 합니다. 누락 ${result.missingTables.length}개 · 열 불일치 ${result.mismatchedTables.length}개`,
          next: result.updated ? "학년 전환·로그인 연결·지도 이력 시트도 검사했습니다." : "최신 설치 코드로 setupTrace 실행 후 웹 앱을 새 버전으로 갱신하세요." });
      } catch {
        checks.push({ id: "schema", title: "저장소 응답·전체 시트 형식", state: "action", detail: "Google 저장소 응답을 확인하지 못했습니다.", next: "웹 앱 URL·배포 버전·실행 권한을 확인한 뒤 다시 점검하세요." });
      }
    } else checks.push({ id: "schema", title: "저장소 응답·전체 시트 형식", state: "action", detail: "아직 연결된 Google 웹 앱이 없습니다.", next: "소유자 계정으로 최초 설치와 권한 승인을 완료하세요." });
    let roleLinks = { student: 0, teacher: 0 }, tableCount = 0;
    if (storage !== "migrating") {
      const snapshot = await readSchoolSnapshot(), audit = auditSchoolData(snapshot.tables), accounts = accountReadiness(snapshot.tables);
      roleLinks = accounts.roleLinks; tableCount = accounts.tableCount;
      checks.push({ id: "data", title: "누적 자료 연결", state: audit.errorCount ? "action" : "pass", detail: `${audit.counts.tables}개 표 · ${audit.counts.rows}개 기록 · 오류 ${audit.errorCount}개 · 확인 사항 ${audit.warningCount}개`, next: "아래 자료 점검에서 항목별 결과를 확인할 수 있습니다. 원본 내용은 전체 백업으로 검증합니다." });
      checks.push({ id: "accounts", title: "학생 계정·담임 배정", state: !accounts.activeStudents || accounts.unlinked || accounts.unassigned || accounts.pending ? "action" : "pass",
        detail: `실제 재학생 ${accounts.activeStudents}명 · 계정 연결 필요 ${accounts.unlinked}명 · 담당 확인 필요 ${accounts.unassigned}학급 · 로그인 연결 대기 ${accounts.pending}건`,
        next: "학생 관리에서 학생 계정을 연결하고 학급·계정 관리에서 담임 배정과 사이트 로그인 요청을 확인하세요." });
    } else checks.push({ id: "data", title: "누적 자료 연결·계정 점검", state: "action", detail: "이전 중에는 전체 자료 점검을 잠시 멈춥니다.", next: "복사·검증을 마친 뒤 다시 점검하세요." });
    checks.push({ id: "roles", title: "세 사이트 실제 로그인 확인", state: "manual", detail: `학생 사이트 승인 계정 ${roleLinks.student}명 · 교사 사이트 승인 계정 ${roleLinks.teacher}명. 승인 이력만으로 현재 접속 성공을 판단하지 않습니다.`,
      next: "각 사이트의 비공개 공유 대상에 사용자를 추가한 뒤 실제 계정으로 로그인하세요. 학생은 본인 자료, 교사는 담당 학급 자료가 보이는지 확인하세요." });
    checks.push({ id: "backup", title: "백업 보관·복구 준비", state: "manual", detail: "이 점검은 백업 파일의 보관 여부를 확인하지 않습니다.", next: "원본 포함 전체 백업을 내려받고 백업 파일 검증을 실행하세요. 자동 복원과 예약 백업은 제공하지 않습니다." });
    const report: ReadinessReport = { checkedAt: new Date().toISOString(), portal: portalModeLabels[site.mode], storage, checks, roleLinks, tableCount,
      links: { student: portalLink("TRACE_STUDENT_PORTAL_URL"), teacher: portalLink("TRACE_TEACHER_PORTAL_URL") } };
    return Response.json(report, { headers });
  } catch {
    return Response.json({ error: "운영 연결 점검을 완료하지 못했습니다. 현재 사이트의 저장소 설정과 로그인 상태를 확인하세요." }, { status: 503, headers });
  }
}
