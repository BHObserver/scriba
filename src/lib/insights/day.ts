/**
 * One business day: sales (cash and credit), money in, money out by type, and the cash that
 * should be in the drawer = morning cash + cash sales + repayments − cash purchases −
 * supplier payments − expenses. Credit sales and credit purchases move no cash.
 */
import { addFigures, type Book, figureOf } from "./book";
import type { Figure, InsightRecord, RecordType } from "./types";

/**
 * Where the morning cash came from:
 *  - "usual": the shop profile's usual morning cash;
 *  - "counted": what he counted when he closed `date`, the last day with business before this one;
 *  - "closed": this day is closed, so the morning cash it was closed with.
 */
export type OpeningCash = { poisha: number; source: "usual" | "counted" | "closed"; date: string | null };

export const CASH_PART_KEYS = ["opening", "cash_sale", "repayment", "purchase", "supplier_payment", "expense"] as const;
export type CashPartKey = (typeof CASH_PART_KEYS)[number];
export type CashPart = Figure & { key: CashPartKey; sign: 1 | -1 };

export type DayClosed = {
  countedPoisha: number;
  /** The expected cash when the day was closed. */
  expectedAtClosePoisha: number;
  /** Counted minus expected at close: negative is cash missing. */
  gapPoisha: number;
  /** Lines confirmed after closing changed the expected cash. */
  changedSinceClose: boolean;
};

export type DaySummary = {
  date: string;
  hasRecords: boolean;
  /** Pages with confirmed lines on this day, in capture order. */
  documentIds: string[];
  sales: Figure;
  cashSales: Figure;
  creditSales: Figure;
  repayments: Figure;
  /** Cash in: cash sales + repayments. */
  moneyIn: Figure;
  purchases: Figure;
  creditPurchases: Figure;
  supplierPayments: Figure;
  expenses: Figure;
  /** Cash out: cash purchases + supplier payments + expenses. */
  moneyOut: Figure;
  /** Adjustment lines: their direction isn't known, so no figure includes them. */
  notCounted: Figure;
  opening: OpeningCash;
  expectedCash: Figure & { parts: CashPart[] };
  close: DayClosed | null;
};

export function recordsOn(book: Book, date: string): InsightRecord[] {
  return book.records.filter((r) => r.businessDate === date);
}

export function openingCash(book: Book, date: string): OpeningCash {
  const own = book.closes.get(date);
  if (own) return { poisha: own.openingCashPoisha, source: "closed", date };

  const last = [...book.closes.keys()].filter((d) => d < date).sort().at(-1);
  // A day between the last close and this one with business of its own was never closed, so
  // what is in the drawer can't be carried forward; start from the usual cash instead.
  const unclosedBetween = last !== undefined && book.records.some((r) => r.businessDate > last && r.businessDate < date);
  if (last !== undefined && !unclosedBetween) {
    return { poisha: book.closes.get(last)!.countedCashPoisha, source: "counted", date: last };
  }
  return { poisha: book.usualOpeningCashPoisha, source: "usual", date: null };
}

export function daySummary(book: Book, date: string): DaySummary {
  const records = recordsOn(book, date);
  const of = (...types: RecordType[]) => figureOf(records.filter((r) => types.includes(r.type)));

  const cashSales = of("cash_sale");
  const creditSales = of("credit_sale");
  const repayments = of("repayment");
  const purchases = of("purchase");
  const creditPurchases = of("credit_purchase");
  const supplierPayments = of("supplier_payment");
  const expenses = of("expense");
  const opening = openingCash(book, date);

  const parts: CashPart[] = [
    { key: "opening", sign: 1, poisha: opening.poisha, recordIds: [] },
    { key: "cash_sale", sign: 1, ...cashSales },
    { key: "repayment", sign: 1, ...repayments },
    { key: "purchase", sign: -1, ...purchases },
    { key: "supplier_payment", sign: -1, ...supplierPayments },
    { key: "expense", sign: -1, ...expenses },
  ];
  const expectedCash = {
    poisha: parts.reduce((sum, p) => sum + p.sign * p.poisha, 0),
    recordIds: parts.flatMap((p) => p.recordIds),
    parts,
  };

  const own = book.closes.get(date);
  const close: DayClosed | null = own
    ? {
        countedPoisha: own.countedCashPoisha,
        expectedAtClosePoisha: own.expectedCashPoisha,
        gapPoisha: own.countedCashPoisha - own.expectedCashPoisha,
        changedSinceClose: expectedCash.poisha !== own.expectedCashPoisha,
      }
    : null;

  return {
    date,
    hasRecords: records.length > 0,
    documentIds: [...new Set(records.map((r) => r.documentId))],
    sales: addFigures(cashSales, creditSales),
    cashSales,
    creditSales,
    repayments,
    moneyIn: addFigures(cashSales, repayments),
    purchases,
    creditPurchases,
    supplierPayments,
    expenses,
    moneyOut: addFigures(purchases, supplierPayments, expenses),
    notCounted: of("adjustment"),
    opening,
    expectedCash,
    close,
  };
}

/** What a day close stores: the expected cash with its breakdown and the records behind it. */
export type DayCloseSnapshot = {
  businessDate: string;
  openingCashPoisha: number;
  expectedCashPoisha: number;
  countedCashPoisha: number;
  gapPoisha: number;
  breakdown: {
    version: 1;
    opening: { source: OpeningCash["source"]; date: string | null };
    parts: Array<{ key: CashPartKey; sign: 1 | -1; poisha: number; lines: number }>;
  };
  recordIds: string[];
};

export function dayCloseSnapshot(day: DaySummary, countedCashPoisha: number): DayCloseSnapshot {
  return {
    businessDate: day.date,
    openingCashPoisha: day.opening.poisha,
    expectedCashPoisha: day.expectedCash.poisha,
    countedCashPoisha,
    gapPoisha: countedCashPoisha - day.expectedCash.poisha,
    breakdown: {
      version: 1,
      opening: { source: day.opening.source, date: day.opening.date },
      parts: day.expectedCash.parts.map((p) => ({ key: p.key, sign: p.sign, poisha: p.poisha, lines: p.recordIds.length })),
    },
    recordIds: day.expectedCash.recordIds,
  };
}
