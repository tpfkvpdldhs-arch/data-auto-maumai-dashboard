import { NextRequest, NextResponse } from "next/server";

import { jsonAuthError, verifyPublicViewerRequest } from "@/lib/dashboard-access";
import { applyMapCodeAliases, fetchActiveMapCodeAliasMap, filterMetricRows } from "@/lib/map-code-aliases";
import { fetchAllDailyMetricRows } from "@/lib/metric-query";
import { buildPublicSummary, normalizeRows } from "@/lib/metrics";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const auth = verifyPublicViewerRequest(request);
  if (!auth.ok) {
    return jsonAuthError(auth);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const params = request.nextUrl.searchParams;
    const workerIds = parseList(params.get("workers"));
    const mapCodes = parseList(params.get("maps"));
    const scenarioCodes = parseList(params.get("scenarios"));

    const rowsResult = await fetchAllDailyMetricRows(supabase, {
      start: params.get("start"),
      end: params.get("end"),
      workerIds,
      scenarioCodes,
    });
    if (rowsResult.error) {
      return NextResponse.json({ error: rowsResult.error }, { status: 500 });
    }

    const aliasResult = await fetchActiveMapCodeAliasMap(supabase);
    if (aliasResult.error) {
      return NextResponse.json({ error: aliasResult.error }, { status: 500 });
    }

    const canonicalRows = applyMapCodeAliases(normalizeRows(rowsResult.data), aliasResult.data);
    const filteredRows = filterMetricRows(canonicalRows, {
      workerIds,
      mapCodes,
      scenarioCodes,
    });
    const summary = buildPublicSummary(filteredRows);
    return NextResponse.json(summary, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
