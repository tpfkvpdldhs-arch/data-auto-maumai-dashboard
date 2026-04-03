import { NextRequest, NextResponse } from "next/server";

import { jsonAuthError, verifyInternalDashboardRequest } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeBaseline(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : null;
}

function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  const auth = await verifyInternalDashboardRequest(request);
  if (!auth.ok) {
    return jsonAuthError(auth);
  }

  const publicToken = process.env.PUBLIC_VIEW_TOKEN;
  if (!publicToken) {
    return NextResponse.json({ error: "PUBLIC_VIEW_TOKEN is not configured" }, { status: 500 });
  }

  try {
    const body = (await request.json()) as {
      start?: string;
      end?: string;
      baselineHours?: string | number;
      workers?: string[];
      maps?: string[];
      scenarios?: string[];
    };

    const start = normalizeDate(body.start);
    const end = normalizeDate(body.end);
    const baselineHours = normalizeBaseline(body.baselineHours);
    const workers = normalizeList(body.workers);
    const maps = normalizeList(body.maps);
    const scenarios = normalizeList(body.scenarios);

    const params = new URLSearchParams({ token: publicToken });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (baselineHours) params.set("baseline", baselineHours);
    if (workers.length) params.set("workers", workers.join(","));
    if (maps.length) params.set("maps", maps.join(","));
    if (scenarios.length) params.set("scenarios", scenarios.join(","));

    const url = `${request.nextUrl.origin}/viewer?${params.toString()}`;
    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
