import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type IncomingRecord = {
  source_folder: "bag" | "bag_failed";
  filename: string;
  start_time: string;
  end_time: string;
  duration_sec: number;
  map_segment: string;
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

function extractMapCode(segment: string): string {
  const matched = segment.match(/(?:east|west)\d+/i);
  return matched ? matched[0].toLowerCase() : "unknown";
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
    const row = {
      worker_id: payload.worker_id,
      source_folder: record.source_folder,
      filename: record.filename,
      start_time: startedAt.toISOString(),
      end_time: endedAt.toISOString(),
      duration_sec: record.duration_sec,
      map_segment: mapSegment,
      map_code: extractMapCode(mapSegment),
      scenario_code: extractScenarioCode(mapSegment),
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
