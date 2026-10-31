import { describe, expect, test } from "bun:test";
import { prepareBook } from "./book";
import { daySummary, dayCloseSnapshot, openingCash } from "./day";
import { bookInput, makeRecords, SAMPLE_TODAY, sampleShop } from "./testing";
import type { InsightDayClose } from "./types";

const close = (businessDate: string, counted: number, expected = counted, opening = 0): InsightDayClose => ({
  businessDate,
  countedCashPoisha: counted * 100,
  expectedCashPoisha: expected * 100,
  openingCashPoisha: opening * 100,
});

describe("daySummary on D3's sample shop", () => {
  const day = daySummary(prepareBook(sampleShop()), SAMPLE_TODAY);

  test("the drawer should hold ৳৪,৩২০, as in the prototype", () => {
    expect(day.expectedCash.poisha).toBe(432_000);
    expect(day.expectedCash.parts.map((p) => [p.key, p.sign * p.poisha])).toEqual([
      ["opening", 150_000],
      ["cash_sale", 495_000],
      ["repayment", 60_000],
      ["purchase", -180_000],
      ["supplier_payment", -60_000],
      ["expense", -33_000],
    ]);
    expect(day.opening).toEqual({ poisha: 150_000, source: "usual", date: null });
  });

  test("sales, cash and credit, money in and out", () => {
    expect(day.sales.poisha).toBe(629_000);
    expect(day.cashSales.poisha).toBe(495_000);
    expect(day.creditSales.poisha).toBe(134_000);
    expect(day.moneyIn.poisha).toBe(555_000);
    expect(day.moneyOut.poisha).toBe(273_000);
    expect(day.creditPurchases.poisha).toBe(0);
    expect(day.documentIds).toEqual(["p1", "p2", "p3"]);
  });

  test("every figure names the records it was added from", () => {
    expect(day.cashSales.recordIds).toHaveLength(9);
    expect(day.sales.recordIds).toHaveLength(9 + 7);
    expect(day.expenses.recordIds).toHaveLength(3);
    // The drawer is backed by every cash line of the day: 9 sales, 2 repayments, 2 purchases, 1 payment, 3 costs.
    expect(day.expectedCash.recordIds).toHaveLength(17);
  });

  test("an earlier day only has its own lines", () => {
    const earlier = daySummary(prepareBook(sampleShop()), "2026-10-29");
    expect(earlier.sales.poisha).toBe(4 * 140 * 100 + 25 * 60 * 100);
    expect(earlier.expectedCash.poisha).toBe(150_000);
  });
});

describe("daySummary edge cases", () => {
  test("an empty book: only the morning cash", () => {
    const day = daySummary(prepareBook(bookInput([], { usualOpeningCashPoisha: 200_000 })), "2026-11-01");
    expect(day.hasRecords).toBe(false);
    expect(day.sales).toEqual({ poisha: 0, recordIds: [] });
    expect(day.expectedCash.poisha).toBe(200_000);
    expect(day.close).toBeNull();
  });

  test("credit sales and credit purchases move no cash; markers count nowhere", () => {
    const records = makeRecords([
      { date: "2026-11-01", type: "opening_balance", taka: 900, party: "k" },
      { date: "2026-11-01", type: "credit_sale", taka: 300, party: "k" },
      { date: "2026-11-01", type: "credit_purchase", taka: 5000, party: "s" },
      { date: "2026-11-01", type: "subtotal", taka: 300 },
      { date: "2026-11-01", type: "closing_balance", taka: 1200, party: "k" },
    ]);
    const day = daySummary(prepareBook(bookInput(records)), "2026-11-01");
    expect(day.expectedCash.poisha).toBe(0);
    expect(day.expectedCash.recordIds).toEqual([]);
    expect(day.sales.poisha).toBe(30_000);
    expect(day.creditPurchases.poisha).toBe(500_000);
    expect(day.moneyOut.poisha).toBe(0);
  });

  test("adjustments are kept apart: no figure includes them", () => {
    const records = makeRecords([
      { date: "2026-11-01", type: "cash_sale", taka: 100 },
      { date: "2026-11-01", type: "adjustment", taka: 40, id: "adj" },
    ]);
    const day = daySummary(prepareBook(bookInput(records)), "2026-11-01");
    expect(day.notCounted).toEqual({ poisha: 4_000, recordIds: ["adj"] });
    expect(day.expectedCash.poisha).toBe(10_000);
  });

  test("a corrected line counts at the value he confirmed, and a superseded reading not at all", () => {
    const records = makeRecords([
      { date: "2026-11-01", type: "cash_sale", taka: 400, doc: "p", run: "a", confirmedAt: "2026-11-01T08:00:00.000Z" },
      { date: "2026-11-01", type: "cash_sale", taka: 800, doc: "p", run: "b", confirmedAt: "2026-11-01T09:00:00.000Z", corrected: true, id: "fixed" },
    ]);
    const day = daySummary(prepareBook(bookInput(records)), "2026-11-01");
    expect(day.cashSales).toEqual({ poisha: 80_000, recordIds: ["fixed"] });
  });
});

