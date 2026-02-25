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

import type { DashboardSummaryResponse, FilterOptionResponse } from "@/lib/types";

type Filters = {
  start: string;
  end: string;
  workers: string[];
  maps: string[];
  scenarios: string[];
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

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function hours(value: number): string {
  return `${value.toFixed(1)}h`;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
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

export default function DashboardClient() {
  const [filters, setFilters] = useState<Filters>(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 30);

    return {
      start: toDateInput(start),
      end: toDateInput(end),
      workers: [],
      maps: [],
      scenarios: [],
    };
  });
  const [options, setOptions] = useState<FilterOptionResponse>(EMPTY_OPTIONS);
  const [summary, setSummary] = useState<DashboardSummaryResponse>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topMapScenario = useMemo(
    () =>
      summary.mapScenario.slice(0, 20).map((item) => ({
        ...item,
        label: `${item.map_code}/${item.scenario_code}`,
      })),
    [summary.mapScenario],
  );

  async function fetchOptions() {
    const response = await fetch("/api/options", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`failed to load options (${response.status})`);
    }
    const data = (await response.json()) as FilterOptionResponse;
    setOptions(data);
  }

  async function fetchSummary(nextFilters: Filters) {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery(nextFilters);
      const response = await fetch(`/api/summary?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const detail = (await response.json()) as { error?: string };
        throw new Error(detail.error ?? `failed to load summary (${response.status})`);
      }
      const data = (await response.json()) as DashboardSummaryResponse;
      setSummary(data);
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

  const qualityChartData = [
    { name: "유효", value: summary.quality.valid_hours, fill: "#23a36a" },
    { name: "실패", value: summary.quality.failed_hours, fill: "#d44b5a" },
  ];

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">데이터 수집 자동 집계 대시보드</h1>
          <p className="page-subtitle">Supabase 기반 중앙 모니터링 · 집계 기준 시간대: Asia/Seoul</p>
        </div>
        <Link href="/admin">관리자 오버라이드 설정</Link>
      </header>

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
                const end = new Date();
                const start = new Date(end);
                start.setDate(end.getDate() - 30);
                const resetFilters: Filters = {
                  start: toDateInput(start),
                  end: toDateInput(end),
                  workers: [],
                  maps: [],
                  scenarios: [],
                };
                setFilters(resetFilters);
                void fetchSummary(resetFilters);
              }}
            >
              최근 30일
            </button>
          </div>
        </div>
        <p className="small" style={{ marginTop: 8 }}>다중 선택은 macOS 기준 `command + click`으로 조작할 수 있습니다.</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="kpi-row" style={{ marginBottom: 14 }}>
        <article className="kpi">
          <div className="label">총 데이터 시간</div>
          <div className="value">{hours(summary.totals.total_hours)}</div>
        </article>
        <article className="kpi">
          <div className="label">대상 작업자 수</div>
          <div className="value">{summary.totals.worker_count}</div>
        </article>
        <article className="kpi">
          <div className="label">작업일 수</div>
          <div className="value">{summary.totals.work_days}</div>
        </article>
        <article className="kpi">
          <div className="label">실패 비율</div>
          <div className="value">{pct(summary.quality.failed_pct)}</div>
        </article>
      </section>

      <section className="grid">
        <article className="card span-8">
          <h2 className="chart-title">일자별 요약 (일일 + 누적)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={summary.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="work_date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="data_hours" name="일일 데이터(h)" fill="#1e86bf" />
              <Line yAxisId="right" type="monotone" dataKey="cumulative_hours" name="누적 데이터(h)" stroke="#f08d28" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </article>

        <article className="card span-4">
          <h2 className="chart-title">데이터 품질 (전체/실패/유효)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={qualityChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label />
              <Tooltip formatter={(value: number) => `${Number(value).toFixed(1)}h`} />
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
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="data_hours" name="데이터(h)" fill="#2d9d8f" />
              <Bar dataKey="efficiency_pct" name="효율(%)" fill="#6b5dd3" />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="card span-6">
          <h2 className="chart-title">맵·시나리오별 요약</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topMapScenario}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval={0} angle={-18} dy={10} height={70} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="data_hours" name="데이터(h)" fill="#e47b39" />
              <Bar dataKey="efficiency_pct" name="효율(%)" fill="#5a7cc0" />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="card span-12">
          <h2 className="chart-title">맵·시나리오 상세 Top 20</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>맵</th>
                  <th>시나리오</th>
                  <th>데이터(h)</th>
                  <th>작업시간(h)</th>
                  <th>효율(%)</th>
                </tr>
              </thead>
              <tbody>
                {topMapScenario.map((item) => (
                  <tr key={`${item.map_code}-${item.scenario_code}`}>
                    <td>{item.map_code}</td>
                    <td>{item.scenario_code}</td>
                    <td>{item.data_hours.toFixed(1)}</td>
                    <td>{item.work_hours.toFixed(1)}</td>
                    <td>{item.efficiency_pct.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
