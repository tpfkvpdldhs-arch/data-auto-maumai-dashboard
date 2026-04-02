import { createSupabaseAdminClient } from "./supabase-admin";

const PAGE_SIZE = 1000;

export type MetricQueryFilters = {
  start?: string | null;
  end?: string | null;
  workerIds?: string[];
  mapCodes?: string[];
  scenarioCodes?: string[];
};

export async function fetchAllDailyMetricRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  filters: MetricQueryFilters,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const allRows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("all_daily_metrics")
      .select(
        "work_date, worker_id, map_code, scenario_code, is_failed, data_seconds, recording_count, day_work_hours, allocated_work_hours, data_source",
      )
      .order("work_date", { ascending: true })
      .order("worker_id", { ascending: true })
      .order("map_code", { ascending: true })
      .order("scenario_code", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (filters.start) query = query.gte("work_date", filters.start);
    if (filters.end) query = query.lte("work_date", filters.end);
    if (filters.workerIds && filters.workerIds.length > 0) query = query.in("worker_id", filters.workerIds);
    if (filters.scenarioCodes && filters.scenarioCodes.length > 0) query = query.in("scenario_code", filters.scenarioCodes);

    const { data, error } = await query;
    if (error) {
      return { data: [], error: error.message };
    }

    const chunk = (data ?? []) as Record<string, unknown>[];
    allRows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  return { data: allRows, error: null };
}
