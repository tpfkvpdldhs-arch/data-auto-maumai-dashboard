import type {
  DailyMetricRow,
  DashboardSummaryResponse,
  DailySummaryPoint,
  MapScenarioSummaryPoint,
  PublicMapDetailResponse,
  PublicSummaryResponse,
  PublicScenarioSummaryPoint,
  WorkerSummaryPoint,
} from "./types";

function toNum(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeRows(rawRows: Record<string, unknown>[]): DailyMetricRow[] {
  return rawRows.map((row) => ({
    work_date: String(row.work_date ?? ""),
    worker_id: String(row.worker_id ?? "unknown"),
    map_code: String(row.map_code ?? "unknown"),
    scenario_code: String(row.scenario_code ?? "unknown"),
    is_failed: Boolean(row.is_failed),
    data_seconds: toNum(row.data_seconds),
    recording_count: toNum(row.recording_count),
    day_work_hours: toNum(row.day_work_hours),
    allocated_work_hours: toNum(row.allocated_work_hours),
    data_source: (row.data_source === "legacy" ? "legacy" : "ingested") as "legacy" | "ingested",
  }));
}

export function buildSummary(rows: DailyMetricRow[]): DashboardSummaryResponse {
  const dayMap = new Map<
    string,
    {
      workers: Set<string>;
      dataSeconds: number;
      workHours: number;
    }
  >();
  const workerMap = new Map<
    string,
    {
      days: Set<string>;
      dataSeconds: number;
      workHours: number;
    }
  >();
  const mapScenarioMap = new Map<
    string,
    {
      mapCode: string;
      scenarioCode: string;
      dataSeconds: number;
      workHours: number;
    }
  >();

  let totalSeconds = 0;
  let failedSeconds = 0;

  for (const row of rows) {
    totalSeconds += row.data_seconds;
    if (row.is_failed) {
      failedSeconds += row.data_seconds;
    }

    const dayEntry = dayMap.get(row.work_date) ?? {
      workers: new Set<string>(),
      dataSeconds: 0,
      workHours: 0,
    };
    dayEntry.workers.add(row.worker_id);
    dayEntry.dataSeconds += row.data_seconds;
    dayEntry.workHours += row.allocated_work_hours;
    dayMap.set(row.work_date, dayEntry);

    const workerEntry = workerMap.get(row.worker_id) ?? {
      days: new Set<string>(),
      dataSeconds: 0,
      workHours: 0,
    };
    workerEntry.days.add(row.work_date);
    workerEntry.dataSeconds += row.data_seconds;
    workerEntry.workHours += row.allocated_work_hours;
    workerMap.set(row.worker_id, workerEntry);

    const msKey = `${row.map_code}::${row.scenario_code}`;
    const msEntry = mapScenarioMap.get(msKey) ?? {
      mapCode: row.map_code,
      scenarioCode: row.scenario_code,
      dataSeconds: 0,
      workHours: 0,
    };
    msEntry.dataSeconds += row.data_seconds;
    msEntry.workHours += row.allocated_work_hours;
    mapScenarioMap.set(msKey, msEntry);
  }

  const orderedDayKeys = [...dayMap.keys()].sort();
  let cumulativeSeconds = 0;
  const daily: DailySummaryPoint[] = orderedDayKeys.map((day) => {
    const item = dayMap.get(day)!;
    cumulativeSeconds += item.dataSeconds;
    const dataHours = item.dataSeconds / 3600;
    const efficiency = item.workHours > 0 ? (item.dataSeconds / (item.workHours * 3600)) * 100 : 0;

    return {
      work_date: day,
      workers: item.workers.size,
      data_seconds: item.dataSeconds,
      data_hours: dataHours,
      work_hours: item.workHours,
      efficiency_pct: efficiency,
      cumulative_hours: cumulativeSeconds / 3600,
    };
  });

  const worker: WorkerSummaryPoint[] = [...workerMap.entries()]
    .map(([workerId, item]) => {
      const efficiency = item.workHours > 0 ? (item.dataSeconds / (item.workHours * 3600)) * 100 : 0;
      return {
        worker_id: workerId,
        days: item.days.size,
        data_seconds: item.dataSeconds,
        data_hours: item.dataSeconds / 3600,
        work_hours: item.workHours,
        efficiency_pct: efficiency,
      };
    })
    .sort((a, b) => b.data_seconds - a.data_seconds);

  const mapScenario: MapScenarioSummaryPoint[] = [...mapScenarioMap.values()]
    .map((item) => {
      const efficiency = item.workHours > 0 ? (item.dataSeconds / (item.workHours * 3600)) * 100 : 0;
      return {
        map_code: item.mapCode,
        scenario_code: item.scenarioCode,
        data_seconds: item.dataSeconds,
        data_hours: item.dataSeconds / 3600,
        work_hours: item.workHours,
        efficiency_pct: efficiency,
      };
    })
    .sort((a, b) => b.data_seconds - a.data_seconds);

  const validSeconds = Math.max(totalSeconds - failedSeconds, 0);

  return {
    daily,
    worker,
    mapScenario,
    quality: {
      total_seconds: totalSeconds,
      failed_seconds: failedSeconds,
      valid_seconds: validSeconds,
      total_hours: totalSeconds / 3600,
      failed_hours: failedSeconds / 3600,
      valid_hours: validSeconds / 3600,
      failed_pct: totalSeconds ? (failedSeconds / totalSeconds) * 100 : 0,
      valid_pct: totalSeconds ? (validSeconds / totalSeconds) * 100 : 0,
    },
    totals: {
      total_hours: totalSeconds / 3600,
      total_seconds: totalSeconds,
      worker_count: new Set(rows.map((row) => row.worker_id)).size,
      work_days: orderedDayKeys.length,
    },
  };
}

export function buildPublicSummary(rows: DailyMetricRow[]): PublicSummaryResponse {
  const dayMap = new Map<string, number>();
  const mapMap = new Map<string, number>();

  let totalSeconds = 0;

  for (const row of rows) {
    totalSeconds += row.data_seconds;
    dayMap.set(row.work_date, (dayMap.get(row.work_date) ?? 0) + row.data_seconds);
    mapMap.set(row.map_code, (mapMap.get(row.map_code) ?? 0) + row.data_seconds);
  }

  const orderedDayKeys = [...dayMap.keys()].sort();
  let cumulativeSeconds = 0;
  const daily = orderedDayKeys.map((day) => {
    const dataSeconds = dayMap.get(day) ?? 0;
    cumulativeSeconds += dataSeconds;

    return {
      work_date: day,
      data_seconds: dataSeconds,
      data_hours: dataSeconds / 3600,
      cumulative_hours: cumulativeSeconds / 3600,
    };
  });

  const maps = [...mapMap.entries()]
    .map(([mapCode, dataSeconds]) => ({
      map_code: mapCode,
      data_seconds: dataSeconds,
      data_hours: dataSeconds / 3600,
      share_pct: totalSeconds > 0 ? (dataSeconds / totalSeconds) * 100 : 0,
    }))
    .sort((a, b) => b.data_seconds - a.data_seconds);

  return {
    daily,
    maps,
    totals: {
      total_hours: totalSeconds / 3600,
      total_seconds: totalSeconds,
      map_count: mapMap.size,
      work_days: orderedDayKeys.length,
    },
  };
}

export function buildPublicMapDetail(mapCode: string, rows: DailyMetricRow[]): PublicMapDetailResponse {
  const scenarioMap = new Map<string, number>();
  let totalSeconds = 0;

  for (const row of rows) {
    totalSeconds += row.data_seconds;
    scenarioMap.set(row.scenario_code, (scenarioMap.get(row.scenario_code) ?? 0) + row.data_seconds);
  }

  const scenarios: PublicScenarioSummaryPoint[] = [...scenarioMap.entries()]
    .map(([scenarioCode, dataSeconds]) => ({
      scenario_code: scenarioCode,
      data_seconds: dataSeconds,
      data_hours: dataSeconds / 3600,
      share_pct: totalSeconds > 0 ? (dataSeconds / totalSeconds) * 100 : 0,
    }))
    .sort((a, b) => b.data_seconds - a.data_seconds);

  return {
    map_code: mapCode,
    total_hours: totalSeconds / 3600,
    total_seconds: totalSeconds,
    scenarios,
  };
}
