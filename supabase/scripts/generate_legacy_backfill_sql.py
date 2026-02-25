#!/usr/bin/env python3
"""Generate SQL for backfilling public.legacy_daily_metrics from data.csv."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
from pathlib import Path


def parse_date(raw: str, default_year: int) -> str:
    value = raw.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"):
        try:
            return dt.datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass

    month, day = value.replace("-", "/").replace(".", "/").split("/")
    return dt.date(default_year, int(month), int(day)).isoformat()


def normalize_map(raw: str) -> str:
    value = (raw or "").strip().lower()
    return value or "unknown"


def normalize_scenario(raw: str) -> str:
    value = (raw or "").strip().lower()
    if value in {"mowing", "fairway_outline"}:
        return value
    return value or "unknown"


def escape_literal(value: str) -> str:
    return value.replace("'", "''")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate legacy backfill SQL")
    parser.add_argument("--csv", default="data.csv", help="source CSV path")
    parser.add_argument("--out", default="supabase/backfill_legacy.sql", help="output SQL path")
    parser.add_argument("--year", type=int, default=2026, help="default year for M/D dates")
    args = parser.parse_args()

    source = Path(args.csv)
    if not source.exists():
        raise FileNotFoundError(f"CSV not found: {source}")

    rows: list[str] = []
    workers: set[str] = set()

    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            work_date = parse_date((row.get("날짜") or "").strip(), args.year)
            worker = (row.get("작업자") or "").strip()
            map_code = normalize_map(row.get("맵") or "")
            scenario_code = normalize_scenario(row.get("시나리오") or "")
            work_hours = float((row.get("작업시간h") or "0").strip() or 0)
            data_seconds = int(float((row.get("데이터시간s") or "0").strip() or 0))
            failed = ((row.get("실패여부") or "").strip().lower() == "failed")

            if not worker:
                worker = "unknown"

            workers.add(worker)
            rows.append(
                "(" + ", ".join(
                    [
                        f"'{escape_literal(work_date)}'::date",
                        f"'{escape_literal(worker)}'",
                        f"'{escape_literal(map_code)}'",
                        f"'{escape_literal(scenario_code)}'",
                        str(data_seconds),
                        f"{work_hours:.2f}",
                        "true" if failed else "false",
                    ]
                ) + ")"
            )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    worker_values = ",\n  ".join(
        f"('{escape_literal(worker)}', '{escape_literal(worker)}', true)" for worker in sorted(workers)
    )
    metric_values = ",\n  ".join(rows)

    sql = f"""-- Generated from {source}
begin;

insert into public.workers (worker_id, display_name, is_active)
values
  {worker_values}
on conflict (worker_id) do update set
  display_name = excluded.display_name,
  is_active = true;

insert into public.legacy_daily_metrics (
  work_date,
  worker_id,
  map_code,
  scenario_code,
  data_seconds,
  work_hours,
  is_failed
)
values
  {metric_values}
on conflict (work_date, worker_id, map_code, scenario_code, is_failed)
do update set
  data_seconds = excluded.data_seconds,
  work_hours = excluded.work_hours;

commit;
"""

    out_path.write_text(sql, encoding="utf-8")
    print(f"[done] wrote SQL: {out_path}")
    print(f"[done] workers={len(workers)} rows={len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
