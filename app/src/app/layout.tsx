import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "주간보고 자동화",
  description: "AI 기반 주간 업무보고 자동 생성·요약 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <nav className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-6">
            <span className="font-bold text-gray-900">주간보고 자동화</span>
            <a href="/" className="text-sm text-gray-600 hover:text-blue-600 transition">
              보고서 작성
            </a>
            <a href="/batch" className="text-sm text-gray-600 hover:text-blue-600 transition">
              일괄 요약
            </a>
            <a href="/merge" className="text-sm text-gray-600 hover:text-blue-600 transition font-medium">
              템플릿 자동 채우기
            </a>
            <a href="/inspect" className="text-sm text-gray-600 hover:text-blue-600 transition">
              템플릿 검사
            </a>
            <a href="/test" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition border border-indigo-200 px-3 py-1 rounded-full">
              🧪 API 테스트
            </a>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="text-center text-xs text-gray-400 py-4 border-t border-gray-100">
          Powered by Claude Sonnet · HWPX (OWPML) 기반
        </footer>
      </body>
    </html>
  );
}
