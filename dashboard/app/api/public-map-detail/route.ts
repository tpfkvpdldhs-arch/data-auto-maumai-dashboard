import { NextRequest, NextResponse } from "next/server";

import { jsonAuthError, verifyPublicViewerRequest } from "@/lib/dashboard-access";
import { fetchAllDailyMetricRows } from "@/lib/metric-query";
import { buildPublicMapDetail, normalizeRows } from "@/lib/metrics";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = verifyPublicViewerRequest(request);
  if (!auth.ok) {
    return jsonAuthError(auth);
  }

  try {
    const params = request.nextUrl.searchParams;
    const mapCode = (params.get("map") ?? "").trim();
    if (!mapCode) {
      return NextResponse.json({ error: "map is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const rowsResult = await fetchAllDailyMetricRows(supabase, {
      start: params.get("start"),
      end: params.get("end"),
      mapCodes: [mapCode],
    });
    if (rowsResult.error) {
      return NextResponse.json({ error: rowsResult.error }, { status: 500 });
    }

    const detail = buildPublicMapDetail(mapCode, normalizeRows(rowsResult.data));
    return NextResponse.json(detail, {
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
