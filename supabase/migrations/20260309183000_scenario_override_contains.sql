-- Switch scenario override rules from exact map_segment matches to case-insensitive contains matches.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scenario_overrides'
      and column_name = 'map_segment'
  ) then
    alter table public.scenario_overrides rename column map_segment to match_pattern;
  end if;
end $$;

create index if not exists idx_scenario_overrides_active_pattern
  on public.scenario_overrides(is_active, updated_at desc);

drop view if exists public.all_daily_metrics;
drop view if exists public.daily_metrics;

create view public.daily_metrics as
with sessions_enriched as (
  select
    rs.work_date,
    rs.worker_id,
    rs.map_code,
    coalesce(so.scenario_code, rs.scenario_code) as scenario_code,
    rs.is_failed,
    rs.duration_sec
  from public.recording_sessions rs
  left join lateral (
    select scenario_code
    from public.scenario_overrides so
    where so.is_active = true
      and position(lower(so.match_pattern) in lower(rs.map_segment)) > 0
    order by length(so.match_pattern) desc, so.updated_at desc
    limit 1
  ) so on true
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

create view public.all_daily_metrics as
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
