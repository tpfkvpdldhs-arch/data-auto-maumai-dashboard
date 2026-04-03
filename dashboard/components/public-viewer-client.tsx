"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

import type { PublicMapDetailResponse, PublicSummaryResponse, PublicViewerFilters } from "@/lib/types";

type PublicViewerClientProps = {
  token: string;
  initialFilters: PublicViewerFilters;
};

type PublicDailyChartPoint = {
  work_date: string;
  label: string;
  data_hours: number;
  cumulative_hours: number;
};

const EMPTY_SUMMARY: PublicSummaryResponse = {
  daily: [],
  maps: [],
  totals: {
    total_hours: 0,
    total_seconds: 0,
    map_count: 0,
    work_days: 0,
  },
};

function toDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthDay(rawYmd: string): string {
  const matched = rawYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return rawYmd;
  return `${Number(matched[2])}/${Number(matched[3])}`;
}

function fixed2(value: number): string {
  return value.toFixed(2);
}

function hours(value: number): string {
  return `${fixed2(value)}h`;
}

function pct(value: number): string {
  return `${fixed2(value)}%`;
}

function dailyTooltip(props: TooltipProps<number, string>) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="tooltip-box">
      <p className="tooltip-title">{label}</p>
      {payload.map((entry, index) => (
        <div className="tooltip-row" key={`${entry.dataKey}-${index}`}>
          <span>{entry.name}</span>
          <strong>{typeof entry.value === "number" ? hours(entry.value) : "-"}</strong>
        </div>
      ))}
    </div>
  );
}

