import { NextRequest, NextResponse } from "next/server";

import { jsonAuthError, verifyPublicViewerRequest } from "@/lib/dashboard-access";
import { applyMapCodeAliases, fetchActiveMapCodeAliasMap } from "@/lib/map-code-aliases";
import { fetchAllDailyMetricRows } from "@/lib/metric-query";
import { buildPublicSummary, normalizeRows } from "@/lib/metrics";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = verifyPublicViewerRequest(request);
  if (!auth.ok) {
    return jsonAuthError(auth);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const params = request.nextUrl.searchParams;

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

    const summary = buildPublicSummary(applyMapCodeAliases(normalizeRows(rowsResult.data), aliasResult.data));
    return NextResponse.json(summary, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
