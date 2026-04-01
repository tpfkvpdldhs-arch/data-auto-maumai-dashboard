import Link from "next/link";
import { redirect } from "next/navigation";

import LoginClient from "@/components/login-client";
import { verifyInternalDashboardRequest } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const auth = await verifyInternalDashboardRequest();
  if (auth.ok) {
    redirect(searchParams?.next || "/");
  }

  const nextPath = typeof searchParams?.next === "string" && searchParams.next.startsWith("/") ? searchParams.next : "/";

  return (
    <div className="container">
      <section className="card auth-card">
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          내부 대시보드 로그인
        </h1>
        <p className="page-subtitle">@maum.ai Google 계정으로 로그인해야 내부 대시보드를 볼 수 있습니다.</p>
        <LoginClient nextPath={nextPath} />
        {auth.status === 403 ? (
          <div style={{ marginTop: 12 }}>
            <p className="error">허용되지 않은 계정입니다. @maum.ai 계정으로 다시 로그인해 주세요.</p>
            <Link href="/auth/logout" prefetch={false}>
              현재 세션 로그아웃
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
