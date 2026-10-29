import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createUserSupabase } from "@/lib/supabase/server";

/**
 * Email confirmation link target. Supports both Supabase link styles:
 * the default PKCE link (?code=...) and the token-hash template (?token_hash=...&type=...).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? "/documents";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/documents";

  const supabase = await createUserSupabase();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?confirm=failed", url.origin));
}
