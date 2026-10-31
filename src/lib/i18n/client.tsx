"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useTransition, type ReactNode } from "react";
import { setLocale } from "./actions";
import { makeI18n, type I18n } from "./format";
import { DEFAULT_LOCALE, type Locale } from "./locale";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once in the root layout from the cookie, so client components render in the same language. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n(): I18n {
  const locale = useContext(LocaleContext);
  return useMemo(() => makeI18n(locale), [locale]);
}

/** Switch language: stores the cookie, then re-renders the server tree in the new language. */
export function useSetLocale(): { setLocale: (locale: Locale) => void; pending: boolean } {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    pending,
    setLocale: (locale) =>
      startTransition(async () => {
        await setLocale(locale);
        router.refresh();
      }),
  };
}
