import { NextRequest, NextResponse } from "next/server";

import { buildSummary, normalizeRows } from "@/lib/metrics";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const PAGE_SIZE = 1000;

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const params = request.nextUrl.searchParams;

    const start = params.get("start");
    const end = params.get("end");
    const workerIds = parseList(params.get("workers"));
    const mapCodes = parseList(params.get("maps"));
    const scenarioCodes = parseList(params.get("scenarios"));

    const allRows: Record<string, unknown>[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("all_daily_metrics")
        .select(
          "work_date, worker_id, map_code, scenario_code, is_failed, data_seconds, recording_count, day_work_hours, allocated_work_hours, data_source",
        )
        .order("work_date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (start) query = query.gte("work_date", start);
      if (end) query = query.lte("work_date", end);
      if (workerIds.length > 0) query = query.in("worker_id", workerIds);
      if (mapCodes.length > 0) query = query.in("map_code", mapCodes);
      if (scenarioCodes.length > 0) query = query.in("scenario_code", scenarioCodes);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const chunk = (data ?? []) as Record<string, unknown>[];
      allRows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }

    const normalized = normalizeRows(allRows);
    const summary = buildSummary(normalized);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
