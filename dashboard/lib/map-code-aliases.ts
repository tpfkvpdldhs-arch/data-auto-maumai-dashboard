import type { DailyMetricRow, MapCodeAliasRow } from "./types";
import { createSupabaseAdminClient } from "./supabase-admin";

export type MapCodeAliasMap = Map<string, string>;

export function normalizeMapCode(raw: string | null | undefined): string {
  const value = raw?.trim().toLowerCase();
  return value || "unknown";
}

function resolveCanonicalMapCode(rawMapCode: string, aliasMap: MapCodeAliasMap): string {
  let current = normalizeMapCode(rawMapCode);
  const visited = new Set<string>();

  while (aliasMap.has(current) && !visited.has(current)) {
    visited.add(current);
    current = aliasMap.get(current) ?? current;
  }

  return current;
}

export async function fetchMapCodeAliases(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<{ data: MapCodeAliasRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("map_code_aliases")
    .select("alias_map_code, canonical_map_code, note, is_active, updated_at")
    .order("updated_at", { ascending: false })
    .order("alias_map_code", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  const normalized = (data ?? []).map((row) => ({
    alias_map_code: normalizeMapCode(String(row.alias_map_code ?? "")),
    canonical_map_code: normalizeMapCode(String(row.canonical_map_code ?? "")),
    note: row.note ? String(row.note) : null,
    is_active: Boolean(row.is_active),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  }));

  return { data: normalized, error: null };
}

export async function fetchActiveMapCodeAliasMap(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<{ data: MapCodeAliasMap; error: string | null }> {
  const aliases = await fetchMapCodeAliases(supabase);
  if (aliases.error) {
    return { data: new Map<string, string>(), error: aliases.error };
  }

  const aliasMap: MapCodeAliasMap = new Map();
  for (const item of aliases.data) {
    if (!item.is_active) continue;
    aliasMap.set(item.alias_map_code, item.canonical_map_code);
  }

  return { data: aliasMap, error: null };
}

export function applyMapCodeAliases(rows: DailyMetricRow[], aliasMap: MapCodeAliasMap): DailyMetricRow[] {
  return rows.map((row) => ({
    ...row,
    map_code: resolveCanonicalMapCode(row.map_code, aliasMap),
  }));
}

export function filterMetricRows(
  rows: DailyMetricRow[],
  filters: {
    workerIds?: string[];
    mapCodes?: string[];
    scenarioCodes?: string[];
  },
): DailyMetricRow[] {
  const workerSet = filters.workerIds?.length ? new Set(filters.workerIds.map((item) => item.trim()).filter(Boolean)) : null;
  const mapSet = filters.mapCodes?.length ? new Set(filters.mapCodes.map((item) => normalizeMapCode(item))) : null;
  const scenarioSet = filters.scenarioCodes?.length
    ? new Set(filters.scenarioCodes.map((item) => item.trim()).filter(Boolean))
    : null;

  return rows.filter((row) => {
    if (workerSet && !workerSet.has(row.worker_id)) return false;
    if (mapSet && !mapSet.has(normalizeMapCode(row.map_code))) return false;
    if (scenarioSet && !scenarioSet.has(row.scenario_code)) return false;
    return true;
  });
}
