import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FilterOptionResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const workersResult = await supabase
      .from("workers")
      .select("worker_id")
      .eq("is_active", true)
      .order("worker_id", { ascending: true });

    if (workersResult.error) {
      return NextResponse.json({ error: workersResult.error.message }, { status: 500 });
    }

    const workers = (workersResult.data ?? [])
      .map((row) => row.worker_id)
      .filter((value): value is string => typeof value === "string");

    const maps = new Set<string>();
    const scenarios = new Set<string>();

    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("all_daily_metrics")
        .select("map_code, scenario_code")
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      for (const row of rows) {
        if (row.map_code) maps.add(String(row.map_code));
        if (row.scenario_code) scenarios.add(String(row.scenario_code));
      }
      if (rows.length < pageSize) {
        break;
      }
    }

    const payload: FilterOptionResponse = {
      workers,
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
