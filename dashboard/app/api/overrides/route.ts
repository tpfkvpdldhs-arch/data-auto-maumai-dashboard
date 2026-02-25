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

export async function GET(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("configured") ? 500 : 401 });
  }

  try {
    const params = req.nextUrl.searchParams;
    const start = params.get("start");
    const end = params.get("end");

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("worker_day_overrides")
      .select("worker_id, work_date, work_hours, note, updated_at")
      .order("work_date", { ascending: false })
      .order("worker_id", { ascending: true });

    if (start) query = query.gte("work_date", start);
    if (end) query = query.lte("work_date", end);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] }, { status: 200 });
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
      worker_id?: string;
      work_date?: string;
      work_hours?: number;
      note?: string;
    };

    const workerId = (body.worker_id ?? "").trim();
    const workDate = (body.work_date ?? "").trim();
    const workHours = Number(body.work_hours);
    const note = (body.note ?? "").trim();

    if (!workerId || !workDate || Number.isNaN(workHours) || workHours < 0) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("worker_day_overrides").upsert(
      {
        worker_id: workerId,
        work_date: workDate,
        work_hours: workHours,
        note: note || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "worker_id,work_date",
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
    const body = (await req.json()) as { worker_id?: string; work_date?: string };
    const workerId = (body.worker_id ?? "").trim();
    const workDate = (body.work_date ?? "").trim();

    if (!workerId || !workDate) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("worker_day_overrides")
      .delete()
      .eq("worker_id", workerId)
      .eq("work_date", workDate);

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
