"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchWithSessionRetry } from "@/lib/client-auth-fetch";
import type { DashboardDefaultSettingsRow, DashboardSummaryResponse, FilterOptionResponse } from "@/lib/types";

type Filters = {
  start: string;
  end: string;
  workers: string[];
  maps: string[];
  scenarios: string[];
  baselineHours: string;
  targetHours: string;
  forecastEnd: string;
  forecastWindow: string;
};

type DailyChartPoint = {
  work_date: string;
  label: string;
  data_hours: number | null;
  actual_cumulative_hours: number | null;
  forecast_cumulative_hours: number | null;
  target_hours: number | null;
  work_hours: number | null;
  efficiency_pct: number | null;
  worker_count: number | null;
};

const EMPTY_SUMMARY: DashboardSummaryResponse = {
  daily: [],
  worker: [],
  mapScenario: [],
  quality: {
    total_seconds: 0,
    failed_seconds: 0,
    valid_seconds: 0,
    total_hours: 0,
    failed_hours: 0,
    valid_hours: 0,
    failed_pct: 0,
    valid_pct: 0,
  },
  totals: {
    total_hours: 0,
    total_seconds: 0,
    worker_count: 0,
    work_days: 0,
  },
};

const EMPTY_OPTIONS: FilterOptionResponse = {
  workers: [],
  maps: [],
  scenarios: [],
};

function sortUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort();
}

function mergeOptions(current: FilterOptionResponse, next: Partial<FilterOptionResponse>): FilterOptionResponse {
  return {
    workers: sortUnique([...(current.workers ?? []), ...(next.workers ?? [])]),
    maps: sortUnique([...(current.maps ?? []), ...(next.maps ?? [])]),
    scenarios: sortUnique([...(current.scenarios ?? []), ...(next.scenarios ?? [])]),
  };
}

function extractOptionsFromSummary(summary: DashboardSummaryResponse): Partial<FilterOptionResponse> {
  return {
    workers: summary.worker.map((item) => item.worker_id),
    maps: summary.mapScenario.map((item) => item.map_code),
    scenarios: summary.mapScenario.map((item) => item.scenario_code),
  };
}

function toDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseYmdLocal(raw: string): Date | null {
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]) - 1;
  const day = Number(matched[3]);
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthDay(rawYmd: string): string {
  const parsed = parseYmdLocal(rawYmd);
  if (!parsed) return rawYmd;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

function isBusinessDay(value: Date): boolean {
  const day = value.getDay();
  return day >= 1 && day <= 5;
}

function iterBusinessDays(startExclusive: Date, endInclusive: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(startExclusive);

  while (true) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor > endInclusive) break;
    if (isBusinessDay(cursor)) {
      out.push(new Date(cursor));
    }
  }

  return out;
}

function getDefaultForecastEnd(today: Date): string {
  const thisYearTarget = new Date(today.getFullYear(), 3, 17);
  const target = today <= thisYearTarget ? thisYearTarget : new Date(today.getFullYear() + 1, 3, 17);
  return toDateInput(target);
}

function createDefaultFilters(defaultSettings: DashboardDefaultSettingsRow): Filters {
  const end = new Date();

  return {
    start: "2026-02-02",
    end: toDateInput(end),
    workers: [],
    maps: [],
    scenarios: [],
    baselineHours: String(defaultSettings.baseline_hours),
    targetHours: String(defaultSettings.target_hours),
    forecastEnd: defaultSettings.forecast_end || getDefaultForecastEnd(end),
    forecastWindow: "5",
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (Array.isArray(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fixed2(value: number): string {
  return value.toFixed(2);
}

function numberText(value: number): string {
  return fixed2(value);
}

function hours(value: number): string {
  return `${fixed2(value)}h`;
}

function pct(value: number): string {
  return `${fixed2(value)}%`;
}

function numberOrDash(value: unknown): string {
  const numeric = toFiniteNumber(value);
  return numeric === null ? "-" : fixed2(numeric);
}

function hoursOrDash(value: unknown): string {
  const numeric = toFiniteNumber(value);
  return numeric === null ? "-" : `${fixed2(numeric)}h`;
}

function percentOrDash(value: unknown): string {
  const numeric = toFiniteNumber(value);
  return numeric === null ? "-" : `${fixed2(numeric)}%`;
}

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  if (filters.workers.length) params.set("workers", filters.workers.join(","));
  if (filters.maps.length) params.set("maps", filters.maps.join(","));
  if (filters.scenarios.length) params.set("scenarios", filters.scenarios.join(","));
  return params.toString();
}

function DailyChartTooltip(props: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: unknown; dataKey?: string; payload?: DailyChartPoint }>;
  label?: string;
}) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  const rows = payload.filter((entry) => toFiniteNumber(entry.value) !== null);

  return (
    <div className="tooltip-box">
      <p className="tooltip-title">{label}</p>
      {rows.map((entry, idx) => (
        <div className="tooltip-row" key={`${entry.dataKey}-${idx}`}>
          <span>{entry.name}</span>
          <strong>{hoursOrDash(entry.value)}</strong>
        </div>
      ))}
      <div className="tooltip-row">
        <span>일일 효율</span>
        <strong>{percentOrDash(point?.efficiency_pct)}</strong>
      </div>
      <div className="tooltip-row">
        <span>작업시간</span>
        <strong>{hoursOrDash(point?.work_hours)}</strong>
      </div>
    </div>
  );
}

