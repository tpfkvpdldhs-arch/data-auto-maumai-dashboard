#!/usr/bin/env python3
"""Run local recording aggregation and upload results to Supabase Edge Function.

This script is intended for worker PCs and designed to be triggered via cron.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

SUPPORTED_SOURCE_FOLDERS = {"bag", "bag_failed"}


@dataclass
class ParseResult:
    records: list[dict[str, Any]]
    rejected_count: int
    errors: list[str]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value


def require_env(key: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return value


def parse_timestamp_kst(raw: str, timezone: str) -> str:
    timestamp = raw.strip()
    parsed = dt.datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S.%f")
    return parsed.replace(tzinfo=ZoneInfo(timezone)).isoformat()


def parse_recording_csv(csv_path: Path, timezone: str) -> ParseResult:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    rejected_count = 0

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for index, row in enumerate(reader, start=2):
            source_folder = (row.get("source_folder") or "").strip()
            filename = (row.get("filename") or "").strip()
            start_time_raw = (row.get("start_time") or "").strip()
            end_time_raw = (row.get("end_time") or "").strip()
            duration_raw = (row.get("duration_sec") or "").strip()
            map_segment = (row.get("map_segment") or "unknown").strip() or "unknown"

            try:
                if source_folder not in SUPPORTED_SOURCE_FOLDERS:
                    raise ValueError(f"unsupported source_folder: {source_folder}")
                if not filename:
                    raise ValueError("empty filename")
                if start_time_raw.startswith("ERROR") or end_time_raw.startswith("ERROR"):
                    raise ValueError("invalid timestamp markers")

                duration_sec = float(duration_raw)
                if duration_sec < 0:
                    raise ValueError(f"negative duration: {duration_raw}")

                start_time = parse_timestamp_kst(start_time_raw, timezone)
                end_time = parse_timestamp_kst(end_time_raw, timezone)

                records.append(
                    {
                        "source_folder": source_folder,
                        "filename": filename,
                        "start_time": start_time,
                        "end_time": end_time,
                        "duration_sec": duration_sec,
                        "map_segment": map_segment,
                    }
                )
            except Exception as exc:  # noqa: BLE001 - keep row-level resilience
                rejected_count += 1
                errors.append(f"line={index}: {exc}")

    return ParseResult(records=records, rejected_count=rejected_count, errors=errors)


def run_calc_script(data_root: Path, calc_script: str) -> None:
    script_path = Path(calc_script)
    if not script_path.is_absolute():
        script_path = data_root / calc_script

    if not script_path.exists():
        raise FileNotFoundError(f"calc script not found: {script_path}")

    completed = subprocess.run(  # noqa: S603
        ["bash", str(script_path)],
        cwd=str(data_root),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "calc script failed"
            f"\nstdout:\n{completed.stdout}"
            f"\nstderr:\n{completed.stderr}"
        )


def ensure_spool_dir(raw_dir: str) -> Path:
    primary = Path(raw_dir)
    try:
        primary.mkdir(parents=True, exist_ok=True)
        test_file = primary / ".perm_check"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
        return primary
    except Exception:  # noqa: BLE001
        fallback = Path.cwd() / ".spool"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def upload_payload(
    endpoint: str,
    worker_token: str,
    payload: dict[str, Any],
    timeout_sec: int,
) -> tuple[bool, dict[str, Any] | None, str | None]:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {worker_token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:  # noqa: S310
            body = response.read().decode("utf-8")
            decoded = json.loads(body) if body else {}
            return True, decoded, None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return False, None, f"HTTP {exc.code}: {detail}"
    except Exception as exc:  # noqa: BLE001
        return False, None, str(exc)


def spool_payload(spool_dir: Path, payload: dict[str, Any]) -> Path:
    filename = f"payload_{dt.datetime.now(tz=dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex}.json"
    target = spool_dir / filename
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return target


def flush_spool(
    spool_dir: Path,
    endpoint: str,
    worker_token: str,
    timeout_sec: int,
    retry_count: int,
) -> tuple[int, int]:
    uploaded = 0
    remaining = 0

    for spool_file in sorted(spool_dir.glob("payload_*.json")):
        payload = json.loads(spool_file.read_text(encoding="utf-8"))
        success = False
        for attempt in range(retry_count + 1):
            ok, _, err = upload_payload(endpoint, worker_token, payload, timeout_sec)
            if ok:
                success = True
                break
            if attempt < retry_count:
                time.sleep(2 ** attempt)
            else:
                print(f"[warn] spool upload failed: {spool_file.name} ({err})")

        if success:
            spool_file.unlink(missing_ok=True)
            uploaded += 1
        else:
            remaining += 1

    return uploaded, remaining


def build_payload(worker_id: str, timezone: str, records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "worker_id": worker_id,
        "generated_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "timezone": timezone,
        "records": records,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect recording CSV and upload to Supabase")
    parser.add_argument("--env-file", default="/etc/data_uploader.env", help="env file path")
    parser.add_argument("--data-root", default=None, help="override DATA_ROOT")
    parser.add_argument("--calc-script", default=None, help="calc script path")
    parser.add_argument("--csv-path", default=None, help="recording_duration.csv path")
    parser.add_argument("--spool-dir", default=None, help="spool directory")
    parser.add_argument("--endpoint", default=None, help="Supabase function endpoint")
    parser.add_argument("--timezone", default=None, help="timezone for timestamp parsing")
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout seconds")
    parser.add_argument("--retry", type=int, default=2, help="retry count")
    parser.add_argument("--skip-calc", action="store_true", help="skip calc_recording_csv.sh")
    parser.add_argument("--dry-run", action="store_true", help="parse and print without uploading")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.env_file:
        load_env_file(Path(args.env_file))

    try:
        worker_id = require_env("WORKER_ID")
        supabase_url = require_env("SUPABASE_URL")
        worker_token = require_env("WORKER_TOKEN")
    except RuntimeError as exc:
        print(f"[error] {exc}")
        return 1

    timezone = args.timezone or os.getenv("TIMEZONE", "Asia/Seoul")
    data_root = Path(args.data_root or os.getenv("DATA_ROOT", "/home/worv/sim_workstation/data"))
    calc_script = args.calc_script or os.getenv("CALC_SCRIPT", "calc_recording_csv.sh")

    csv_path = Path(args.csv_path or os.getenv("RECORDING_CSV_PATH", str(data_root / "recording_duration.csv")))
    endpoint = args.endpoint or os.getenv(
        "INGEST_ENDPOINT",
        f"{supabase_url.rstrip('/')}/functions/v1/ingest-worker-daily",
    )
    spool_dir = ensure_spool_dir(args.spool_dir or os.getenv("SPOOL_DIR", "/var/lib/data_uploader/spool"))

    if not args.skip_calc:
        print(f"[info] running calc script: {calc_script}")
        try:
            run_calc_script(data_root, calc_script)
        except Exception as exc:  # noqa: BLE001
            print(f"[error] {exc}")
            return 2

    if not csv_path.exists():
        print(f"[error] CSV file not found: {csv_path}")
        return 2

    parsed = parse_recording_csv(csv_path, timezone)
    payload = build_payload(worker_id=worker_id, timezone=timezone, records=parsed.records)

    print(
        "[info] parsed records "
        f"accepted={len(parsed.records)} rejected={parsed.rejected_count} csv={csv_path}"
    )
    if parsed.errors:
        preview = parsed.errors[:5]
        print("[warn] parse errors (first 5):")
        for item in preview:
            print(f"  - {item}")

    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2)[:2000])
        return 0

    uploaded_spool, remaining_spool = flush_spool(
        spool_dir=spool_dir,
        endpoint=endpoint,
        worker_token=worker_token,
        timeout_sec=args.timeout,
        retry_count=args.retry,
    )
    if uploaded_spool:
        print(f"[info] uploaded queued payloads: {uploaded_spool}")
    if remaining_spool:
        print(f"[warn] remaining queued payloads: {remaining_spool}")

    success = False
    response_json: dict[str, Any] | None = None
    last_error: str | None = None
    for attempt in range(args.retry + 1):
        ok, body, err = upload_payload(endpoint, worker_token, payload, args.timeout)
        if ok:
            success = True
            response_json = body
            break
        last_error = err
        if attempt < args.retry:
            wait_sec = 2 ** attempt
            print(f"[warn] upload failed (attempt {attempt + 1}), retry in {wait_sec}s: {err}")
            time.sleep(wait_sec)

    if not success:
        spool_file = spool_payload(spool_dir, payload)
        print(f"[error] upload failed: {last_error}")
        print(f"[info] payload queued: {spool_file}")
        return 3

    if response_json is None:
        response_json = {}

    print(
        "[done] upload success "
        f"accepted={response_json.get('accepted_count', 'n/a')} "
        f"duplicate={response_json.get('duplicate_count', 'n/a')} "
        f"rejected={response_json.get('rejected_count', parsed.rejected_count)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
