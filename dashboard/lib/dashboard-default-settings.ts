import type { DashboardDefaultSettingsRow } from "./types";
import { createSupabaseAdminClient } from "./supabase-admin";

const SETTINGS_KEY = "global";

export const DEFAULT_DASHBOARD_SETTINGS: DashboardDefaultSettingsRow = {
  settings_key: SETTINGS_KEY,
  forecast_end: "2026-04-17",
  target_hours: 400,
  baseline_hours: 24.7,
  updated_at: new Date(0).toISOString(),
};

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(raw: unknown, fallback: string): string {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function normalizeSettingsRow(raw?: Partial<DashboardDefaultSettingsRow> | null): DashboardDefaultSettingsRow {
  return {
    settings_key: SETTINGS_KEY,
    forecast_end: normalizeDate(raw?.forecast_end, DEFAULT_DASHBOARD_SETTINGS.forecast_end),
    target_hours: toFiniteNumber(raw?.target_hours, DEFAULT_DASHBOARD_SETTINGS.target_hours),
    baseline_hours: toFiniteNumber(raw?.baseline_hours, DEFAULT_DASHBOARD_SETTINGS.baseline_hours),
    updated_at:
      typeof raw?.updated_at === "string" && raw.updated_at.trim()
        ? raw.updated_at
        : DEFAULT_DASHBOARD_SETTINGS.updated_at,
  };
}

export async function fetchDashboardDefaultSettings(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<{ data: DashboardDefaultSettingsRow; error: string | null }> {
  const { data, error } = await supabase
    .from("dashboard_default_settings")
    .select("settings_key, forecast_end, target_hours, baseline_hours, updated_at")
    .eq("settings_key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    return { data: DEFAULT_DASHBOARD_SETTINGS, error: error.message };
  }

  return { data: normalizeSettingsRow(data ?? null), error: null };
}
