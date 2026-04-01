import PublicViewerClient from "@/components/public-viewer-client";
import { verifyPublicViewerToken } from "@/lib/dashboard-access";

type ViewerPageProps = {
  searchParams?: {
    token?: string;
    start?: string;
    end?: string;
    baseline?: string;
  };
};

function toDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(raw: string | undefined, fallback: string) {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function normalizeBaseline(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default function ViewerPage({ searchParams }: ViewerPageProps) {
  const token = typeof searchParams?.token === "string" ? searchParams.token : null;
  const auth = verifyPublicViewerToken(token);

  if (!auth.ok) {
    return (
      <div className="container">
        <section className="card auth-card">
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            공개용 뷰 접근 불가
          </h1>
          <p className="error">{auth.error}</p>
        </section>
      </div>
    );
  }

  const today = toDateInput(new Date());
  const initialStart = normalizeDate(searchParams?.start, "2026-02-02");
  const initialEnd = normalizeDate(searchParams?.end, today);
  const baselineHours = normalizeBaseline(searchParams?.baseline, 24.7);

  return (
    <PublicViewerClient
      token={auth.token}
      initialStart={initialStart}
      initialEnd={initialEnd}
      baselineHours={baselineHours}
    />
  );
}
