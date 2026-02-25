"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { OverrideRow } from "@/lib/types";

type WorkerOption = { id: string };

function toDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const TOKEN_STORAGE_KEY = "dashboard_admin_api_token";

export default function AdminOverridesClient() {
  const [token, setToken] = useState("");
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [items, setItems] = useState<OverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(() => ({
    worker_id: "",
    work_date: toDateInput(new Date()),
    work_hours: "8.0",
    note: "",
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
    void fetch("/api/options", { cache: "no-store" })
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
      const response = await fetch(`/api/overrides?${params.toString()}`, {
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

  async function saveOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/overrides", {
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

  async function deleteOverride(workerId: string, workDate: string) {
    if (!token) {
      setError("관리자 토큰을 입력하세요.");
      return;
    }

    try {
      const response = await fetch("/api/overrides", {
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

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1 className="page-title">작업시간 오버라이드 관리</h1>
          <p className="page-subtitle">기본 8h를 특정 작업자/일자에 대해 예외 설정합니다.</p>
        </div>
        <Link href="/">대시보드로 돌아가기</Link>
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
            <label>조회</label>
            <button type="button" onClick={() => void loadOverrides()} disabled={loading}>
              {loading ? "조회 중..." : "오버라이드 조회"}
            </button>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success">{message}</p> : null}
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h2 className="chart-title">오버라이드 등록/수정</h2>
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

      <section className="card">
        <h2 className="chart-title">오버라이드 목록</h2>
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
    </div>
  );
}
