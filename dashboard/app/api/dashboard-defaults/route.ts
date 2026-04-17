import { NextRequest, NextResponse } from "next/server";

import { fetchDashboardDefaultSettings } from "@/lib/dashboard-default-settings";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function verifyAdminToken(req: NextRequest): string | null {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    return "ADMIN_API_TOKEN is not configured";
  }

  const token = req.headers.get("x-admin-token");
  if (!token || token !== expected) {
    return "invalid admin token";
  }

  return null;
}

function normalizeDate(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export async function GET(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("configured") ? 500 : 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const settings = await fetchDashboardDefaultSettings(supabase);
    if (settings.error) {
      return NextResponse.json({ error: settings.error }, { status: 500 });
    }

    return NextResponse.json({ item: settings.data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("configured") ? 500 : 401 });
  }

  try {
    const body = (await req.json()) as {
      forecast_end?: string;
      target_hours?: number;
      baseline_hours?: number;
    };

    const forecastEnd = normalizeDate(body.forecast_end);
    const targetHours = Number(body.target_hours);
    const baselineHours = Number(body.baseline_hours);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(forecastEnd) || !Number.isFinite(targetHours) || targetHours <= 0 || !Number.isFinite(baselineHours) || baselineHours < 0) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("dashboard_default_settings").upsert(
      {
        settings_key: "global",
        forecast_end: forecastEnd,
        target_hours: targetHours,
        baseline_hours: baselineHours,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "settings_key",
      },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const settings = await fetchDashboardDefaultSettings(supabase);
    if (settings.error) {
      return NextResponse.json({ error: settings.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: settings.data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
