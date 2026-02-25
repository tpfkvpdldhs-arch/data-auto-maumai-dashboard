# Supabase Setup

## 1) Apply schema

```bash
supabase db push
```

or run SQL migration manually:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260225190000_init.sql
```

## 2) Deploy Edge Function

```bash
supabase functions deploy ingest-worker-daily --project-ref <PROJECT_REF>
```

## 3) Register workers and tokens

```sql
insert into public.workers(worker_id, display_name) values ('worker-01', 'worker-01')
on conflict do nothing;

insert into public.worker_tokens (token_hash, worker_id)
values (public.hash_worker_token('<plain token>'), 'worker-01')
on conflict (token_hash) do nothing;
```

## 4) Backfill legacy CSV

Generate SQL from `data.csv`:

```bash
python3 supabase/scripts/generate_legacy_backfill_sql.py --csv data.csv --out supabase/backfill_legacy.sql --year 2026
```

Apply:

```bash
psql "$SUPABASE_DB_URL" -f supabase/backfill_legacy.sql
```
