import { ensureViewer } from "@/lib/data";
import { isSchoolAdmin } from "@/lib/school-permissions";
import { ResearchPortal } from "@/app/research-portal";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { portalLink, schoolSite } from "@/lib/site-runtime";
import { StudentPortal } from "@/app/student-portal";
import { TeacherPortal } from "@/app/teacher-portal";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return {title:schoolSite().mode==="student"?"TRACE | 나의 탐구 기록":schoolSite().mode==="teacher"?"TRACE | 교사 지도실":"학생 자료 열람 | TRACE 학교 관리자"}; }
export default async function StudentWorkspace() {
  if(schoolSite().mode==="student")return <StudentPortal adminUrl={portalLink("TRACE_ADMIN_PORTAL_URL")}/>;
  if(schoolSite().mode==="teacher")return <TeacherPortal adminUrl={portalLink("TRACE_ADMIN_PORTAL_URL")}/>;
  try {
    const viewer = await ensureViewer();
    if (!viewer) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">로그인이 필요합니다</h1><a className="mt-5 inline-block underline" href={chatGPTSignInPath("/workspace")} target="_top">관리자 계정으로 로그인</a></main>;
    if (!isSchoolAdmin(viewer)) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">관리자 전용 화면입니다</h1><p className="mt-4 leading-7">학교 관리자 승인이 있는 계정으로 접속하세요.</p><a className="mt-5 inline-block underline" href="/">시작 화면</a></main>;
    return <ResearchPortal />;
  } catch {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">접근 권한을 확인하지 못했습니다</h1><p className="mt-4 leading-7">로그인과 저장소 연결 상태를 확인한 뒤 다시 접속하세요.</p><a href="/" className="mt-5 inline-block underline">관리자 시작 화면</a></main>;
  }
}
