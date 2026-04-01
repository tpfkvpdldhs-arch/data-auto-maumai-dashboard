"use client";

import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginClientProps = {
  nextPath?: string;
};

export default function LoginClient({ nextPath = "/" }: LoginClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (signInError) {
        throw signInError;
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <div className="auth-form single">
      <div>
        <label>Google 로그인</label>
        <button type="button" onClick={() => void signInWithGoogle()} disabled={loading}>
          {loading ? "이동 중..." : "Google (@maum.ai)로 로그인"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
