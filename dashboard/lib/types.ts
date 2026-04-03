export type DataSource = "ingested" | "legacy";

export type DailyMetricRow = {
  work_date: string;
  worker_id: string;
  map_code: string;
  scenario_code: string;
  is_failed: boolean;
  data_seconds: number;
  recording_count: number;
  day_work_hours: number;
  allocated_work_hours: number;
  data_source: DataSource;
};

export type FilterOptionResponse = {
  workers: string[];
  maps: string[];
  scenarios: string[];
};

export type DailySummaryPoint = {
  work_date: string;
  workers: number;
  data_seconds: number;
  data_hours: number;
  work_hours: number;
  efficiency_pct: number;
  cumulative_hours: number;
};

export type WorkerSummaryPoint = {
  worker_id: string;
  days: number;
  data_seconds: number;
  data_hours: number;
  work_hours: number;
  efficiency_pct: number;
};

export type MapScenarioSummaryPoint = {
  map_code: string;
  scenario_code: string;
  data_seconds: number;
  data_hours: number;
  work_hours: number;
  efficiency_pct: number;
};

export type QualitySummary = {
  total_seconds: number;
  failed_seconds: number;
  valid_seconds: number;
  total_hours: number;
  failed_hours: number;
  valid_hours: number;
  failed_pct: number;
  valid_pct: number;
};

export type DashboardSummaryResponse = {
  daily: DailySummaryPoint[];
  worker: WorkerSummaryPoint[];
  mapScenario: MapScenarioSummaryPoint[];
  quality: QualitySummary;
  totals: {
    total_hours: number;
    total_seconds: number;
    worker_count: number;
    work_days: number;
  };
};

export type PublicDailySummaryPoint = {
  work_date: string;
  data_seconds: number;
  data_hours: number;
  cumulative_hours: number;
};

export type PublicMapSummaryPoint = {
  map_code: string;
  data_seconds: number;
  data_hours: number;
  share_pct: number;
};

export type PublicScenarioSummaryPoint = {
  scenario_code: string;
  data_seconds: number;
  data_hours: number;
  share_pct: number;
};

export type PublicSummaryResponse = {
  daily: PublicDailySummaryPoint[];
  maps: PublicMapSummaryPoint[];
  totals: {
    total_hours: number;
    total_seconds: number;
    map_count: number;
    work_days: number;
  };
};

export type PublicMapDetailResponse = {
  map_code: string;
  total_hours: number;
  total_seconds: number;
  scenarios: PublicScenarioSummaryPoint[];
};

export type PublicViewerFilters = {
  start: string;
  end: string;
  workers: string[];
  maps: string[];
  scenarios: string[];
  baselineHours: number;
};

export type MapCodeAliasRow = {
  alias_map_code: string;
  canonical_map_code: string;
  note: string | null;
  is_active: boolean;
  updated_at: string;
};

export type OverrideRow = {
  worker_id: string;
  work_date: string;
  work_hours: number;
  note: string | null;
  updated_at: string;
};

export type ScenarioOverrideRow = {
  match_pattern: string;
  scenario_code: string;
  note: string | null;
  is_active: boolean;
  updated_at: string;
};
