/**
 * Ask Scriba: the period a question names, as business dates. The model names the period by its
 * kind ("last_7_days", "on_date" with day 28); this code turns it into dates, so the dates the
 * answer card shows are the dates the figure was computed over.
 */
import { addDays, daysBetween } from "@/lib/insights/calendar";
import type { AskQuery, CompareKey, PeriodKey } from "./query";

/** "before": the same number of days just before another period (a comparison's default). */
export type Period = { key: PeriodKey | "before"; from: string; to: string; days: number };

/** The longest "last N days" a question may ask for. */
export const MAX_PERIOD_DAYS = 366;

function make(key: Period["key"], from: string, to: string): Period {
  return { key, from, to, days: daysBetween(from, to) + 1 };
}

const isoOf = (year: number, month: number, day: number): string | null => {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
};

/** The most recent date on or before `asOf` with this day (and month, when given). */
function onDate(asOf: string, day: number | null, month: number | null): string | null {
  if (day === null || day < 1 || day > 31 || (month !== null && (month < 1 || month > 12))) return null;
  const year = Number(asOf.slice(0, 4));
  const thisMonth = Number(asOf.slice(5, 7));
  if (month !== null) {
    for (const y of [year, year - 1]) {
      const iso = isoOf(y, month, day);
      if (iso && iso <= asOf) return iso;
    }
    return null;
  }
  for (let back = 0; back < 12; back++) {
    const m = ((thisMonth - 1 - back + 120) % 12) + 1;
    const y = year - (thisMonth - back <= 0 ? 1 : 0);
    const iso = isoOf(y, m, day);
    if (iso && iso <= asOf) return iso;
  }
  return null;
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function fixed(key: CompareKey, asOf: string): Period {
  switch (key) {
    case "today":
      return make(key, asOf, asOf);
    case "yesterday":
      return make(key, addDays(asOf, -1), addDays(asOf, -1));
    case "last_7_days":
      return make(key, addDays(asOf, -6), asOf);
    case "previous_7_days":
      return make(key, addDays(asOf, -13), addDays(asOf, -7));
    case "this_month":
      return make(key, monthStart(asOf), asOf);
    case "last_month": {
      const end = addDays(monthStart(asOf), -1);
      return make(key, monthStart(end), end);
    }
  }
}

/**
 * The period of a question, or null when it names no real period (day 31 of a short month, a
 * "last 0 days"). `firstDate` is the book's first business date, for "in all".
 */
export function resolvePeriod(q: Pick<AskQuery, "period" | "days" | "day" | "month">, asOf: string, firstDate: string | null): Period | null {
  switch (q.period) {
    case "last_n_days":
      if (q.days === null || q.days < 1 || q.days > MAX_PERIOD_DAYS) return null;
      return make("last_n_days", addDays(asOf, -(q.days - 1)), asOf);
    case "on_date": {
      const iso = onDate(asOf, q.day, q.month);
      return iso ? make("on_date", iso, iso) : null;
    }
    case "all_time":
      return make("all_time", firstDate && firstDate < asOf ? firstDate : asOf, asOf);
    default:
      return fixed(q.period, asOf);
  }
}

/**
 * What a period is compared with: the named period, or by default the same number of days just
 * before it (today → yesterday, the last 7 days → the 7 days before).
 */
export function comparisonPeriod(a: Period, to: CompareKey | null, asOf: string): Period {
  if (to) return fixed(to, asOf);
  if (a.key === "today") return fixed("yesterday", asOf);
  if (a.key === "last_7_days") return fixed("previous_7_days", asOf);
  return make("before", addDays(a.from, -a.days), addDays(a.from, -1));
}
