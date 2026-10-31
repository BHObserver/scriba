export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Bangla first: a shop that never chose a language reads Bangla. */
export const DEFAULT_LOCALE: Locale = "bn";
export const LOCALE_COOKIE = "scriba_locale";
export const HTML_LANG: Record<Locale, string> = { bn: "bn", en: "en" };

export function isLocale(value: unknown): value is Locale {
  return value === "bn" || value === "en";
}