describe("morning cash", () => {
  const sale = (date: string) => ({ date, type: "cash_sale" as const, taka: 100 });

  test("yesterday's counted cash when yesterday was closed", () => {
    const book = prepareBook(bookInput(makeRecords([sale("2026-10-31")]), { closes: [close("2026-10-31", 4300)], usualOpeningCashPoisha: 150_000 }));
    expect(openingCash(book, "2026-11-01")).toEqual({ poisha: 430_000, source: "counted", date: "2026-10-31" });
  });

  test("carried over days without business (the shop was shut)", () => {
    const book = prepareBook(bookInput(makeRecords([sale("2026-10-29")]), { closes: [close("2026-10-29", 4300)], usualOpeningCashPoisha: 150_000 }));
    expect(openingCash(book, "2026-11-01")).toEqual({ poisha: 430_000, source: "counted", date: "2026-10-29" });
  });

  test("the usual cash when a day with business since the last close was never closed", () => {
    const book = prepareBook(
      bookInput(makeRecords([sale("2026-10-29"), sale("2026-10-31")]), { closes: [close("2026-10-29", 4300)], usualOpeningCashPoisha: 150_000 }),
    );
    expect(openingCash(book, "2026-11-01")).toEqual({ poisha: 150_000, source: "usual", date: null });
  });

  test("a closed day keeps the morning cash it was closed with, and shows the gap", () => {
    const records = makeRecords([sale("2026-11-01")]);
    const closes = [close("2026-10-31", 4300), close("2026-11-01", 4350, 4400, 4300)];
    const day = daySummary(prepareBook(bookInput(records, { closes, usualOpeningCashPoisha: 150_000 })), "2026-11-01");
    expect(day.opening).toEqual({ poisha: 430_000, source: "closed", date: "2026-11-01" });
    expect(day.expectedCash.poisha).toBe(440_000);
    expect(day.close).toEqual({ countedPoisha: 435_000, expectedAtClosePoisha: 440_000, gapPoisha: -5_000, changedSinceClose: false });
  });

  test("a line confirmed after closing is noticed", () => {
    const records = makeRecords([sale("2026-11-01"), sale("2026-11-01")]);
    const closes = [close("2026-11-01", 100, 100, 0)];
    const day = daySummary(prepareBook(bookInput(records, { closes })), "2026-11-01");
    expect(day.expectedCash.poisha).toBe(20_000);
    expect(day.close?.changedSinceClose).toBe(true);
  });
});

describe("dayCloseSnapshot", () => {
  test("stores the expected cash, its breakdown, the records and the gap", () => {
    const day = daySummary(prepareBook(sampleShop()), SAMPLE_TODAY);
    const snap = dayCloseSnapshot(day, 427_000);
    expect(snap.expectedCashPoisha).toBe(432_000);
    expect(snap.gapPoisha).toBe(-5_000);
    expect(snap.openingCashPoisha).toBe(150_000);
    expect(snap.breakdown.opening).toEqual({ source: "usual", date: null });
    expect(snap.breakdown.parts.find((p) => p.key === "expense")).toEqual({ key: "expense", sign: -1, poisha: 33_000, lines: 3 });
    expect(snap.recordIds).toHaveLength(17);
  });
});
