-- Supabase schema for worker daily ingestion and dashboard aggregation.

create extension if not exists pgcrypto;

create table if not exists public.workers (
  worker_id text primary key,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.worker_tokens (
  token_hash text primary key,
  worker_id text not null references public.workers(worker_id) on delete cascade,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(token_hash) = 64)
);

create table if not exists public.recording_sessions (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null references public.workers(worker_id) on delete restrict,
  source_folder text not null check (source_folder in ('bag', 'bag_failed')),
  filename text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_sec double precision not null check (duration_sec >= 0),
  map_segment text not null default 'unknown',
  map_code text not null default 'unknown',
  scenario_code text not null default 'unknown',
  is_failed boolean not null,
  work_date date not null,
  ingested_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  unique (worker_id, source_folder, filename, start_time)
);

create index if not exists idx_recording_sessions_work_date on public.recording_sessions(work_date);
create index if not exists idx_recording_sessions_worker_date on public.recording_sessions(worker_id, work_date);
create index if not exists idx_recording_sessions_map_scenario on public.recording_sessions(map_code, scenario_code);

create table if not exists public.worker_day_overrides (
  worker_id text not null references public.workers(worker_id) on delete cascade,
  work_date date not null,
  work_hours numeric(6,2) not null check (work_hours >= 0),
  note text,
  updated_at timestamptz not null default now(),
  primary key (worker_id, work_date)
);

create table if not exists public.legacy_daily_metrics (
  work_date date not null,
  worker_id text not null,
  map_code text not null,
  scenario_code text not null,
  data_seconds integer not null check (data_seconds >= 0),
  work_hours numeric(6,2) not null check (work_hours >= 0),
  is_failed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (work_date, worker_id, map_code, scenario_code, is_failed)
);

create or replace function public.hash_worker_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.extract_map_code(p_map_segment text)
returns text
language sql
immutable
as $$
  select coalesce((regexp_match(coalesce(p_map_segment, ''), '((?:east|west)[0-9]+)'))[1], 'unknown');
$$;

create or replace function public.extract_scenario_code(p_map_segment text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_map_segment, '') like 'r_road%' then 'mowing'
    when coalesce(p_map_segment, '') like 'f_outline%' then 'fairway_outline'
    else 'unknown'
  end;
$$;

create or replace view public.daily_metrics as
with grouped as (
  select
    rs.work_date,
    rs.worker_id,
    rs.map_code,
    rs.scenario_code,
    rs.is_failed,
    sum(rs.duration_sec)::bigint as data_seconds,
    count(*)::integer as recording_count
  from public.recording_sessions rs
  group by rs.work_date, rs.worker_id, rs.map_code, rs.scenario_code, rs.is_failed
),
worker_day as (
  select
    rs.work_date,
    rs.worker_id,
    sum(rs.duration_sec)::numeric as total_seconds,
    coalesce(wdo.work_hours, 8.0)::numeric as day_work_hours
  from public.recording_sessions rs
  left join public.worker_day_overrides wdo
    on wdo.worker_id = rs.worker_id
   and wdo.work_date = rs.work_date
  group by rs.work_date, rs.worker_id, wdo.work_hours
)
select
  g.work_date,
  g.worker_id,
  g.map_code,
  g.scenario_code,
  g.is_failed,
  g.data_seconds,
  g.recording_count,
  wd.day_work_hours,
  wd.total_seconds as worker_day_total_seconds,
  case
    when wd.total_seconds > 0 then round((wd.day_work_hours * (g.data_seconds::numeric / wd.total_seconds))::numeric, 4)
    else 0::numeric
  end as allocated_work_hours
from grouped g
join worker_day wd
  on wd.work_date = g.work_date
 and wd.worker_id = g.worker_id;

create or replace view public.all_daily_metrics as
select
  dm.work_date,
  dm.worker_id,
  dm.map_code,
  dm.scenario_code,
  dm.is_failed,
  dm.data_seconds,
  dm.recording_count,
  dm.day_work_hours,
  dm.allocated_work_hours,
  'ingested'::text as data_source
from public.daily_metrics dm
union all
select
  lm.work_date,
  lm.worker_id,
  lm.map_code,
  lm.scenario_code,
  lm.is_failed,
  lm.data_seconds::bigint as data_seconds,
  0::integer as recording_count,
  lm.work_hours::numeric as day_work_hours,
  lm.work_hours::numeric as allocated_work_hours,
  'legacy'::text as data_source
from public.legacy_daily_metrics lm;

alter table public.workers enable row level security;
alter table public.worker_tokens enable row level security;
alter table public.recording_sessions enable row level security;
alter table public.worker_day_overrides enable row level security;
alter table public.legacy_daily_metrics enable row level security;

-- Service role is used by Edge Functions and server-side dashboard API.
drop policy if exists "service role full access workers" on public.workers;
create policy "service role full access workers"
  on public.workers for all to service_role using (true) with check (true);

drop policy if exists "service role full access worker tokens" on public.worker_tokens;
create policy "service role full access worker tokens"
  on public.worker_tokens for all to service_role using (true) with check (true);

drop policy if exists "service role full access recording sessions" on public.recording_sessions;
create policy "service role full access recording sessions"
  on public.recording_sessions for all to service_role using (true) with check (true);

drop policy if exists "service role full access day overrides" on public.worker_day_overrides;
create policy "service role full access day overrides"
  on public.worker_day_overrides for all to service_role using (true) with check (true);

drop policy if exists "service role full access legacy metrics" on public.legacy_daily_metrics;
create policy "service role full access legacy metrics"
  on public.legacy_daily_metrics for all to service_role using (true) with check (true);

-- Optional authenticated read for worker list (for UI labels).
drop policy if exists "authenticated can read workers" on public.workers;
create policy "authenticated can read workers"
  on public.workers for select to authenticated using (true);

-- Optional admin claim based override management from non-service clients.
drop policy if exists "admin can read overrides" on public.worker_day_overrides;
create policy "admin can read overrides"
  on public.worker_day_overrides
  for select to authenticated
  using ((auth.jwt() ->> 'app_role') = 'admin');

drop policy if exists "admin can upsert overrides" on public.worker_day_overrides;
create policy "admin can upsert overrides"
  on public.worker_day_overrides
  for all to authenticated
  using ((auth.jwt() ->> 'app_role') = 'admin')
  with check ((auth.jwt() ->> 'app_role') = 'admin');

comment on view public.daily_metrics is
'Per-day aggregated metrics from recording_sessions with default 8h worker day and override support.';

comment on view public.all_daily_metrics is
'Union view combining ingested daily_metrics and backfilled legacy_daily_metrics.';