type DashboardClientProps = {
  currentUserEmail: string;
  defaultSettings: DashboardDefaultSettingsRow;
};

export default function DashboardClient({ currentUserEmail, defaultSettings }: DashboardClientProps) {
  const [filters, setFilters] = useState<Filters>(() => createDefaultFilters(defaultSettings));
  const [options, setOptions] = useState<FilterOptionResponse>(EMPTY_OPTIONS);
  const [summary, setSummary] = useState<DashboardSummaryResponse>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);

  const mapScenarioForChart = useMemo(
    () =>
      summary.mapScenario.slice(0, 15).map((item) => ({
        ...item,
        label: `${item.map_code} | ${item.scenario_code}`,
      })),
    [summary.mapScenario],
  );

  const mapScenarioChartHeight = useMemo(() => Math.max(320, mapScenarioForChart.length * 34), [mapScenarioForChart.length]);

  const dailyProjection = useMemo(() => {
    const baselineHoursRaw = Number(filters.baselineHours);
    const baselineHours = Number.isFinite(baselineHoursRaw) && baselineHoursRaw > 0 ? baselineHoursRaw : 0;

    const targetHoursRaw = Number(filters.targetHours);
    const targetHours = Number.isFinite(targetHoursRaw) && targetHoursRaw > 0 ? targetHoursRaw : 0;

    const forecastWindowRaw = Number.parseInt(filters.forecastWindow, 10);
    const forecastWindow = Number.isFinite(forecastWindowRaw) && forecastWindowRaw > 0 ? forecastWindowRaw : 5;

    const chartData: DailyChartPoint[] = summary.daily.map((item) => ({
      work_date: item.work_date,
      label: formatMonthDay(item.work_date),
      data_hours: item.data_hours,
      actual_cumulative_hours: item.cumulative_hours + baselineHours,
      forecast_cumulative_hours: null,
      target_hours: targetHours || null,
      work_hours: item.work_hours,
      efficiency_pct: item.efficiency_pct,
      worker_count: item.workers,
    }));

    if (baselineHours > 0) {
      chartData.unshift({
        work_date: "baseline",
        label: "기준",
        data_hours: null,
        actual_cumulative_hours: baselineHours,
        forecast_cumulative_hours: null,
        target_hours: targetHours || null,
        work_hours: null,
        efficiency_pct: null,
        worker_count: null,
      });
    }

    const currentHours = summary.totals.total_hours + baselineHours;
    let projectedHoursAtTargetDate = currentHours;
    let recentAverageHours = 0;
    let forecastBusinessDays = 0;
    let forecastRangeLabel = "";

    const forecastEndDate = parseYmdLocal(filters.forecastEnd);
    const lastActual = summary.daily.length > 0 ? summary.daily[summary.daily.length - 1] : null;
    const lastActualDate = lastActual ? parseYmdLocal(lastActual.work_date) : null;

    if (lastActualDate && forecastEndDate && lastActualDate < forecastEndDate) {
      const futureBusinessDays = iterBusinessDays(lastActualDate, forecastEndDate);
      forecastBusinessDays = futureBusinessDays.length;

      const recentBusinessRows = summary.daily.filter((item) => {
        const parsed = parseYmdLocal(item.work_date);
        return parsed ? isBusinessDay(parsed) : false;
      });

      const referenceRows = recentBusinessRows.slice(-forecastWindow);
      if (referenceRows.length > 0) {
        recentAverageHours = referenceRows.reduce((acc, item) => acc + item.data_hours, 0) / referenceRows.length;
      }

      if (chartData.length > 0 && lastActual) {
        chartData[chartData.length - 1].forecast_cumulative_hours = lastActual.cumulative_hours + baselineHours;
      }

      let runningHours = lastActual ? lastActual.cumulative_hours + baselineHours : currentHours;
      for (const day of futureBusinessDays) {
        runningHours += recentAverageHours;
        const ymd = toDateInput(day);
        chartData.push({
          work_date: ymd,
          label: formatMonthDay(ymd),
          data_hours: null,
          actual_cumulative_hours: null,
          forecast_cumulative_hours: runningHours,
          target_hours: targetHours || null,
          work_hours: null,
          efficiency_pct: null,
          worker_count: null,
        });
      }

      projectedHoursAtTargetDate = runningHours;

      if (futureBusinessDays.length > 0) {
        const startLabel = formatMonthDay(toDateInput(futureBusinessDays[0]));
        const endLabel = formatMonthDay(toDateInput(futureBusinessDays[futureBusinessDays.length - 1]));
        forecastRangeLabel = `${startLabel} ~ ${endLabel}`;
      }
    }

    const currentPct = targetHours > 0 ? (currentHours / targetHours) * 100 : 0;
    const projectedPct = targetHours > 0 ? (projectedHoursAtTargetDate / targetHours) * 100 : 0;

    return {
      baselineHours,
      chartData,
      targetHours,
      currentHours,
      currentPct,
      projectedHoursAtTargetDate,
      projectedPct,
      forecastWindow,
      recentAverageHours,
      forecastBusinessDays,
      forecastRangeLabel,
    };
  }, [summary, filters.baselineHours, filters.targetHours, filters.forecastEnd, filters.forecastWindow]);

  async function fetchOptions() {
    const response = await fetchWithSessionRetry("/api/options");
    if (!response.ok) {
      const detail = (await response.json()) as { error?: string };
      throw new Error(detail.error ?? `failed to load options (${response.status})`);
    }
    const data = (await response.json()) as FilterOptionResponse;
    setOptions(data);
  }

  async function fetchSummary(nextFilters: Filters) {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery(nextFilters);
      const response = await fetchWithSessionRetry(`/api/summary?${query}`);
      if (!response.ok) {
        const detail = (await response.json()) as { error?: string };
        throw new Error(detail.error ?? `failed to load summary (${response.status})`);
      }
      const data = (await response.json()) as DashboardSummaryResponse;
      setSummary(data);
      setOptions((prev) => mergeOptions(prev, extractOptionsFromSummary(data)));
      void fetchOptions().catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchOptions().catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    });
  }, []);

  useEffect(() => {
    void fetchSummary(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyPublicLink() {
    setShareMessage("공개용 링크를 생성하는 중...");
    setShareLink(null);
    try {
      const request = await fetchWithSessionRetry("/api/public-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: filters.start,
          end: filters.end,
          baselineHours: filters.baselineHours,
          workers: filters.workers,
          maps: filters.maps,
          scenarios: filters.scenarios,
        }),
      });

      const body = (await request.json()) as { url?: string; error?: string };
      if (!request.ok || !body.url) {
        throw new Error(body.error ?? `failed to create public link (${request.status})`);
      }

      setShareLink(body.url);
      try {
        await navigator.clipboard.writeText(body.url);
        setShareMessage("공개용 링크를 복사했습니다.");
      } catch (_error) {
        setShareMessage("링크 생성은 완료됐지만 자동 복사에는 실패했습니다.");
      }
    } catch (shareError) {
      setShareMessage(shareError instanceof Error ? shareError.message : "Unknown error");
    }
  }

  const qualityChartData = [
    { name: "유효", value: summary.quality.valid_hours, fill: "#23a36a" },
    { name: "실패", value: summary.quality.failed_hours, fill: "#d44b5a" },
  ];

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">데이터 수집 자동 집계 대시보드</h1>
          <p className="page-subtitle">
            Supabase 기반 중앙 모니터링 · 집계 기준 시간대: Asia/Seoul · 로그인 계정 {currentUserEmail}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="secondary" onClick={() => void copyPublicLink()}>
            공개용 링크 복사
          </button>
          <Link href="/auth/logout" prefetch={false}>
            로그아웃
          </Link>
          <Link href="/admin" prefetch={false}>
            관리자 오버라이드 설정
          </Link>
        </div>
      </header>

      {shareMessage ? (
        <section className="card" style={{ marginBottom: 14 }}>
          <p className={shareLink ? "success" : "small"}>{shareMessage}</p>
          {shareLink ? (
            <div className="share-link-box">
              <input type="text" readOnly value={shareLink} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="filters">
          <div>
            <label htmlFor="start-date">시작일</label>
            <input
              id="start-date"
              type="date"
              value={filters.start}
              onChange={(event) => setFilters((prev) => ({ ...prev, start: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="end-date">종료일</label>
            <input
              id="end-date"
              type="date"
              value={filters.end}
              onChange={(event) => setFilters((prev) => ({ ...prev, end: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="baseline-hours">기준 데이터(h)</label>
            <input
              id="baseline-hours"
              type="number"
              min="0"
              step="0.1"
              value={filters.baselineHours}
              onChange={(event) => setFilters((prev) => ({ ...prev, baselineHours: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="target-hours">수집 목표(h)</label>
            <input
              id="target-hours"
              type="number"
              min="1"
              step="0.1"
              value={filters.targetHours}
              onChange={(event) => setFilters((prev) => ({ ...prev, targetHours: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="forecast-end">목표일</label>
            <input
              id="forecast-end"
              type="date"
              value={filters.forecastEnd}
              onChange={(event) => setFilters((prev) => ({ ...prev, forecastEnd: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="forecast-window">예측 기준(최근 영업일 수)</label>
            <input
              id="forecast-window"
              type="number"
              min="1"
              max="30"
              step="1"
              value={filters.forecastWindow}
              onChange={(event) => setFilters((prev) => ({ ...prev, forecastWindow: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="worker-filter">작업자 (다중선택)</label>
            <select
              id="worker-filter"
              multiple
              size={4}
              value={filters.workers}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                setFilters((prev) => ({ ...prev, workers: values }));
              }}
            >
              {options.workers.map((worker) => (
                <option key={worker} value={worker}>
                  {worker}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="map-filter">맵 (다중선택)</label>
            <select
              id="map-filter"
              multiple
              size={4}
              value={filters.maps}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                setFilters((prev) => ({ ...prev, maps: values }));
              }}
            >
              {options.maps.map((map) => (
                <option key={map} value={map}>
                  {map}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="scenario-filter">시나리오 (다중선택)</label>
            <select
              id="scenario-filter"
              multiple
              size={4}
              value={filters.scenarios}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                setFilters((prev) => ({ ...prev, scenarios: values }));
              }}
            >
              {options.scenarios.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {scenario}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>조회</label>
            <button type="button" onClick={() => void fetchSummary(filters)} disabled={loading}>
              {loading ? "불러오는 중..." : "필터 적용"}
            </button>
          </div>
          <div>
            <label>초기화</label>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const resetFilters = createDefaultFilters(defaultSettings);
                setFilters(resetFilters);
                void fetchSummary(resetFilters);
              }}
            >
              기본값으로 초기화
            </button>
          </div>
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          예측은 최근 영업일 평균(월~금)을 기준으로 계산됩니다. 다중 선택은 macOS 기준 `command + click`으로 조작할 수 있습니다.
        </p>
        <p className="small">기준 데이터(h)는 총 데이터 시간, 달성률, 누적선에만 반영됩니다.</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="kpi-row" style={{ marginBottom: 14 }}>
        <article className="kpi">
          <div className="label">총 데이터 시간</div>
          <div className="value">{hours(dailyProjection.currentHours)}</div>
          {dailyProjection.baselineHours > 0 ? (
            <div className="small">
              세부 집계 {hours(summary.totals.total_hours)} + 기준 데이터 {hours(dailyProjection.baselineHours)}
            </div>
          ) : null}
        </article>
        <article className="kpi">
          <div className="label">목표 달성률(현재)</div>
          <div className="value">{pct(dailyProjection.currentPct)}</div>
        </article>
        <article className="kpi">
          <div className="label">목표일 예상 달성률</div>
          <div className="value">{pct(dailyProjection.projectedPct)}</div>
        </article>
        <article className="kpi">
          <div className="label">예측 영업일 수</div>
          <div className="value">{numberText(dailyProjection.forecastBusinessDays)}</div>
        </article>
      </section>

      <section className="grid">
        <article className="card span-8">
          <h2 className="chart-title">일자별 요약 (일일 + 누적)</h2>
          <p className="small" style={{ marginBottom: 10 }}>
            목표 {hours(dailyProjection.targetHours)} | 현재 누적 {hours(dailyProjection.currentHours)} | 목표일 예상 누적 {hours(dailyProjection.projectedHoursAtTargetDate)}
          </p>
          <p className="small" style={{ marginBottom: 10 }}>
            예측 영업일: {numberText(dailyProjection.forecastBusinessDays)}일
            {dailyProjection.forecastRangeLabel ? ` (${dailyProjection.forecastRangeLabel})` : ""}
            {` | 최근 ${dailyProjection.forecastWindow}영업일 평균 ${hours(dailyProjection.recentAverageHours)}/일`}
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={dailyProjection.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis yAxisId="left" tickFormatter={(value) => numberOrDash(value)} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => numberOrDash(value)} />
              <Tooltip content={<DailyChartTooltip />} />
              <Legend />
              <Bar yAxisId="left" dataKey="data_hours" name="일일 데이터(h)" fill="#1e86bf" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="actual_cumulative_hours"
                name="실적 누적"
                stroke="#216da6"
                strokeWidth={2.6}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="forecast_cumulative_hours"
                name="예측 누적"
                stroke="#f07f24"
                strokeWidth={2.4}
                strokeDasharray="6 4"
                dot={false}
              />
              <Line
                yAxisId="right"
                type="linear"
                dataKey="target_hours"
                name="목표"
                stroke="#4f96d1"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <details className="detail-block">
            <summary>상세 보기</summary>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>작업자수</th>
                    <th>작업시간(h)</th>
                    <th>데이터(h)</th>
                    <th>효율(%)</th>
                    <th>누적(h)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.daily.map((item) => (
                    <tr key={item.work_date}>
                      <td>{formatMonthDay(item.work_date)}</td>
                      <td>{item.workers}</td>
                      <td>{fixed2(item.work_hours)}</td>
                      <td>{fixed2(item.data_hours)}</td>
                      <td>{fixed2(item.efficiency_pct)}</td>
                      <td>{fixed2(item.cumulative_hours + dailyProjection.baselineHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>

        <article className="card span-4">
          <h2 className="chart-title">데이터 품질 (전체/실패/유효)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={qualityChartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={110}
                label={({ name, value }) => `${name} ${numberOrDash(value)}h`}
              />
              <Tooltip formatter={(value) => hoursOrDash(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <p className="small">
            실패 {hours(summary.quality.failed_hours)} · 유효 {hours(summary.quality.valid_hours)}
          </p>
        </article>

        <article className="card span-6">
          <h2 className="chart-title">작업자별 요약</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={summary.worker.slice(0, 20)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="worker_id" interval={0} angle={-18} dy={10} height={70} />
              <YAxis tickFormatter={(value) => numberOrDash(value)} />
              <Tooltip
                formatter={(value, name) => {
                  if (String(name).includes("효율")) return percentOrDash(value);
                  return hoursOrDash(value);
                }}
              />
              <Legend />
              <Bar dataKey="data_hours" name="데이터(h)" fill="#2d9d8f" />
              <Bar dataKey="efficiency_pct" name="효율(%)" fill="#6b5dd3" />
            </BarChart>
          </ResponsiveContainer>
          <details className="detail-block">
            <summary>상세 보기</summary>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>작업자</th>
                    <th>작업일수</th>
                    <th>작업시간(h)</th>
                    <th>데이터(h)</th>
                    <th>효율(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.worker.map((item) => (
                    <tr key={item.worker_id}>
                      <td>{item.worker_id}</td>
                      <td>{item.days}</td>
                      <td>{fixed2(item.work_hours)}</td>
                      <td>{fixed2(item.data_hours)}</td>
                      <td>{fixed2(item.efficiency_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>

        <article className="card span-6">
          <h2 className="chart-title">맵·시나리오별 요약</h2>
          <ResponsiveContainer width="100%" height={mapScenarioChartHeight}>
            <BarChart
              data={mapScenarioForChart}
              layout="vertical"
              margin={{ top: 8, right: 14, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => numberOrDash(value)} />
              <YAxis type="category" dataKey="label" width={200} interval={0} />
              <Tooltip
                formatter={(value, name, props) => {
                  if (String(name).includes("효율")) return percentOrDash(value);
                  if (String(name).includes("작업시간")) return hoursOrDash(value);
                  const eff = (props?.payload as { efficiency_pct?: number } | undefined)?.efficiency_pct;
                  return `${hoursOrDash(value)} | 효율 ${eff === undefined ? "-" : percentOrDash(eff)}`;
                }}
              />
              <Legend />
              <Bar dataKey="data_hours" name="데이터(h)" fill="#e47b39" />
            </BarChart>
          </ResponsiveContainer>
          <details className="detail-block">
            <summary>상세 보기</summary>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>맵</th>
                    <th>시나리오</th>
                    <th>작업시간(h)</th>
                    <th>데이터(h)</th>
                    <th>효율(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.mapScenario.map((item) => (
                    <tr key={`${item.map_code}-${item.scenario_code}`}>
                      <td>{item.map_code}</td>
                      <td>{item.scenario_code}</td>
                      <td>{fixed2(item.work_hours)}</td>
                      <td>{fixed2(item.data_hours)}</td>
                      <td>{fixed2(item.efficiency_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>
      </section>
    </div>
  );
}
