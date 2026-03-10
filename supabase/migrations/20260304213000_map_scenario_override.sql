-- Extend ingestion schema for map/scenario source tracking and manual scenario overrides.

alter table public.recording_sessions
  add column if not exists map_name text,
  add column if not exists scenario_input text,
  add column if not exists map_code_source text not null default 'derived',
  add column if not exists scenario_source text not null default 'derived';

create index if not exists idx_recording_sessions_map_segment on public.recording_sessions(map_segment);

create table if not exists public.scenario_overrides (
  map_segment text primary key,
  scenario_code text not null,
  note text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_scenario_overrides_active_segment
  on public.scenario_overrides(map_segment, is_active);

create or replace function public.extract_map_code(p_map_segment text)
returns text
language sql
immutable
as $$
  select coalesce((regexp_match(coalesce(p_map_segment, ''), '((?:east|west|north)[0-9]+)'))[1], 'unknown');
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
with sessions_enriched as (
  select
    rs.work_date,
    rs.worker_id,
    rs.map_code,
    coalesce(so.scenario_code, rs.scenario_code) as scenario_code,
    rs.is_failed,
    rs.duration_sec
  from public.recording_sessions rs
  left join public.scenario_overrides so
    on so.map_segment = rs.map_segment
   and so.is_active = true
),
grouped as (
  select
    se.work_date,
    se.worker_id,
    se.map_code,
    se.scenario_code,
    se.is_failed,
    sum(se.duration_sec)::bigint as data_seconds,
    count(*)::integer as recording_count
  from sessions_enriched se
  group by se.work_date, se.worker_id, se.map_code, se.scenario_code, se.is_failed
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

alter table public.scenario_overrides enable row level security;

drop policy if exists "service role full access scenario overrides" on public.scenario_overrides;
create policy "service role full access scenario overrides"
  on public.scenario_overrides for all to service_role using (true) with check (true);

drop policy if exists "admin can read scenario overrides" on public.scenario_overrides;
create policy "admin can read scenario overrides"
  on public.scenario_overrides
  for select to authenticated
  using ((auth.jwt() ->> 'app_role') = 'admin');

drop policy if exists "admin can upsert scenario overrides" on public.scenario_overrides;
create policy "admin can upsert scenario overrides"
  on public.scenario_overrides
  for all to authenticated
  using ((auth.jwt() ->> 'app_role') = 'admin')
  with check ((auth.jwt() ->> 'app_role') = 'admin');
