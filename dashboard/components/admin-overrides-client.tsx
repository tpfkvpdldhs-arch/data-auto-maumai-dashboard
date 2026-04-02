"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { fetchWithSessionRetry } from "@/lib/client-auth-fetch";
import type { MapCodeAliasRow, OverrideRow, ScenarioOverrideRow } from "@/lib/types";

type WorkerOption = { id: string };

type UnknownScenarioCandidate = {
  map_segment: string;
  records: number;
  data_seconds: number;
  data_hours: number;
};

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const TOKEN_STORAGE_KEY = "dashboard_admin_api_token";

export default function AdminOverridesClient() {
  const [token, setToken] = useState("");
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [items, setItems] = useState<OverrideRow[]>([]);
  const [scenarioItems, setScenarioItems] = useState<ScenarioOverrideRow[]>([]);
  const [mapAliasItems, setMapAliasItems] = useState<MapCodeAliasRow[]>([]);
  const [unknownCandidates, setUnknownCandidates] = useState<UnknownScenarioCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(() => ({
    worker_id: "",
    work_date: toDateInput(new Date()),
    work_hours: "8.0",
    note: "",
  }));

  const [scenarioForm, setScenarioForm] = useState(() => ({
    match_pattern: "",
    scenario_code: "",
    note: "",
    is_active: true,
  }));

  const [mapAliasForm, setMapAliasForm] = useState(() => ({
    alias_map_code: "",
    canonical_map_code: "",
    note: "",
    is_active: true,
  }));

  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 60);
    return {
      start: toDateInput(start),
      end: toDateInput(end),
    };
  });

  useEffect(() => {
    const cached = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (cached) setToken(cached);
  }, []);

  useEffect(() => {
    void fetchWithSessionRetry("/api/options")
      .then(async (response) => {
        if (!response.ok) throw new Error(`failed to load workers (${response.status})`);
        const data = (await response.json()) as { workers: string[] };
        const options = data.workers.map((id) => ({ id }));
        setWorkers(options);
        if (options.length > 0) {
          setForm((prev) => ({ ...prev, worker_id: prev.worker_id || options[0].id }));
        }
      })
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
      });
  }, []);

  async function loadOverrides() {
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);

    try {
      const params = new URLSearchParams({
        start: range.start,
        end: range.end,
      });
      const response = await fetchWithSessionRetry(`/api/overrides?${params.toString()}`, {
        headers: {
          "x-admin-token": token,
        },
      });
      const body = (await response.json()) as { items?: OverrideRow[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to fetch overrides (${response.status})`);
      }
      setItems(body.items ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadScenarioOverrides() {
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);

    try {
      const response = await fetchWithSessionRetry("/api/scenario-overrides?unknown_days=30&unknown_limit=20", {
        headers: {
          "x-admin-token": token,
        },
      });
      const body = (await response.json()) as {
        items?: ScenarioOverrideRow[];
        unknown_candidates?: UnknownScenarioCandidate[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to fetch scenario overrides (${response.status})`);
      }
      setScenarioItems(body.items ?? []);
      setUnknownCandidates(body.unknown_candidates ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadMapAliases() {
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);

    try {
      const response = await fetchWithSessionRetry("/api/map-aliases", {
        headers: {
          "x-admin-token": token,
        },
      });
      const body = (await response.json()) as { items?: MapCodeAliasRow[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to fetch map aliases (${response.status})`);
      }
      setMapAliasItems(body.items ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function saveOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetchWithSessionRetry("/api/overrides", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          worker_id: form.worker_id,
          work_date: form.work_date,
          work_hours: Number(form.work_hours),
          note: form.note,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to save override (${response.status})`);
      }
      setMessage("저장되었습니다.");
      await loadOverrides();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    }
  }

  async function saveScenarioOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetchWithSessionRetry("/api/scenario-overrides", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          match_pattern: scenarioForm.match_pattern,
          scenario_code: scenarioForm.scenario_code,
          note: scenarioForm.note,
          is_active: scenarioForm.is_active,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to save scenario override (${response.status})`);
      }
      setMessage("시나리오 규칙이 저장되었습니다.");
      await loadScenarioOverrides();
      setScenarioForm((prev) => ({ ...prev, match_pattern: "", scenario_code: "", note: "" }));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    }
  }

  async function saveMapAlias(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetchWithSessionRetry("/api/map-aliases", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          alias_map_code: mapAliasForm.alias_map_code,
          canonical_map_code: mapAliasForm.canonical_map_code,
          note: mapAliasForm.note,
          is_active: mapAliasForm.is_active,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to save map alias (${response.status})`);
      }
      setMessage("맵 alias 규칙이 저장되었습니다.");
      await loadMapAliases();
      setMapAliasForm((prev) => ({ ...prev, alias_map_code: "", canonical_map_code: "", note: "" }));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    }
  }

  async function deleteOverride(workerId: string, workDate: string) {
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    try {
      const response = await fetchWithSessionRetry("/api/overrides", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ worker_id: workerId, work_date: workDate }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to delete override (${response.status})`);
      }
      setMessage("삭제되었습니다.");
      await loadOverrides();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    }
  }

  async function deleteScenarioOverride(matchPattern: string) {
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    try {
      const response = await fetchWithSessionRetry("/api/scenario-overrides", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ match_pattern: matchPattern }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to delete scenario override (${response.status})`);
      }
      setMessage("시나리오 규칙이 삭제되었습니다.");
      await loadScenarioOverrides();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    }
  }

  async function deleteMapAlias(aliasMapCode: string) {
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    try {
      const response = await fetchWithSessionRetry("/api/map-aliases", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ alias_map_code: aliasMapCode }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `failed to delete map alias (${response.status})`);
      }
      setMessage("맵 alias 규칙이 삭제되었습니다.");
      await loadMapAliases();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    }
  }

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">작업시간/시나리오 오버라이드 관리</h1>
          <p className="page-subtitle">작업시간 예외, map_segment 시나리오 규칙, map_code alias 묶음을 관리합니다.</p>
        </div>
        <Link href="/" prefetch={false}>
          대시보드로 돌아가기
        </Link>
      </header>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="filters">
          <div>
            <label htmlFor="admin-token">관리자 토큰</label>
            <input
              id="admin-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="ADMIN_API_TOKEN"
            />
          </div>
          <div>
            <label htmlFor="range-start">조회 시작일</label>
            <input
              id="range-start"
              type="date"
              value={range.start}
              onChange={(event) => setRange((prev) => ({ ...prev, start: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="range-end">조회 종료일</label>
            <input
              id="range-end"
              type="date"
              value={range.end}
              onChange={(event) => setRange((prev) => ({ ...prev, end: event.target.value }))}
            />
          </div>
          <div>
            <label>작업시간 조회</label>
            <button type="button" onClick={() => void loadOverrides()} disabled={loading}>
              {loading ? "조회 중..." : "작업시간 오버라이드 조회"}
            </button>
          </div>
          <div>
            <label>시나리오 조회</label>
            <button type="button" onClick={() => void loadScenarioOverrides()} disabled={loading}>
              {loading ? "조회 중..." : "시나리오 규칙 조회"}
            </button>
          </div>
          <div>
            <label>맵 alias 조회</label>
            <button type="button" onClick={() => void loadMapAliases()} disabled={loading}>
              {loading ? "조회 중..." : "맵 alias 조회"}
            </button>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success">{message}</p> : null}
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="chart-title">작업시간 오버라이드 등록/수정</h2>
        <form onSubmit={saveOverride} className="filters">
          <div>
            <label htmlFor="worker">작업자</label>
            <select
              id="worker"
              value={form.worker_id}
              onChange={(event) => setForm((prev) => ({ ...prev, worker_id: event.target.value }))}
            >
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="work-date">작업일</label>
            <input
              id="work-date"
              type="date"
              value={form.work_date}
              onChange={(event) => setForm((prev) => ({ ...prev, work_date: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="work-hours">작업시간(h)</label>
            <input
              id="work-hours"
              type="number"
              min="0"
              step="0.25"
              value={form.work_hours}
              onChange={(event) => setForm((prev) => ({ ...prev, work_hours: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="note">메모</label>
            <input
              id="note"
              type="text"
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="예: 반차"
            />
          </div>
          <div>
            <label>저장</label>
            <button type="submit">오버라이드 저장</button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="chart-title">시나리오 규칙 등록/수정</h2>
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          대소문자는 무시되며, 여러 규칙이 맞으면 더 긴 패턴이 우선 적용됩니다.
        </p>
        <form onSubmit={saveScenarioOverride} className="filters">
          <div>
            <label htmlFor="match-pattern">포함 패턴</label>
            <input
              id="match-pattern"
              type="text"
              value={scenarioForm.match_pattern}
              onChange={(event) => setScenarioForm((prev) => ({ ...prev, match_pattern: event.target.value }))}
              placeholder="예: road_west"
            />
          </div>
          <div>
            <label htmlFor="scenario-code">scenario_code</label>
            <input
              id="scenario-code"
              type="text"
              value={scenarioForm.scenario_code}
              onChange={(event) => setScenarioForm((prev) => ({ ...prev, scenario_code: event.target.value }))}
              placeholder="예: mowing"
            />
          </div>
          <div>
            <label htmlFor="scenario-note">메모</label>
            <input
              id="scenario-note"
              type="text"
              value={scenarioForm.note}
              onChange={(event) => setScenarioForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="예: 신규 규칙"
            />
          </div>
          <div>
            <label htmlFor="scenario-active">활성</label>
            <select
              id="scenario-active"
              value={scenarioForm.is_active ? "true" : "false"}
              onChange={(event) =>
                setScenarioForm((prev) => ({
                  ...prev,
                  is_active: event.target.value === "true",
                }))
              }
            >
              <option value="true">활성</option>
              <option value="false">비활성</option>
            </select>
          </div>
          <div>
            <label>저장</label>
            <button type="submit">시나리오 규칙 저장</button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="chart-title">맵 alias 등록/수정</h2>
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          map_code exact match 기준으로 raw 이름을 canonical 이름으로 묶습니다. 저장 시 소문자/trim 기준으로 정규화됩니다.
        </p>
        <form onSubmit={saveMapAlias} className="filters">
          <div>
            <label htmlFor="alias-map-code">alias map_code</label>
            <input
              id="alias-map-code"
              type="text"
              value={mapAliasForm.alias_map_code}
              onChange={(event) => setMapAliasForm((prev) => ({ ...prev, alias_map_code: event.target.value }))}
              placeholder="예: east123"
            />
          </div>
          <div>
            <label htmlFor="canonical-map-code">canonical map_code</label>
            <input
              id="canonical-map-code"
              type="text"
              value={mapAliasForm.canonical_map_code}
              onChange={(event) =>
                setMapAliasForm((prev) => ({ ...prev, canonical_map_code: event.target.value }))
              }
              placeholder="예: east12"
            />
          </div>
          <div>
            <label htmlFor="map-alias-note">메모</label>
            <input
              id="map-alias-note"
              type="text"
              value={mapAliasForm.note}
              onChange={(event) => setMapAliasForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="예: 맵 명칭 변경"
            />
          </div>
          <div>
            <label htmlFor="map-alias-active">활성</label>
            <select
              id="map-alias-active"
              value={mapAliasForm.is_active ? "true" : "false"}
              onChange={(event) =>
                setMapAliasForm((prev) => ({
                  ...prev,
                  is_active: event.target.value === "true",
                }))
              }
            >
              <option value="true">활성</option>
              <option value="false">비활성</option>
            </select>
          </div>
          <div>
            <label>저장</label>
            <button type="submit">맵 alias 저장</button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="chart-title">작업시간 오버라이드 목록</h2>
        <table className="table">
          <thead>
            <tr>
              <th>작업자</th>
              <th>작업일</th>
              <th>작업시간(h)</th>
              <th>메모</th>
              <th>수정시각</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.worker_id}-${item.work_date}`}>
                <td>{item.worker_id}</td>
                <td>{item.work_date}</td>
                <td>{Number(item.work_hours).toFixed(2)}</td>
                <td>{item.note ?? ""}</td>
                <td>{new Date(item.updated_at).toLocaleString("ko-KR")}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void deleteOverride(item.worker_id, item.work_date)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="chart-title">시나리오 규칙 목록</h2>
        <table className="table">
          <thead>
            <tr>
              <th>포함 패턴</th>
              <th>scenario_code</th>
              <th>활성</th>
              <th>메모</th>
              <th>수정시각</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {scenarioItems.map((item) => (
              <tr key={item.match_pattern}>
                <td>{item.match_pattern}</td>
                <td>{item.scenario_code}</td>
                <td>{item.is_active ? "Y" : "N"}</td>
                <td>{item.note ?? ""}</td>
                <td>{new Date(item.updated_at).toLocaleString("ko-KR")}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void deleteScenarioOverride(item.match_pattern)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="chart-title">맵 alias 목록</h2>
        <table className="table">
          <thead>
            <tr>
              <th>alias map_code</th>
              <th>canonical map_code</th>
              <th>활성</th>
              <th>메모</th>
              <th>수정시각</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {mapAliasItems.map((item) => (
              <tr key={item.alias_map_code}>
                <td>{item.alias_map_code}</td>
                <td>{item.canonical_map_code}</td>
                <td>{item.is_active ? "Y" : "N"}</td>
                <td>{item.note ?? ""}</td>
                <td>{new Date(item.updated_at).toLocaleString("ko-KR")}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void deleteMapAlias(item.alias_map_code)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="chart-title">최근 미분류 map_segment (unknown 우선)</h2>
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          폼 채우기는 전체 문자열을 넣습니다. 저장 전에 더 짧은 공통 패턴으로 줄여도 됩니다.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>map_segment</th>
              <th>레코드 수</th>
              <th>데이터(h)</th>
              <th>빠른 등록</th>
            </tr>
          </thead>
          <tbody>
            {unknownCandidates.map((item) => (
              <tr key={item.map_segment}>
                <td>{item.map_segment}</td>
                <td>{item.records}</td>
                <td>{item.data_hours.toFixed(2)}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setScenarioForm({
                        match_pattern: item.map_segment,
                        scenario_code: "unknown",
                        note: "unknown 후보에서 추가",
                        is_active: true,
                      })
                    }
                  >
                    폼 채우기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
