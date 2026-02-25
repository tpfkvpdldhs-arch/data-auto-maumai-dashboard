# Supabase 기반 일일 자동 집계 구현 결과

## 구성

- Worker PC 자동화: `automation/worker`
- Supabase 스키마/함수: `supabase/migrations`, `supabase/functions`
- 대시보드: `dashboard`

## 배포 순서

1. Supabase 스키마 적용

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260225190000_init.sql
```

2. Edge Function 배포

```bash
supabase functions deploy ingest-worker-daily --project-ref <PROJECT_REF>
```

3. worker/token 등록

```sql
insert into public.workers(worker_id, display_name) values ('worker-01', 'worker-01');
insert into public.worker_tokens(token_hash, worker_id)
values (public.hash_worker_token('<plain token>'), 'worker-01');
```

4. 기존 `data.csv` 백필

```bash
python3 supabase/scripts/generate_legacy_backfill_sql.py --csv data.csv --out supabase/backfill_legacy.sql --year 2026
psql "$SUPABASE_DB_URL" -f supabase/backfill_legacy.sql
```

5. worker PC 배치

- `automation/worker/README.md` 절차로 `/opt/data-ops` 및 `/etc/data_uploader.env` 구성
- cron `19:00 Asia/Seoul` 등록

6. 대시보드 배포

```bash
cd dashboard
npm install
cp .env.example .env.local
npm run build
npm run start
```

## 매핑 규칙

- `source_folder=bag_failed` -> `is_failed=true`
- `map_segment` prefix:
  - `r_road*` -> `scenario_code=mowing`
  - `f_outline*` -> `scenario_code=fairway_outline`
  - 그 외 -> `unknown`
- `map_segment`에서 `(east|west)\d+` 추출 -> `map_code` (없으면 `unknown`)

## 오버라이드 정책

- 기본 작업시간: 8.0h
- 예외: `worker_day_overrides`에서 `(worker_id, work_date)` 단위로 덮어쓰기
- 관리자 UI: `/admin`
