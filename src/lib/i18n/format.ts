import { formatTaka, groupSouthAsian, toAsciiDigits, toBanglaDigits } from "@/lib/numerals";
import type { Locale } from "./locale";
import { MESSAGES, type MessageKey } from "./messages";

const MONTHS: Record<Locale, readonly string[]> = {
  bn: ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const WEEKDAYS: Record<Locale, readonly string[]> = {
  bn: ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

/**
 * Digits in the locale's script: Bangla in bn, Latin in English. Other text is untouched. In
 * English a khata reading's Bangla digits must become Latin: "৪০০" left as it is reads as "800".
 */
export function localDigits(text: string, locale: Locale): string {
  return locale === "bn" ? toBanglaDigits(text) : toAsciiDigits(text);
}

/** A whole count with lakh grouping in the locale's digits: 123450 -> "১,২৩,৪৫০" / "1,23,450". */
export function formatCount(n: number, locale: Locale): string {
  const whole = Math.round(n);
  const text = `${whole < 0 ? "−" : ""}${groupSouthAsian(String(Math.abs(whole)))}`;
  return localDigits(text, locale);
}

/** Integer poisha as taka: "৳৪,৩২০" / "৳4,320". */
export function formatMoney(poisha: number | null | undefined, locale: Locale): string {
  return formatTaka(poisha, { bangla: locale === "bn" });
}

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** A business date ("2026-11-01") as "১ নভেম্বর" / "1 Nov". No time zone is involved. */
export function formatDayMonth(iso: string, locale: Locale): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  return `${localDigits(String(p.d), locale)} ${MONTHS[locale][p.m - 1] ?? ""}`.trim();
}

export function formatWeekday(iso: string, locale: Locale): string {
  const p = parseIsoDate(iso);
  if (!p) return "";
  return WEEKDAYS[locale][new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] ?? "";
}

export type MessageArg = string | number;

/** Fill {1}, {2}… in a message. Numbers are grouped and written in the locale's digits. */
export function translate(locale: Locale, key: MessageKey, args: readonly MessageArg[] = []): string {
  const template = MESSAGES[locale][key];
  if (args.length === 0) return template;
  return template.replace(/\{(\d+)\}/g, (whole, index: string) => {
    const arg = args[Number(index) - 1];
    if (arg === undefined) return whole;
    return typeof arg === "number" ? formatCount(arg, locale) : arg;
  });
}

export type I18n = {
  locale: Locale;
  t: (key: MessageKey, ...args: MessageArg[]) => string;
  money: (poisha: number | null | undefined) => string;
  count: (n: number) => string;
  digits: (text: string) => string;
  dayMonth: (iso: string) => string;
  weekday: (iso: string) => string;
};

export function makeI18n(locale: Locale): I18n {
  return {
    locale,
    t: (key, ...args) => translate(locale, key, args),
    money: (poisha) => formatMoney(poisha, locale),
    count: (n) => formatCount(n, locale),
    digits: (text) => localDigits(text, locale),
    dayMonth: (iso) => formatDayMonth(iso, locale),
    weekday: (iso) => formatWeekday(iso, locale),
  };
}
