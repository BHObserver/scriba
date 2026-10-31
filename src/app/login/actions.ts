"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createUserSupabase } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  next: z.string().max(200).optional(),
});

/** Codes, not sentences: the form shows them in the chosen language. */
export type AuthState = { error?: "invalid" | "signin" | "signup"; message?: "confirm" };

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createUserSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: "signin" };
  redirect(safeNext(parsed.data.next));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createUserSupabase();
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/` },
  });
  if (error) return { error: "signup" };
  if (data.session) redirect("/");
  return { message: "confirm" };
}
