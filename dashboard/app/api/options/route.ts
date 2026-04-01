import { NextRequest, NextResponse } from "next/server";

import { jsonAuthError, verifyInternalDashboardRequest } from "@/lib/dashboard-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FilterOptionResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = await verifyInternalDashboardRequest(request);
  if (!auth.ok) {
    return jsonAuthError(auth);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const maps = new Set<string>();
    const scenarios = new Set<string>();
    const workers = new Set<string>();

    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("all_daily_metrics")
        .select(
          "worker_id, map_code, scenario_code, work_date, is_failed, data_seconds, recording_count, day_work_hours, allocated_work_hours, data_source",
        )
        .order("work_date", { ascending: true })
        .order("worker_id", { ascending: true })
        .order("map_code", { ascending: true })
        .order("scenario_code", { ascending: true })
        .order("is_failed", { ascending: true })
        .order("data_seconds", { ascending: true })
        .order("recording_count", { ascending: true })
        .order("day_work_hours", { ascending: true })
        .order("allocated_work_hours", { ascending: true })
        .order("data_source", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      for (const row of rows) {
        if (row.worker_id) workers.add(String(row.worker_id));
        if (row.map_code) maps.add(String(row.map_code));
        if (row.scenario_code) scenarios.add(String(row.scenario_code));
      }
      if (rows.length < pageSize) {
        break;
      }
    }

    const payload: FilterOptionResponse = {
      workers: [...workers].sort(),
      maps: [...maps].sort(),
      scenarios: [...scenarios].sort(),
    };

    return NextResponse.json(payload, {
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
