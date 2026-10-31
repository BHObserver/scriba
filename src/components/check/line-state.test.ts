import { describe, expect, test } from "bun:test";
import type { BoundingBox, EntryValues, LedgerType, TransactionType } from "@/lib/ledger/types";
import { type PageState, type ReviewRow, toValidationInput } from "@/lib/review/state";
import { validateLedger } from "@/lib/validation/engine";
import { lineState, revealLines, stateCounts } from "./line-state";

type Line = Partial<EntryValues> & { type: TransactionType; status?: ReviewRow["status"]; review?: ReviewRow["reviewFields"]; box?: BoundingBox | null };

function page(ledgerType: LedgerType, lines: Line[]) {
  const rows: ReviewRow[] = lines.map((l, i) => {
    const values: EntryValues = {
      sourceText: l.sourceText ?? "",
      type: l.type,
      customer: l.customer ?? null,
      item: l.item ?? null,
      quantityText: l.quantityText ?? null,
      unit: l.unit ?? null,
      rateText: l.rateText ?? null,
      amountText: l.amountText ?? null,
      balanceText: l.balanceText ?? null,
      crossedOut: l.crossedOut ?? false,
    };
    const box = l.box === undefined ? { x_min: 50, x_max: 900, y_min: 900 - i * 100, y_max: 960 - i * 100 } : l.box;
    return {
      id: `r${i + 1}`,
      extractedEntryId: null,
      lineOrder: i + 1,
      values,
      reviewFields: l.review ?? [],
      status: l.status ?? "draft",
      version: 1,
      candidate: { candidateId: `e${i + 1}`, values, bbox: box, reviewFields: l.review ?? [], uncertaintyReason: null },
    };
  });
  const state: PageState = { values: { dateText: null, ledgerType, accountName: null }, version: 1, reviewStartedAt: null };
  return { rows, findings: validateLedger(toValidationInput({ page: state, rows })) };
}

// S04 as read: opening ৮০০ misread as ৪০০, so the balance equation fails on its two ends.
const s04 = () =>
  page("customer_credit", [
    { type: "opening_balance", amountText: "৪০০" },
    { type: "credit_sale", item: "চাল", quantityText: "৩", rateText: "৬০", amountText: "১৮০" },
    { type: "credit_sale", item: "ডাল", quantityText: "১", rateText: "১৪০", amountText: "১৪০" },
    { type: "subtotal", amountText: "৩২০" },
    { type: "repayment", amountText: "১০০" },
    { type: "closing_balance", amountText: "১,০২০" },
  ]);

describe("lineState", () => {
  test("a failed balance marks its two ends; summands keep their own checks", () => {
    const { rows, findings } = s04();
    expect(lineState(findings, rows[0]!)).toBe("look");
    expect(lineState(findings, rows[1]!)).toBe("ok");
    expect(lineState(findings, rows[3]!)).toBe("ok");
    // The repayment is only in the failed balance: read, but nothing confirms it.
    expect(lineState(findings, rows[4]!)).toBe("plain");
    expect(lineState(findings, rows[5]!)).toBe("look");
  });

  test("a wrong product is a look, whatever else passes", () => {
    const { rows, findings } = page("cash_sales", [{ type: "cash_sale", item: "চাল", quantityText: "২", rateText: "৯৫", amountText: "১৮০" }]);
    expect(lineState(findings, rows[0]!)).toBe("look");
  });

  test("a field the model flagged is a look even when no rule fails", () => {
    const { rows, findings } = page("cash_sales", [{ type: "cash_sale", amountText: "৫০", review: ["amount"] }]);
    expect(lineState(findings, rows[0]!)).toBe("look");
  });

  test("a lone amount no rule covers is plain, never claimed as checked", () => {
    const { rows, findings } = page("cash_sales", [{ type: "cash_sale", item: "চা", amountText: "২০" }]);
    expect(lineState(findings, rows[0]!)).toBe("plain");
  });
});

describe("revealLines and stateCounts", () => {
  test("drawn top to bottom; rejected lines and lines without a box are left out", () => {
    const { rows, findings } = page("cash_sales", [
      { type: "cash_sale", amountText: "২০", box: { x_min: 0, x_max: 500, y_min: 600, y_max: 650 } },
      { type: "cash_sale", amountText: "৩০", box: { x_min: 0, x_max: 500, y_min: 100, y_max: 150 } },
      { type: "cash_sale", amountText: "৪০", status: "rejected" },
      { type: "cash_sale", amountText: "৫০", box: null },
    ]);
    expect(revealLines(rows, findings).map((l) => l.id)).toEqual(["r2", "r1"]);
    // The boxless line still counts; the rejected one doesn't.
    expect(stateCounts(rows, findings)).toEqual({ ok: 0, look: 0, plain: 3 });
  });

  test("S04 counts: two to look at, three that add up, one only read", () => {
    const { rows, findings } = s04();
    expect(stateCounts(rows, findings)).toEqual({ ok: 3, look: 2, plain: 1 });
  });
});

describe("written totals", () => {
  test("a wrong total is shown on the total, not on the lines above it", () => {
    const { rows, findings } = page("cash_sales", [
      { type: "cash_sale", item: "চাল", quantityText: "৩", rateText: "৬০", amountText: "১৮০" },
      { type: "cash_sale", item: "ডাল", quantityText: "১", rateText: "১৪০", amountText: "১৪০" },
      { type: "subtotal", amountText: "৩১০" },
    ]);
    expect(rows.map((r) => lineState(findings, r))).toEqual(["ok", "ok", "look"]);
  });
});
