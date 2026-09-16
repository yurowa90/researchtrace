import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRACE | 학생부 연구 프로파일",
  description:
    "2·3학년 학생부 원본과 Work 분석 결과를 연결해 연구지문, 교과 흐름, 역량 진단, LLM 위키를 누적하는 학교 플랫폼",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
