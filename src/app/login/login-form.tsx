"use client";

import { useActionState, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { type AuthState, signIn, signUp } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signin" ? signIn : signUp, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/documents"} />
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-md border border-rule bg-card px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={8}
          required
          className="mt-1 w-full rounded-md border border-rule bg-card px-3 py-2 text-sm"
        />
      </div>
      {state.error ? <Notice tone="fail">{state.error}</Notice> : null}
      {state.message ? <Notice tone="pass">{state.message}</Notice> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-accent hover:underline"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "New to Scriba? Create an account" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
