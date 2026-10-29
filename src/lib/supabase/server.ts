import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/config";

/**
 * User-scoped client for Server Components, Route Handlers and Server Actions.
 * Every query runs as the signed-in user, so Row Level Security applies.
 */
export async function createUserSupabase() {
  // Read the request cookies first: this marks the route as dynamic per request.
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfig();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Privileged client using the secret key. It bypasses RLS, so it is only used for
 * server-attested writes (extraction results, usage, confirmations, evaluations)
 * after the caller's identity and ownership have been verified, and every query
 * it makes is filtered by that verified owner id.
 */
export function createServiceSupabase() {
  const { url } = getSupabasePublicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set on the server.");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
