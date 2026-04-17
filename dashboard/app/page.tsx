import DashboardClient from "@/components/dashboard-client";
import { requireInternalDashboardPageAccess } from "@/lib/dashboard-access";
import { fetchDashboardDefaultSettings } from "@/lib/dashboard-default-settings";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Page() {
  const auth = await requireInternalDashboardPageAccess("/");

  if (!auth.ok) {
    return (
      <div className="container">
        <section className="card auth-card">
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            내부 대시보드 접근 불가
          </h1>
          <p className="error">{auth.error}</p>
        </section>
      </div>
    );
  }

  const supabase = createSupabaseAdminClient();
  const settings = await fetchDashboardDefaultSettings(supabase);

  return <DashboardClient currentUserEmail={auth.email} defaultSettings={settings.data} />;
}
