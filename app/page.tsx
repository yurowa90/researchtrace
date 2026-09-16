import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { ResearchPortal } from "@/app/research-portal";
import { Button } from "@/components/ui/button";
import { BookOpenText, LockKeyhole } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const allowLocalPreview = process.env.NODE_ENV !== "production";

  if (!user && !allowLocalPreview) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-6">
        <section className="w-full max-w-md rounded-[28px] border border-[#dfe5ee] bg-white p-8 shadow-[0_24px_80px_rgba(18,40,76,0.10)]">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl bg-[#173a73] text-white">
            <BookOpenText className="size-6" aria-hidden="true" />
          </div>
          <p className="mb-2 text-sm font-semibold text-[#2457d6]">TRACE</p>
          <h1 className="text-2xl font-bold tracking-[-0.03em] text-[#102342]">학급 연구 프로파일</h1>
          <p className="mt-3 leading-7 text-[#5c6d83]">
            학생 활동 원문과 교사가 승인한 연구 지문을 안전하게 연결합니다. 등록된 사용자만 자료를 볼 수 있습니다.
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

  return <ResearchPortal />;
}
