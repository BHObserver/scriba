/** Business-date arithmetic on "YYYY-MM-DD" strings. No time zone is involved. */

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`not a business date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Every date from `from` to `to`, both included. Empty when `to` is earlier. */
export function datesFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = 0, n = daysBetween(from, to); i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

/** How far back the Today screen looks for the khata's last day (yesterday, the day before). */
export const HOME_DAY_REACH = 2;

/**
 * The day the Today screen shows and closes, given the dates that have a page or a line.
 * Today once it has one; before that, the khata's last day when it is at most
 * `HOME_DAY_REACH` days back (pages carry the date written on them, and he often checks a
 * day's pages after midnight or the next morning); otherwise today.
 */
export function homeDayOf(busy: ReadonlySet<string>, today: string): string {
  if (busy.has(today)) return today;
  for (let back = 1; back <= HOME_DAY_REACH; back++) {
    const date = addDays(today, -back);
    if (busy.has(date)) return date;
  }
  return today;
}
