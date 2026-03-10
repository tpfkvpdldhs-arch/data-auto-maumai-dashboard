import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type IncomingRecord = {
  source_folder: "bag" | "bag_failed";
  filename: string;
  start_time: string;
  end_time: string;
  duration_sec: number;
  map_segment: string;
  map_name?: string;
  map_code?: string;
  scenario_input?: string;
};

type IncomingPayload = {
  worker_id: string;
  generated_at: string;
  timezone: string;
  records: IncomingRecord[];
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function extractScenarioCode(segment: string): string {
  if (segment.startsWith("r_road")) return "mowing";
  if (segment.startsWith("f_outline")) return "fairway_outline";
  return "unknown";
}

function extractMapCodeFromSegment(segment: string): string {
  const matched = segment.match(/(?:east|west|north)\d+/i);
  return matched ? matched[0].toLowerCase() : "unknown";
}

function extractMapCodeFromMapName(mapName: string): string {
  const matched = mapName.match(/(?:east|west|north)\d+/i);
  return matched ? matched[0].toLowerCase() : "unknown";
}

type ScenarioOverrideRule = {
  matchPattern: string;
  scenarioCode: string;
  updatedAt: string | null;
};

function compareScenarioOverrideRules(a: ScenarioOverrideRule, b: ScenarioOverrideRule): number {
  const lengthDiff = b.matchPattern.length - a.matchPattern.length;
  if (lengthDiff !== 0) return lengthDiff;

  const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
  const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
  return timeB - timeA;
}

function findScenarioOverride(segment: string, rules: ScenarioOverrideRule[]): string | null {
  const normalizedSegment = segment.toLowerCase();
  let matchedRule: ScenarioOverrideRule | null = null;

  for (const rule of rules) {
    if (!normalizedSegment.includes(rule.matchPattern.toLowerCase())) continue;
    if (!matchedRule || compareScenarioOverrideRules(rule, matchedRule) < 0) {
      matchedRule = rule;
    }
  }

  return matchedRule?.scenarioCode ?? null;
}

function toWorkDate(value: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter
    .formatToParts(value)
    .reduce<Record<string, string>>((acc, item) => {
      if (item.type !== "literal") acc[item.type] = item.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validateRecord(record: unknown): string | null {
  if (!record || typeof record !== "object") return "record is not an object";
  const casted = record as Partial<IncomingRecord>;

  if (casted.source_folder !== "bag" && casted.source_folder !== "bag_failed") {
    return "source_folder must be bag or bag_failed";
  }
  if (!casted.filename || typeof casted.filename !== "string") {
    return "filename is required";
  }
  if (!casted.start_time || typeof casted.start_time !== "string") {
    return "start_time is required";
  }
  if (!casted.end_time || typeof casted.end_time !== "string") {
    return "end_time is required";
  }
  if (typeof casted.duration_sec !== "number" || Number.isNaN(casted.duration_sec) || casted.duration_sec < 0) {
    return "duration_sec must be a non-negative number";
  }
  if (!casted.map_segment || typeof casted.map_segment !== "string") {
    return "map_segment is required";
  }
  if (casted.map_name !== undefined && casted.map_name !== null && typeof casted.map_name !== "string") {
    return "map_name must be a string";
  }
  if (casted.map_code !== undefined && casted.map_code !== null && typeof casted.map_code !== "string") {
    return "map_code must be a string";
  }
  if (casted.scenario_input !== undefined && casted.scenario_input !== null && typeof casted.scenario_input !== "string") {
    return "scenario_input must be a string";
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "missing_supabase_env" });
  }

  const token = getBearerToken(request);
  if (!token) {
    return json(401, { error: "missing_bearer_token" });
  }

  let payload: IncomingPayload;
  try {
    payload = (await request.json()) as IncomingPayload;
  } catch (_error) {
    return json(400, { error: "invalid_json" });
  }

  if (!payload.worker_id || typeof payload.worker_id !== "string") {
    return json(400, { error: "worker_id_required" });
  }
  if (!payload.generated_at || typeof payload.generated_at !== "string") {
    return json(400, { error: "generated_at_required" });
  }
  if (payload.timezone !== "Asia/Seoul") {
    return json(400, { error: "timezone_must_be_asia_seoul" });
  }
  if (!Array.isArray(payload.records)) {
    return json(400, { error: "records_must_be_array" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { "x-ingest-source": "worker-daily" } },
  });

  const tokenHash = await sha256Hex(token);
  const tokenResult = await supabase
    .from("worker_tokens")
    .select("worker_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenResult.error || !tokenResult.data) {
    return json(401, { error: "invalid_token" });
  }
  if (tokenResult.data.revoked_at) {
    return json(401, { error: "revoked_token" });
  }
  if (tokenResult.data.worker_id !== payload.worker_id) {
    return json(403, { error: "worker_id_mismatch" });
  }

  const ensureWorker = await supabase.from("workers").upsert(
    {
      worker_id: payload.worker_id,
      display_name: payload.worker_id,
      is_active: true,
    },
    {
      onConflict: "worker_id",
      ignoreDuplicates: false,
      defaultToNull: false,
    },
  );

  if (ensureWorker.error) {
    return json(500, { error: "failed_to_ensure_worker", detail: ensureWorker.error.message });
  }

  const overridesResult = await supabase
    .from("scenario_overrides")
    .select("match_pattern, scenario_code, updated_at")
    .eq("is_active", true);

  if (overridesResult.error) {
    return json(500, { error: "failed_to_load_scenario_overrides", detail: overridesResult.error.message });
  }

  const scenarioOverrides: ScenarioOverrideRule[] = [];
  for (const row of overridesResult.data ?? []) {
    const matchPattern = String(row.match_pattern ?? "").trim();
    const code = String(row.scenario_code ?? "").trim();
    const updatedAt = row.updated_at ? String(row.updated_at) : null;
    if (matchPattern && code) {
      scenarioOverrides.push({ matchPattern, scenarioCode: code, updatedAt });
    }
  }

  scenarioOverrides.sort(compareScenarioOverrideRules);

  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < payload.records.length; i += 1) {
    const record = payload.records[i];
    const validation = validateRecord(record);
    if (validation) {
      rejectedCount += 1;
      errors.push(`records[${i}]: ${validation}`);
      continue;
    }

    const startedAt = new Date(record.start_time);
    const endedAt = new Date(record.end_time);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      rejectedCount += 1;
      errors.push(`records[${i}]: invalid datetime format`);
      continue;
    }
    if (endedAt.getTime() < startedAt.getTime()) {
      rejectedCount += 1;
      errors.push(`records[${i}]: end_time before start_time`);
      continue;
    }

    const mapSegment = record.map_segment.trim() || "unknown";
    const mapName = record.map_name?.trim() || null;
    const scenarioInput = record.scenario_input?.trim() || null;

    let mapCode = "unknown";
    let mapCodeSource = "unknown";
    const incomingMapCode = record.map_code?.trim().toLowerCase() || "";
    if (incomingMapCode) {
      mapCode = incomingMapCode;
      mapCodeSource = "manual";
    } else if (mapName) {
      mapCode = extractMapCodeFromMapName(mapName);
      mapCodeSource = mapCode === "unknown" ? "unknown" : "map_name";
    } else {
      mapCode = extractMapCodeFromSegment(mapSegment);
      mapCodeSource = mapCode === "unknown" ? "unknown" : "map_segment";
    }

    const overrideScenario = findScenarioOverride(mapSegment, scenarioOverrides);
    const inputScenario = scenarioInput ? scenarioInput : null;
    const segmentScenario = extractScenarioCode(mapSegment);

    let scenarioCode = "unknown";
    let scenarioSource = "unknown";
    if (overrideScenario) {
      scenarioCode = overrideScenario;
      scenarioSource = "manual";
    } else if (inputScenario) {
      scenarioCode = inputScenario;
      scenarioSource = "input";
    } else if (segmentScenario !== "unknown") {
      scenarioCode = segmentScenario;
      scenarioSource = "segment_rule";
    }

    const row = {
      worker_id: payload.worker_id,
      source_folder: record.source_folder,
      filename: record.filename,
      start_time: startedAt.toISOString(),
      end_time: endedAt.toISOString(),
      duration_sec: record.duration_sec,
      map_segment: mapSegment,
      map_name: mapName,
      map_code: mapCode,
      map_code_source: mapCodeSource,
      scenario_input: scenarioInput,
      scenario_code: scenarioCode,
      scenario_source: scenarioSource,
      is_failed: record.source_folder === "bag_failed",
      work_date: toWorkDate(startedAt, payload.timezone),
      raw_payload: record,
    };

    const inserted = await supabase
      .from("recording_sessions")
      .insert(row)
      .select("id")
      .single();

    if (inserted.error) {
      if (inserted.error.code === "23505") {
        duplicateCount += 1;
        continue;
      }
      rejectedCount += 1;
      errors.push(`records[${i}]: ${inserted.error.message}`);
      continue;
    }

    acceptedCount += 1;
  }

  return json(200, {
    accepted_count: acceptedCount,
    duplicate_count: duplicateCount,
    rejected_count: rejectedCount,
    errors: errors.slice(0, 100),
  });
});
