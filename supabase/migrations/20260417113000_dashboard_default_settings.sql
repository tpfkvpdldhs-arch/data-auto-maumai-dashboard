create table if not exists public.dashboard_default_settings (
  settings_key text primary key check (settings_key = 'global'),
  forecast_end date not null,
  target_hours numeric(8,2) not null check (target_hours >= 0),
  baseline_hours numeric(8,2) not null check (baseline_hours >= 0),
  updated_at timestamptz not null default now()
);

insert into public.dashboard_default_settings (
  settings_key,
  forecast_end,
  target_hours,
  baseline_hours,
  updated_at
)
values (
  'global',
  date '2026-04-17',
  400.0,
  24.7,
  now()
)
on conflict (settings_key) do nothing;

alter table public.dashboard_default_settings enable row level security;

drop policy if exists "service role full access dashboard default settings" on public.dashboard_default_settings;
create policy "service role full access dashboard default settings"
  on public.dashboard_default_settings for all to service_role using (true) with check (true);

drop policy if exists "admin can read dashboard default settings" on public.dashboard_default_settings;
create policy "admin can read dashboard default settings"
  on public.dashboard_default_settings
  for select to authenticated
  using ((auth.jwt() ->> 'app_role') = 'admin');

drop policy if exists "admin can upsert dashboard default settings" on public.dashboard_default_settings;
create policy "admin can upsert dashboard default settings"
  on public.dashboard_default_settings
  for all to authenticated
  using ((auth.jwt() ->> 'app_role') = 'admin')
  with check ((auth.jwt() ->> 'app_role') = 'admin');
