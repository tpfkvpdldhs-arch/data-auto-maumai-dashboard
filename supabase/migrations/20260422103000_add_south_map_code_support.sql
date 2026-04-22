create or replace function public.extract_map_code(p_map_segment text)
returns text
language sql
immutable
as $$
  select coalesce((regexp_match(coalesce(p_map_segment, ''), '((?:east|west|north|south)[0-9]+)'))[1], 'unknown');
$$;
