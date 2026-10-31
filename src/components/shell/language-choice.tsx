"use client";

import { StatusMark } from "@/components/kit/marks";
import { useI18n, useSetLocale } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n/locale";

/** The welcome's two big language buttons: choosing one re-renders the whole screen in it. */
export function LanguageChoice() {
  const { t, locale } = useI18n();
  const { setLocale, pending } = useSetLocale();
  return (
    <div className="ob-langs" role="radiogroup" aria-label={t("ob.lang")}>
      {LOCALES.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={locale === l} disabled={pending} className="ob-lang" onClick={() => setLocale(l)}>
          <span lang={l}>{t(l === "bn" ? "lang.bn" : "lang.en")}</span>
          {locale === l ? <StatusMark kind="ok" /> : null}
        </button>
      ))}
    </div>
  );
}
