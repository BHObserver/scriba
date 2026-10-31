"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "./locale";

/** Remember the chosen language for a year. The page re-renders in it from the same round trip. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
