import { NextRequest, NextResponse } from "next/server";

import { jsonAuthError, verifyPublicViewerRequest } from "@/lib/dashboard-access";
import { applyMapCodeAliases, fetchActiveMapCodeAliasMap, filterMetricRows, normalizeMapCode } from "@/lib/map-code-aliases";
import { fetchAllDailyMetricRows } from "@/lib/metric-query";
import { buildPublicMapDetail, normalizeRows } from "@/lib/metrics";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = verifyPublicViewerRequest(request);
  if (!auth.ok) {
    return jsonAuthError(auth);
  }

  try {
    const params = request.nextUrl.searchParams;
    const rawMapCode = (params.get("map") ?? "").trim();
    if (!rawMapCode) {
      return NextResponse.json({ error: "map is required" }, { status: 400 });
    }
    const mapCode = normalizeMapCode(rawMapCode);

    const supabase = createSupabaseAdminClient();
    const rowsResult = await fetchAllDailyMetricRows(supabase, {
      start: params.get("start"),
      end: params.get("end"),
    });
    if (rowsResult.error) {
      return NextResponse.json({ error: rowsResult.error }, { status: 500 });
    }

    const aliasResult = await fetchActiveMapCodeAliasMap(supabase);
    if (aliasResult.error) {
      return NextResponse.json({ error: aliasResult.error }, { status: 500 });
    }

    const canonicalRows = applyMapCodeAliases(normalizeRows(rowsResult.data), aliasResult.data);
    const filteredRows = filterMetricRows(canonicalRows, { mapCodes: [mapCode] });
    const detail = buildPublicMapDetail(mapCode, filteredRows);
    return NextResponse.json(detail, {
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
