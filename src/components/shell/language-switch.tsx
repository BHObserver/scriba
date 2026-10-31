"use client";

import { Segmented } from "@/components/kit/segmented";
import { useI18n, useSetLocale } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

/** বাংলা / English. Each option is written in its own language so either reader can find it. */
export function LanguageSwitch() {
  const { t, locale } = useI18n();
  const { setLocale, pending } = useSetLocale();
  const options = [
    { value: "bn", label: t("lang.bn") },
    { value: "en", label: t("lang.en") },
  ] as const satisfies ReadonlyArray<{ value: Locale; label: string }>;
  return <Segmented options={options} value={locale} onChange={setLocale} label={t("more.lang")} disabled={pending} />;
}
