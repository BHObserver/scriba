/**
 * Sales over time: per day, this week against the week before, top items, and the weekday
 * pattern. "Sales" are confirmed cash and credit sale lines; a day with no confirmed page
 * counts as no sales, so comparisons are made only when the book reaches back far enough.
 */
import { SALE_TYPES } from "@/lib/ledger/types";
import { type Book, figureOf } from "./book";
import { addDays, datesFrom, daysBetween, weekdayOf } from "./calendar";
import type { Figure, InsightRecord } from "./types";

export type DaySales = { date: string; sales: Figure; cashPoisha: number; creditPoisha: number };

function salesBetween(book: Book, from: string, to: string): InsightRecord[] {
  return book.records.filter((r) => SALE_TYPES.has(r.type) && r.businessDate >= from && r.businessDate <= to);
}

/** Sales of every day from `from` to `to`, both included, including days without sales. */
export function salesByDay(book: Book, from: string, to: string): DaySales[] {
  const byDate = new Map<string, InsightRecord[]>();
  for (const r of salesBetween(book, from, to)) {
    const list = byDate.get(r.businessDate);
    if (list) list.push(r);
    else byDate.set(r.businessDate, [r]);
  }
  return datesFrom(from, to).map((date) => {
    const records = byDate.get(date) ?? [];
    const sum = (type: InsightRecord["type"]) =>
      records.filter((r) => r.type === type).reduce((s, r) => s + r.amountPoisha, 0);
    return { date, sales: figureOf(records), cashPoisha: sum("cash_sale"), creditPoisha: sum("credit_sale") };
  });
}

export type WeekComparison = {
  from: string;
  to: string;
  /** Seven days, oldest first, ending with `to`. */
  days: DaySales[];
  total: Figure;
  averagePoisha: number;
  /** The seven days before; null when the book doesn't reach back to their first day. */
  previous: Figure | null;
  /** total − previous; null without a previous week. */
  diffPoisha: number | null;
};

export function weekComparison(book: Book, asOf: string): WeekComparison {
  const from = addDays(asOf, -6);
  const days = salesByDay(book, from, asOf);
  const total = figureOf(salesBetween(book, from, asOf));
  const previousFrom = addDays(asOf, -13);
  const previous =
    book.firstDate !== null && book.firstDate <= previousFrom
      ? figureOf(salesBetween(book, previousFrom, addDays(asOf, -7)))
      : null;
  return {
    from,
    to: asOf,
    days,
    total,
    averagePoisha: Math.round(total.poisha / 7),
    previous,
    diffPoisha: previous ? total.poisha - previous.poisha : null,
  };
}

export type ItemSales = Figure & { name: string; lines: number };

const tidy = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ");
const itemKey = (name: string) => tidy(name).toLowerCase();

/** Items by sales amount (largest first) between two dates. Lines without an item are left out. */
export function topItems(book: Book, from: string, to: string, limit = 5): ItemSales[] {
  const groups = new Map<string, { records: InsightRecord[]; spellings: Map<string, number> }>();
  for (const r of salesBetween(book, from, to)) {
    const name = r.itemName ? tidy(r.itemName) : "";
    if (!name) continue;
    const key = itemKey(name);
    const group = groups.get(key) ?? { records: [], spellings: new Map<string, number>() };
    group.records.push(r);
    group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
    groups.set(key, group);
  }
  const items = [...groups.values()].map(({ records, spellings }) => {
    // The spelling he uses most (the first written, on a tie).
    const name = [...spellings].reduce((best, s) => (s[1] > best[1] ? s : best))[0];
    return { name, lines: records.length, ...figureOf(records) };
  });
  items.sort((a, b) => b.poisha - a.poisha || b.lines - a.lines || a.name.localeCompare(b.name, "bn"));
  return items.slice(0, limit);
}

export const WEEKDAY_PATTERN = { minWeeks: 4, maxWeeks: 12 } as const;

export type WeekdaySales = Figure & { weekday: number; averagePoisha: number };

export type WeekdayPattern = {
  from: string;
  to: string;
  weeks: number;
  /** Index 0 = Sunday … 6 = Saturday. */
  days: WeekdaySales[];
  best: number;
  worst: number;
};

/**
 * Average sales per weekday over whole weeks ending yesterday (today isn't over), so every
 * weekday is counted the same number of times. Null with fewer than four weeks of book or no
 * sales in them.
 */
export function weekdayPattern(book: Book, asOf: string): WeekdayPattern | null {
  if (book.firstDate === null) return null;
  const to = addDays(asOf, -1);
  const weeks = Math.min(WEEKDAY_PATTERN.maxWeeks, Math.floor((daysBetween(book.firstDate, to) + 1) / 7));
  if (weeks < WEEKDAY_PATTERN.minWeeks) return null;
  const from = addDays(to, -7 * weeks + 1);
  const records = salesBetween(book, from, to);
  if (records.length === 0) return null;

  const days: WeekdaySales[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const figure = figureOf(records.filter((r) => weekdayOf(r.businessDate) === weekday));
    return { weekday, averagePoisha: Math.round(figure.poisha / weeks), ...figure };
  });
  const byAverage = [...days].sort((a, b) => b.averagePoisha - a.averagePoisha || a.weekday - b.weekday);
  return { from, to, weeks, days, best: byAverage[0]!.weekday, worst: byAverage.at(-1)!.weekday };
}