export default function PublicViewerClient({
  token,
  initialFilters,
}: PublicViewerClientProps) {
  const [summaryFilters] = useState<PublicViewerFilters>(initialFilters);
  const [summary, setSummary] = useState<PublicSummaryResponse>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [mapDetail, setMapDetail] = useState<PublicMapDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const dailyChartData = useMemo(
    () =>
      summary.daily.map((item) => ({
        work_date: item.work_date,
        label: formatMonthDay(item.work_date),
        data_hours: item.data_hours,
        cumulative_hours: item.cumulative_hours + summaryFilters.baselineHours,
      })),
    [summary.daily, summaryFilters.baselineHours],
  );

  async function fetchSummary(nextFilters: PublicViewerFilters) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        token,
        start: nextFilters.start,
        end: nextFilters.end,
        baseline: String(nextFilters.baselineHours),
        _ts: String(Date.now()),
      });
      if (nextFilters.workers.length) params.set("workers", nextFilters.workers.join(","));
      if (nextFilters.maps.length) params.set("maps", nextFilters.maps.join(","));
      if (nextFilters.scenarios.length) params.set("scenarios", nextFilters.scenarios.join(","));
      const response = await fetch(`/api/public-summary?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as PublicSummaryResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in body ? body.error ?? "failed to load public summary" : "failed to load public summary");
      }
      setSummary(body as PublicSummaryResponse);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }

  async function openMapDetail(mapCode: string) {
    setSelectedMap(mapCode);
    setDetailLoading(true);
    setDetailError(null);
    setMapDetail(null);

    try {
      const params = new URLSearchParams({
        token,
        start: summaryFilters.start,
        end: summaryFilters.end,
        map: mapCode,
        baseline: String(summaryFilters.baselineHours),
        _ts: String(Date.now()),
      });
      if (summaryFilters.workers.length) params.set("workers", summaryFilters.workers.join(","));
      if (summaryFilters.scenarios.length) params.set("scenarios", summaryFilters.scenarios.join(","));
      const response = await fetch(`/api/public-map-detail?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as PublicMapDetailResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in body ? body.error ?? "failed to load map detail" : "failed to load map detail");
      }
      setMapDetail(body as PublicMapDetailResponse);
    } catch (fetchError) {
      setDetailError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void fetchSummary(summaryFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedMap) {
      setMapDetail(null);
      setDetailError(null);
      setDetailLoading(false);
    }
  }, [selectedMap]);

  const scenarioChartHeight = useMemo(() => {
    const count = mapDetail?.scenarios.length ?? 0;
    return Math.max(240, count * 36);
  }, [mapDetail?.scenarios.length]);

  const totalWithBaseline = summary.totals.total_hours + summaryFilters.baselineHours;

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">데이터 수집 현황</h1>
          <p className="page-subtitle">고객사 공유용 읽기 전용 뷰 · 집계 기준 시간대: Asia/Seoul</p>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 14 }}>
        <p className="small">
          내부 대시보드에서 선택한 필터가 고정 적용된 읽기 전용 공유 링크입니다. 날짜, 작업자, 맵, 시나리오 조건은 이 화면에서 변경할 수 없습니다.
        </p>
        <p className="small" style={{ marginTop: 8 }}>
          적용 기간: {summaryFilters.start} ~ {summaryFilters.end}
        </p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="kpi-row public-kpi-row" style={{ marginBottom: 14 }}>
        <article className="kpi">
          <div className="label">총 데이터 시간</div>
          <div className="value">{hours(totalWithBaseline)}</div>
          <div className="small">[대시보드 구현 이전 데이터 '{fixed2(summaryFilters.baselineHours)}' 시간 포함]</div>
        </article>
        <article className="kpi">
          <div className="label">집계 일수</div>
          <div className="value">{summary.totals.work_days}</div>
        </article>
        <article className="kpi">
          <div className="label">맵 수</div>
          <div className="value">{summary.totals.map_count}</div>
        </article>
      </section>

      <section className="grid">
        <article className="card span-12">
          <h2 className="chart-title">일자별 요약 (일일 + 누적)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis yAxisId="left" tickFormatter={(value) => fixed2(Number(value))} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => fixed2(Number(value))} />
              <Tooltip content={dailyTooltip} />
              <Bar yAxisId="left" dataKey="data_hours" name="일일 데이터(h)" fill="#1e86bf" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative_hours"
                name="누적 데이터(h)"
                stroke="#216da6"
                strokeWidth={2.8}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </article>

        <article className="card span-12">
          <div className="section-head">
            <div>
              <h2 className="chart-title">맵별 요약</h2>
              <p className="small">데이터 시간 기준으로 정렬됩니다. 맵을 클릭하면 시나리오별 요약을 볼 수 있습니다.</p>
            </div>
          </div>
          <div className="map-list">
            {summary.maps.map((item, index) => (
              <button
                type="button"
                key={item.map_code}
                className="map-row"
                onClick={() => void openMapDetail(item.map_code)}
              >
                <div className="map-row-top">
                  <div className="map-rank">{index + 1}</div>
                  <div className="map-meta">
                    <strong>{item.map_code}</strong>
                    <span className="small">{hours(item.data_hours)}</span>
                  </div>
                  <div className="map-share">{pct(item.share_pct)}</div>
                </div>
                <div className="map-bar">
                  <span style={{ width: `${Math.max(item.share_pct, 4)}%` }} />
                </div>
              </button>
            ))}
            {summary.maps.length === 0 ? <p className="small">선택한 기간에 집계된 맵 데이터가 없습니다.</p> : null}
          </div>
        </article>
      </section>

      {selectedMap ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedMap(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="chart-title" style={{ marginBottom: 4 }}>
                  {selectedMap} 시나리오별 요약
                </h2>
                <p className="small">
                  기간 {summaryFilters.start} ~ {summaryFilters.end}
                </p>
              </div>
              <button type="button" className="secondary modal-close" onClick={() => setSelectedMap(null)}>
                닫기
              </button>
            </div>

            {detailLoading ? <p className="small">불러오는 중...</p> : null}
            {detailError ? <p className="error">{detailError}</p> : null}

            {mapDetail ? (
              <>
                <p className="small" style={{ marginBottom: 10 }}>
                  총 데이터 시간 {hours(mapDetail.total_hours)}
                </p>
                <ResponsiveContainer width="100%" height={scenarioChartHeight}>
                  <BarChart data={mapDetail.scenarios} layout="vertical" margin={{ top: 8, right: 14, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => fixed2(Number(value))} />
                    <YAxis type="category" dataKey="scenario_code" width={180} interval={0} />
                    <Tooltip
                      formatter={(value, name, props) => {
                        if (String(name).includes("비중")) return pct(Number(value));
                        const share = (props?.payload as { share_pct?: number } | undefined)?.share_pct ?? 0;
                        return `${hours(Number(value))} | 비중 ${pct(share)}`;
                      }}
                    />
                    <Bar dataKey="data_hours" name="데이터(h)" fill="#e47b39" />
                  </BarChart>
                </ResponsiveContainer>

                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>시나리오</th>
                        <th>데이터(h)</th>
                        <th>비중(%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapDetail.scenarios.map((item) => (
                        <tr key={`${mapDetail.map_code}-${item.scenario_code}`}>
                          <td>{item.scenario_code}</td>
                          <td>{fixed2(item.data_hours)}</td>
                          <td>{fixed2(item.share_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
