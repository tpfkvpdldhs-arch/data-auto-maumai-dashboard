import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Worker Data Dashboard",
  description: "Supabase 기반 데이터 작업 현황 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
