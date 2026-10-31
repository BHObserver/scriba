import { describe, expect, test } from "bun:test";
import { prepareBook } from "./book";
import { addDays, datesFrom, weekdayOf } from "./calendar";
import { bookInput, makeRecords, type RecSpec } from "./testing";
import { salesByDay, topItems, weekComparison, weekdayPattern } from "./trends";

const AS_OF = "2026-11-01"; // a Sunday
const ago = (days: number) => addDays(AS_OF, -days);
const bookOf = (specs: RecSpec[]) => prepareBook(bookInput(makeRecords(specs)));

describe("salesByDay", () => {
  test("every day in the range, with cash and credit; other lines don't count", () => {
    const book = bookOf([
      { date: ago(2), type: "cash_sale", taka: 100 },
      { date: ago(2), type: "credit_sale", taka: 50 },
      { date: ago(2), type: "expense", taka: 70 },
      { date: ago(0), type: "repayment", taka: 500 },
    ]);
    const days = salesByDay(book, ago(2), AS_OF);
    expect(days.map((d) => [d.date, d.sales.poisha, d.cashPoisha, d.creditPoisha])).toEqual([
      [ago(2), 15_000, 10_000, 5_000],
      [ago(1), 0, 0, 0],
      [AS_OF, 0, 0, 0],
    ]);
    expect(days[0]!.sales.recordIds).toEqual(["r1", "r2"]);
  });
});

describe("weekComparison", () => {
  test("no comparison until the book reaches back two weeks", () => {
    const week = weekComparison(bookOf([{ date: ago(12), type: "cash_sale", taka: 100 }, { date: ago(1), type: "cash_sale", taka: 300 }]), AS_OF);
    expect(week.days).toHaveLength(7);
    expect(week.from).toBe(ago(6));
    expect(week.total.poisha).toBe(30_000);
    expect(week.previous).toBeNull();
    expect(week.diffPoisha).toBeNull();
  });

  test("this week against the week before", () => {
    const week = weekComparison(
      bookOf([
        { date: ago(13), type: "cash_sale", taka: 1000 },
        { date: ago(7), type: "credit_sale", taka: 500 },
        { date: ago(6), type: "cash_sale", taka: 2000 },
        { date: ago(0), type: "credit_sale", taka: 100 },
      ]),
      AS_OF,
    );
    expect(week.total.poisha).toBe(210_000);
    expect(week.previous?.poisha).toBe(150_000);
    expect(week.diffPoisha).toBe(60_000);
    expect(week.averagePoisha).toBe(30_000);
  });

  test("an empty book", () => {
    const week = weekComparison(bookOf([]), AS_OF);
    expect(week.total).toEqual({ poisha: 0, recordIds: [] });
    expect(week.previous).toBeNull();
  });
});

describe("topItems", () => {
  test("adds up spellings of one item and names it as he writes it most", () => {
    const items = topItems(
      bookOf([
        { date: ago(1), type: "cash_sale", taka: 600, item: "চাল" },
        { date: ago(1), type: "credit_sale", taka: 300, item: " চাল " },
        { date: ago(0), type: "cash_sale", taka: 200, item: "চাল" },
        { date: ago(0), type: "cash_sale", taka: 900, item: "সয়াবিন  তেল" },
        { date: ago(0), type: "cash_sale", taka: 50, item: "সয়াবিন তেল" },
        { date: ago(0), type: "cash_sale", taka: 999 },
        { date: ago(0), type: "purchase", taka: 5000, item: "চাল" },
      ]),
      ago(6),
      AS_OF,
    );
    expect(items.map((i) => [i.name, i.poisha, i.lines])).toEqual([
      ["চাল", 110_000, 3],
      ["সয়াবিন তেল", 95_000, 2],
    ]);
  });

  test("keeps only the top few", () => {
    const specs = ["ক", "খ", "গ"].map((item, i) => ({ date: AS_OF, type: "cash_sale" as const, taka: 100 * (i + 1), item }));
    expect(topItems(bookOf(specs), AS_OF, AS_OF, 2).map((i) => i.name)).toEqual(["গ", "খ"]);
  });
});

describe("weekdayPattern", () => {
  /** A cash sale every day for `days` days ending yesterday, larger on Fridays, plus today. */
  function daily(days: number): RecSpec[] {
    const specs: RecSpec[] = datesFrom(ago(days), ago(1)).map((date) => ({
      date,
      type: "cash_sale",
      taka: weekdayOf(date) === 5 ? 900 : 300,
    }));
    specs.push({ date: AS_OF, type: "cash_sale", taka: 99_999 });
    return specs;
  }

  test("needs four weeks of book", () => {
    expect(weekdayPattern(bookOf(daily(27)), AS_OF)).toBeNull();
    expect(weekdayPattern(bookOf([]), AS_OF)).toBeNull();
  });

  test("averages each weekday over whole weeks, leaving today out", () => {
    const pattern = weekdayPattern(bookOf(daily(30)), AS_OF)!;
    expect(pattern.weeks).toBe(4);
    expect(pattern.to).toBe(ago(1));
    expect(pattern.from).toBe(ago(28));
    expect(pattern.days[5]!.averagePoisha).toBe(90_000);
    expect(pattern.days[0]!.averagePoisha).toBe(30_000);
    expect(pattern.days[0]!.recordIds).toHaveLength(4);
    expect(pattern.best).toBe(5);
    expect(pattern.worst).not.toBe(5);
  });

  test("uses at most twelve weeks", () => {
    expect(weekdayPattern(bookOf(daily(120)), AS_OF)?.weeks).toBe(12);
  });

  test("no sales in the window: no pattern", () => {
    expect(weekdayPattern(bookOf([{ date: ago(60), type: "expense", taka: 10 }]), AS_OF)).toBeNull();
  });
});
