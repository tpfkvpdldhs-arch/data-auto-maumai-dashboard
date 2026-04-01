import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAUM_DOMAIN = "@maum.ai";

type AuthResult =
  | { ok: true; email: string }
  | { ok: false; error: string; status: number };

type TokenCheckResult =
  | { ok: true; token: string }
  | { ok: false; error: string; status: number };

function validateToken(actual: string | null | undefined, expected: string | undefined, label: string): TokenCheckResult {
  if (!expected) {
    return { ok: false, error: `${label} is not configured`, status: 500 };
  }

  const normalized = actual?.trim();
  if (!normalized || normalized !== expected) {
    return { ok: false, error: `invalid ${label.toLowerCase()}`, status: 401 };
  }

  return { ok: true, token: normalized };
}

function getEmailFromUser(user: { email?: string | null }): string | null {
  const email = user.email?.trim().toLowerCase();
  return email && email.endsWith(MAUM_DOMAIN) ? email : null;
}

export async function verifyInternalDashboardRequest(request?: NextRequest): Promise<AuthResult> {
  try {
    const _request = request;
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { ok: false, error: "unauthenticated", status: 401 };
    }

    const email = getEmailFromUser(user);
    if (!email) {
      return { ok: false, error: "forbidden_email_domain", status: 403 };
    }

    return { ok: true, email };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "missing_auth_env",
      status: 500,
    };
  }
}

export async function requireInternalDashboardPageAccess(nextPath = "/") {
  const auth = await verifyInternalDashboardRequest();
  if (!auth.ok) {
    if (auth.status === 401) {
      const target = nextPath.startsWith("/") ? nextPath : "/";
      redirect(`/auth/login?next=${encodeURIComponent(target)}`);
    }

    return auth;
  }

  return auth;
}

export function verifyPublicViewerRequest(req: NextRequest): TokenCheckResult {
  return validateToken(req.nextUrl.searchParams.get("token"), process.env.PUBLIC_VIEW_TOKEN, "PUBLIC_VIEW_TOKEN");
}

export function verifyPublicViewerToken(token: string | null | undefined): TokenCheckResult {
  return validateToken(token, process.env.PUBLIC_VIEW_TOKEN, "PUBLIC_VIEW_TOKEN");
}

export function jsonAuthError(
  result: Extract<AuthResult, { ok: false }> | Extract<TokenCheckResult, { ok: false }>,
) {
  return NextResponse.json(
    { error: result.error },
    {
      status: result.status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
