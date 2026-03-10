import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function verifyAdminToken(req: NextRequest): string | null {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    return "ADMIN_API_TOKEN is not configured";
  }

  const token = req.headers.get("x-admin-token");
  if (!token || token !== expected) {
    return "invalid admin token";
  }

  return null;
}

function deriveScenarioFromSegment(mapSegment: string): string {
  if (mapSegment.startsWith("r_road")) return "mowing";
  if (mapSegment.startsWith("f_outline")) return "fairway_outline";
  return "unknown";
}

function dateDaysAgo(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now.toISOString().slice(0, 10);
}

type ScenarioOverrideRule = {
  match_pattern: string;
  scenario_code: string;
  note: string | null;
  is_active: boolean;
  updated_at: string;
};

function compareScenarioOverrideRules(
  a: Pick<ScenarioOverrideRule, "match_pattern" | "updated_at">,
  b: Pick<ScenarioOverrideRule, "match_pattern" | "updated_at">,
): number {
  const lengthDiff = b.match_pattern.length - a.match_pattern.length;
  if (lengthDiff !== 0) return lengthDiff;
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

function findScenarioOverride(
  mapSegment: string,
  rules: Pick<ScenarioOverrideRule, "match_pattern" | "updated_at">[],
): Pick<ScenarioOverrideRule, "match_pattern" | "updated_at"> | null {
  const normalizedSegment = mapSegment.toLowerCase();
  let matchedRule: Pick<ScenarioOverrideRule, "match_pattern" | "updated_at"> | null = null;

  for (const rule of rules) {
    if (!normalizedSegment.includes(rule.match_pattern.toLowerCase())) continue;
    if (!matchedRule || compareScenarioOverrideRules(rule, matchedRule) < 0) {
      matchedRule = rule;
    }
  }

  return matchedRule;
}

export async function GET(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("configured") ? 500 : 401 });
  }

  try {
    const params = req.nextUrl.searchParams;
    const unknownDaysRaw = Number(params.get("unknown_days") ?? "30");
    const unknownLimitRaw = Number(params.get("unknown_limit") ?? "20");
    const unknownDays = Number.isFinite(unknownDaysRaw) && unknownDaysRaw > 0 ? Math.floor(unknownDaysRaw) : 30;
    const unknownLimit = Number.isFinite(unknownLimitRaw) && unknownLimitRaw > 0 ? Math.floor(unknownLimitRaw) : 20;

    const supabase = createSupabaseAdminClient();

    const overridesQuery = await supabase
      .from("scenario_overrides")
      .select("match_pattern, scenario_code, note, is_active, updated_at")
      .order("updated_at", { ascending: false });

    if (overridesQuery.error) {
      return NextResponse.json({ error: overridesQuery.error.message }, { status: 500 });
    }

    const sinceDate = dateDaysAgo(unknownDays);
    const sessionsQuery = await supabase
      .from("recording_sessions")
      .select("map_segment, duration_sec, work_date")
      .gte("work_date", sinceDate);

    if (sessionsQuery.error) {
      return NextResponse.json({ error: sessionsQuery.error.message }, { status: 500 });
    }

    const activeOverrideRules = (overridesQuery.data ?? [])
      .filter((row) => row.is_active)
      .map((row) => ({
        match_pattern: String(row.match_pattern ?? "").trim(),
        updated_at: String(row.updated_at ?? new Date(0).toISOString()),
      }))
      .filter((row) => row.match_pattern)
      .sort(compareScenarioOverrideRules);

    const unknownMap = new Map<string, { map_segment: string; records: number; data_seconds: number }>();
    for (const row of sessionsQuery.data ?? []) {
      const mapSegment = String(row.map_segment ?? "").trim();
      if (!mapSegment) continue;
      if (findScenarioOverride(mapSegment, activeOverrideRules)) continue;

      if (deriveScenarioFromSegment(mapSegment) !== "unknown") continue;

      const duration = Number(row.duration_sec ?? 0);
      const prev = unknownMap.get(mapSegment) ?? { map_segment: mapSegment, records: 0, data_seconds: 0 };
      prev.records += 1;
      prev.data_seconds += Number.isFinite(duration) ? duration : 0;
      unknownMap.set(mapSegment, prev);
    }

    const unknownCandidates = [...unknownMap.values()]
      .sort((a, b) => b.data_seconds - a.data_seconds)
      .slice(0, unknownLimit)
      .map((item) => ({
        ...item,
        data_hours: item.data_seconds / 3600,
      }));

    return NextResponse.json(
      {
        items: overridesQuery.data ?? [],
        unknown_candidates: unknownCandidates,
        unknown_days: unknownDays,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("configured") ? 500 : 401 });
  }

  try {
    const body = (await req.json()) as {
      match_pattern?: string;
      scenario_code?: string;
      note?: string;
      is_active?: boolean;
    };

    const matchPattern = (body.match_pattern ?? "").trim();
    const scenarioCode = (body.scenario_code ?? "").trim();
    const note = (body.note ?? "").trim();
    const isActive = body.is_active ?? true;

    if (!matchPattern || !scenarioCode) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("scenario_overrides").upsert(
      {
        match_pattern: matchPattern,
        scenario_code: scenarioCode,
        note: note || null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "match_pattern",
      },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("configured") ? 500 : 401 });
  }

  try {
    const body = (await req.json()) as { match_pattern?: string };
    const matchPattern = (body.match_pattern ?? "").trim();

    if (!matchPattern) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("scenario_overrides").delete().eq("match_pattern", matchPattern);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
