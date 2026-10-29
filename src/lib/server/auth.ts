import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createUserSupabase } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/** For pages: returns the verified user or redirects to sign-in. */
export async function requireUser(nextPath = "/documents") {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return { supabase, user: { id: data.user.id, email: data.user.email ?? null } satisfies SessionUser };
}

/**
 * For route handlers: verifies the user with the Auth server (not just the cookie).
 * Returns a 401 response when signed out.
 */
export async function apiUser(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createUserSupabase>>; user: SessionUser }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) };
  }
  return { ok: true, supabase, user: { id: data.user.id, email: data.user.email ?? null } };
}

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
