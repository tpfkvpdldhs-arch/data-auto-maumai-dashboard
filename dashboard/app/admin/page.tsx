import AdminOverridesClient from "@/components/admin-overrides-client";
import { requireInternalDashboardPageAccess } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await requireInternalDashboardPageAccess("/admin");

  if (!auth.ok) {
    return (
      <div className="container">
        <section className="card auth-card">
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            관리자 화면 접근 불가
          </h1>
          <p className="error">{auth.error}</p>
        </section>
      </div>
    );
  }

  return <AdminOverridesClient />;
}
