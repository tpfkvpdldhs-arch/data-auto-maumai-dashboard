create table if not exists public.map_code_aliases (
  alias_map_code text primary key,
  canonical_map_code text not null,
  note text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_map_code_aliases_active_updated
  on public.map_code_aliases(is_active, updated_at desc);

alter table public.map_code_aliases enable row level security;

drop policy if exists "service role full access map code aliases" on public.map_code_aliases;
create policy "service role full access map code aliases"
  on public.map_code_aliases for all to service_role using (true) with check (true);

comment on table public.map_code_aliases is
'Alias rules that canonicalize raw map_code values at dashboard aggregation time.';

comment on column public.map_code_aliases.alias_map_code is
'Raw map_code value to match exactly after trim/lower normalization.';

comment on column public.map_code_aliases.canonical_map_code is
'Canonical map_code used for dashboard aggregation and filtering.';
