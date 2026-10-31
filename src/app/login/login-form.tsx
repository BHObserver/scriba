"use client";

import { useActionState, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { type AuthState, signIn, signUp } from "./actions";

const ERRORS = { invalid: "login.err.invalid", signin: "login.err.signin", signup: "login.err.signup" } as const;

export function LoginForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signin" ? signIn : signUp, {});

  return (
    <form action={action} className="grid gap-4">
      <h2 className="t-sec">{mode === "signin" ? t("login.title") : t("login.signup.title")}</h2>
      <input type="hidden" name="next" value={next ?? "/"} />
      <label className="field">
        <span className="field-l">{t("login.email")}</span>
        <input name="email" type="email" inputMode="email" autoComplete="email" required className="input" />
      </label>
      <label className="field">
        <span className="field-l">{t("login.password")}</span>
        <input
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={8}
          required
          aria-describedby="password-hint"
          className="input"
        />
        <span id="password-hint" className="t-small">{t("login.password.hint")}</span>
      </label>
      {state.error ? (
        <p role="alert" className="panel-soft t-body">{t(ERRORS[state.error])}</p>
      ) : null}
      {state.message ? (
        <p role="status" className="rounded-[18px] bg-ok-soft px-4 py-3.5 text-[17px] font-medium text-ink">{t("login.msg.confirm")}</p>
      ) : null}
      <button type="submit" className="btn btn-red w-full" disabled={pending}>
        {pending ? t("login.wait") : mode === "signin" ? t("login.signin") : t("login.signup")}
      </button>
      <button type="button" className="btn btn-ghost w-full" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? t("login.toSignup") : t("login.toSignin")}
      </button>
    </form>
  );
}
