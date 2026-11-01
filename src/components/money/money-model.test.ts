import { describe, expect, test } from "bun:test";
import { makeI18n } from "@/lib/i18n/format";
import { prepareBook } from "@/lib/insights/book";
import { daySummary } from "@/lib/insights/day";
import { bookInput, makeRecords, SAMPLE_TODAY, sampleShop } from "@/lib/insights/testing";
import { salesByDay } from "@/lib/insights/trends";
import {
  closeMode,
  drawerEquation,
  drillFigure,
  gapReasons,
  lineWhat,
  outParts,
  partLabel,
  waitingPages,
  weekLine,
  weekTop,
} from "./money-model";

const bn = makeI18n("bn");
const en = makeI18n("en");
const sample = () => daySummary(prepareBook(sampleShop()), SAMPLE_TODAY);

describe("Today's figures", () => {
  test("the cover equation is the prototype's, in both languages", () => {
    const day = sample();
    expect(bn.money(day.expectedCash.poisha)).toBe("৳৪,৩২০");
    expect(drawerEquation(day, bn)).toMatch(/^সকালে ১,৫০০ \+ নগদ বিক্রি ৪,৯৫০ \+ জমা [০-৯,]+ − কেনা ও খরচ [০-৯,]+$/);
    expect(drawerEquation(day, en)).toMatch(/^Morning 1,500 \+ cash sales 4,950 \+ paid back [0-9,]+ − buying and costs [0-9,]+$/);
  });

  test("the money-out legend adds up to the tile", () => {
    const day = sample();
    const sum = outParts(day).reduce((s, p) => s + p.figure.poisha, 0);
    expect(sum).toBe(day.moneyOut.poisha);
  });

  test("every drill key opens the lines of its own figure", () => {
    const day = sample();
    expect(drillFigure(day, "sales").figure).toEqual(day.sales);
    expect(drillFigure(day, "out").figure).toEqual(day.moneyOut);
    const repaid = drillFigure(day, "repayment");
    expect(repaid.title).toBe("type.repayment");
    expect(repaid.figure.poisha).toBe(day.repayments.poisha);
    expect(repaid.figure.recordIds).toEqual(day.repayments.recordIds);
  });

  test("the morning cash row says when it was counted", () => {
    const records = makeRecords([
      { date: "2026-10-30", type: "cash_sale", taka: 100 },
      { date: "2026-10-31", type: "cash_sale", taka: 50 },
    ]);
    const closes = [{ businessDate: "2026-10-30", openingCashPoisha: 0, expectedCashPoisha: 10_000, countedCashPoisha: 10_000 }];
    const day = daySummary(prepareBook(bookInput(records, { closes })), "2026-10-31");
    const opening = day.expectedCash.parts[0]!;
    expect(partLabel(opening, day, bn)).toBe("সকালের টাকা (৩০ অক্টোবর গোনা)");
    expect(partLabel(day.expectedCash.parts[1]!, day, en)).toBe("Cash sale");
    expect(partLabel(opening, sample(), en)).toBe("Morning cash");
  });
});

describe("seven days", () => {
  test("the top rounds the best day up to a thousand taka, never zero", () => {
    const book = prepareBook(sampleShop());
    const days = salesByDay(book, "2026-10-25", SAMPLE_TODAY);
    const best = Math.max(...days.map((d) => d.sales.poisha));
    expect(weekTop(days)).toBeGreaterThanOrEqual(best);
    expect(weekTop(days) % 100_000).toBe(0);
    expect(weekTop([])).toBe(100_000);
  });

  test("the comparison line has no comparison when the book is too short", () => {
    expect(weekLine(629_000, null, bn)).toBe("মোট ৳৬,২৯০");
    expect(weekLine(629_000, 120_000, bn)).toBe("মোট ৳৬,২৯০ · আগের সাত দিনের চেয়ে ৳১,২০০ বেশি");
    expect(weekLine(629_000, -5_000, en)).toBe("Total ৳6,290 · ৳50 less than the seven days before");
    expect(weekLine(629_000, 0, en)).toBe("Total ৳6,290 · the same as the seven days before");
  });
});

describe("pages and the close", () => {
  test("waiting and unread pages open the deck in capture order", () => {
    const pages = [
      { documentId: "a", state: "checked" as const, waitingLines: 0, confirmedLines: 5 },
      { documentId: "b", state: "waiting" as const, waitingLines: 3, confirmedLines: 0 },
      { documentId: "c", state: "unread" as const, waitingLines: 0, confirmedLines: 0 },
    ];
    expect(waitingPages(pages)).toEqual({ ids: ["b", "c"], href: "/check/b?pages=b,c" });
    expect(waitingPages(pages.slice(0, 1))).toEqual({ ids: [], href: null });
    expect(waitingPages(pages, "/close").href).toBe("/check/b?pages=b,c&from=/close");
  });

  test("a count matches only to the poisha", () => {
    const day = sample();
    expect(closeMode(day, null)).toBe("review");
    expect(closeMode(day, day.expectedCash.poisha)).toBe("match");
    expect(closeMode(day, day.expectedCash.poisha - 1)).toBe("gap");
    expect(closeMode({ ...day, close: { countedPoisha: 1, expectedAtClosePoisha: 1, gapPoisha: 0, changedSinceClose: false } }, null)).toBe("closed");
  });

  test("short and over have different likely reasons", () => {
    expect(gapReasons(-5_000)).toContain("cl.why.cost");
    expect(gapReasons(2_000)).toContain("cl.why.sale");
    expect(gapReasons(-1)).not.toEqual(gapReasons(1));
  });
});

describe("a drill-down line", () => {
  const line = { name: "করিম", item: "চাল", quantityText: "২", unit: "কেজি", rateText: "৬০", type: "credit_sale" as const };

  test("name, item and the reading, digits in the locale", () => {
    expect(lineWhat(line, bn)).toBe("করিম · চাল · ২ কেজি × ৬০");
    expect(lineWhat(line, en)).toBe("করিম · চাল · 2 কেজি × 60");
  });

  test("a bare amount falls back to its kind", () => {
    expect(lineWhat({ ...line, name: null, item: " ", quantityText: null, rateText: null }, en)).toBe("Sold on credit");
  });
});
