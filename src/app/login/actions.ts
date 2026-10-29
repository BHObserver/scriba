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

export type AuthState = { error?: string; message?: string };

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/documents";
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid email and a password of at least 8 characters." };
  const supabase = await createUserSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: "Sign-in failed. Check your email and password, or confirm your email first." };
  redirect(safeNext(parsed.data.next));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid email and a password of at least 8 characters." };
  const supabase = await createUserSupabase();
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/documents` },
  });
  if (error) return { error: "Sign-up failed. The email may already be registered, or sign-ups may be disabled." };
  if (data.session) redirect("/documents");
  return { message: "Check your email to confirm the account, then sign in." };
}
