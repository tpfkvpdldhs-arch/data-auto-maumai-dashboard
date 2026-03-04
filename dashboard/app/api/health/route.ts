import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ADMIN_API_TOKEN: Boolean(process.env.ADMIN_API_TOKEN),
  };

  const ok = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      status: ok ? "ok" : "missing_env",
      checked_at: new Date().toISOString(),
      checks,
    },
    {
      status: ok ? 200 : 500,
    },
  );
}
