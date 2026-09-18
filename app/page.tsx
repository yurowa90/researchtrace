import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { AdminPortal } from "@/app/admin-portal";
import { TeacherPortal } from "@/app/teacher-portal";
import { portalLink, schoolSite } from "@/lib/site-runtime";
import { Button } from "@/components/ui/button";
import { BookOpenText, LockKeyhole } from "lucide-react";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return {title:schoolSite().mode==="teacher"?"TRACE | 교사 지도실":"TRACE | 학교 관리자"}; }

export default async function Home() {
  const user = await getChatGPTUser();
  const allowLocalPreview = process.env.NODE_ENV !== "production";
  const teacher = schoolSite().mode === "teacher";

  if (!user && !allowLocalPreview) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-6">
        <section className="w-full max-w-md rounded-[28px] border border-[#dfe5ee] bg-white p-8 shadow-[0_24px_80px_rgba(18,40,76,0.10)]">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl bg-[#173a73] text-white">
            <BookOpenText className="size-6" aria-hidden="true" />
          </div>
          <p className="mb-2 text-sm font-semibold text-[#2457d6]">TRACE</p>
          <h1 className="text-2xl font-bold tracking-[-0.03em] text-[#102342]">{teacher ? "교사 지도실" : "학교 관리자"}</h1>
          <p className="mt-3 leading-7 text-[#5c6d83]">
            {teacher ? "담당 학급의 학생부와 연구 기록을 확인하고 상담·피드백을 이어갑니다. 승인된 교사 계정으로 로그인하세요." : "학생·학급·계정과 누적 자료를 관리합니다. 승인된 학교 관리자 계정으로 로그인하세요."}
          </p>
          <Button asChild className="mt-7 h-11 w-full bg-[#173a73] hover:bg-[#102f61]">
            <a href={chatGPTSignInPath("/")} target="_top">
              <LockKeyhole className="size-4" />
              ChatGPT 계정으로 로그인
            </a>
          </Button>
        </section>
      </main>
    );
  }

  return teacher ? <TeacherPortal adminUrl={portalLink("TRACE_ADMIN_PORTAL_URL")} /> : <AdminPortal />;
}
