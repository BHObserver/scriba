import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { makeI18n, type I18n } from "./format";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./locale";

/** The locale from the cookie set by the language switch; Bangla when none is set. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Translation and number formatting for Server Components. */
export async function getI18n(): Promise<I18n> {
  return makeI18n(await getLocale());
}
