import { NextRequest, NextResponse } from "next/server";

import { jsonAuthError, verifyInternalDashboardRequest } from "@/lib/dashboard-access";
import { fetchAllDailyMetricRows } from "@/lib/metric-query";
import { buildSummary, normalizeRows } from "@/lib/metrics";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const auth = await verifyInternalDashboardRequest(request);
  if (!auth.ok) {
    return jsonAuthError(auth);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const params = request.nextUrl.searchParams;

    const start = params.get("start");
    const end = params.get("end");
    const workerIds = parseList(params.get("workers"));
    const mapCodes = parseList(params.get("maps"));
    const scenarioCodes = parseList(params.get("scenarios"));

    const rowsResult = await fetchAllDailyMetricRows(supabase, {
      start,
      end,
      workerIds,
      mapCodes,
      scenarioCodes,
    });
    if (rowsResult.error) {
      return NextResponse.json({ error: rowsResult.error }, { status: 500 });
    }

    const normalized = normalizeRows(rowsResult.data);
    const summary = buildSummary(normalized);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
