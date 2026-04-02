import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

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

function normalizeMapCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export async function GET(req: NextRequest) {
  const authError = verifyAdminToken(req);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("configured") ? 500 : 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("map_code_aliases")
      .select("alias_map_code, canonical_map_code, note, is_active, updated_at")
      .order("updated_at", { ascending: false })
      .order("alias_map_code", { ascending: true });

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
      alias_map_code?: string;
      canonical_map_code?: string;
      note?: string;
      is_active?: boolean;
    };

    const aliasMapCode = normalizeMapCode(body.alias_map_code);
    const canonicalMapCode = normalizeMapCode(body.canonical_map_code);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const isActive = body.is_active ?? true;

    if (!aliasMapCode || !canonicalMapCode || aliasMapCode === canonicalMapCode) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("map_code_aliases").upsert(
      {
        alias_map_code: aliasMapCode,
        canonical_map_code: canonicalMapCode,
        note: note || null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "alias_map_code",
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
    const body = (await req.json()) as { alias_map_code?: string };
    const aliasMapCode = normalizeMapCode(body.alias_map_code);

    if (!aliasMapCode) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("map_code_aliases").delete().eq("alias_map_code", aliasMapCode);

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
