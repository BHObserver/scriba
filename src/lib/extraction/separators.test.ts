import { describe, expect, test } from "bun:test";
import type { Stroke } from "@/lib/images/ink-rows";
import type { BlockKind, TransactionType } from "@/lib/ledger/types";
import type { NormalizedBlock, NormalizedEntry, NormalizedExtraction } from "./parse";
import { splitAtStrokes } from "./separators";

/** A line at row `row` (40 apart on the grid), written from x 120. */
function line(id: string, block: string, text: string, type: TransactionType, row: number, extra: Partial<NormalizedEntry["values"]> = {}): NormalizedEntry {
  const amount = /(\d+|[০-৯]+)$/.exec(text)?.[1] ?? null;
  return {
    candidateId: id,
    line: row,
    values: { sourceText: text, type, customer: null, item: text.split(" ")[0]!, quantityText: null, unit: null, rateText: null, amountText: amount, balanceText: null, crossedOut: false, block, ...extra },
    reviewFields: ["type"],
    uncertaintyReason: null,
    bbox: { x_min: 120, x_max: 700, y_min: 100 + row * 40, y_max: 130 + row * 40 },
    numbers: { quantityMilli: null, ratePoisha: null, amountPoisha: null, balancePoisha: null },
  };
}
const block = (id: string, kind: BlockKind, party: string | null, title: string | null = null): NormalizedBlock => ({ id, kind, party, title, person: null, dateText: null, box: null });
/** His stroke under row `row`: in the gap, from the left of the writing, 200 long. */
const under = (row: number, at: Partial<Stroke> = {}): Stroke => ({ y: 135 + row * 40, x0: 80, x1: 280, tall: 0.1, ...at });

function reading(blocks: NormalizedBlock[], entries: NormalizedEntry[]): NormalizedExtraction {
  return {
    schemaVersion: "scriba-extraction-3",
    promptVersion: "scriba-prompt-6",
    page: { dateText: null, dateIso: null, ledgerType: "mixed", accountName: null, legibility: "clear", openingBalancePoisha: null, closingBalancePoisha: null, writtenTotals: [] },
    entries,
    blocks,
    doubts: [{ entryId: "e2", field: "type", options: ["credit_sale", "cash_sale"], note: null }],
    warnings: [],
  };
}

describe("splitAtStrokes (F2 fix 10: his lines between parts)", () => {
  test("হাবিব বাকি, a stroke, then cash sales: the sales become a day's-sales part, cash", () => {
    const r = reading([block("b1", "customer_account", "হাবিব", "হাবিব বাকি")], [
      line("e1", "b1", "তেল ২ লিটার ৩৪০", "credit_sale", 0),
      line("e2", "b1", "লবণ ১ কেজি ৪২", "credit_sale", 1),
      line("e3", "b1", "মরিচ ১০০ গ্রাম ৪৫", "credit_sale", 2),
    ]);
    const out = splitAtStrokes(r, [under(0)]);
    expect(out.blocks!.map((b) => [b.id, b.kind, b.party])).toEqual([["b1", "customer_account", "হাবিব"], ["b2", "day_sales", null]]);
    expect(out.entries.map((e) => [e.values.block, e.values.type])).toEqual([["b1", "credit_sale"], ["b2", "cash_sale"], ["b2", "cash_sale"]]);
    expect(out.entries[1]!.reviewFields).toEqual([]); // the kind is settled
    expect(out.doubts).toEqual([]);
  });

  test("cash sales read as করিম's account because of the জমা under the stroke: both pieces get their kind", () => {
    const r = reading([block("b4", "customer_account", "করিম")], [
      line("e1", "b4", "চাল ৫ কেজি ৩৬০", "credit_sale", 0),
      line("e2", "b4", "ডিম ১২ টা ১৮০", "credit_sale", 1),
      line("e3", "b4", "করিম জমা ২০০", "repayment", 2, { customer: "করিম", item: null }),
    ]);
    const out = splitAtStrokes(r, [under(1)]);
    expect(out.blocks!.map((b) => [b.id, b.kind, b.party])).toEqual([["b4", "day_sales", null], ["b5", "customer_account", "করিম"]]);
    expect(out.entries.map((e) => e.values.type)).toEqual(["cash_sale", "cash_sale", "repayment"]);
  });

  test("a জমা line with its name misread is asked about, never made a sale", () => {
    const r = reading([block("b2", "supplier_visit", "ইউনিলিভার", "ইউনিলিভারের বাকি")], [
      line("e1", "b2", "সার্ফ ১ কার্টুন ২১০০", "credit_purchase", 0),
      line("e2", "b2", "হাতে জমা ৩০০", "unknown", 1, { item: null }),
    ]);
    const out = splitAtStrokes(r, [under(0)]);
    expect(out.blocks!.map((b) => b.kind)).toEqual(["supplier_visit", "other"]);
    expect(out.entries[1]!.values.type).toBe("unknown");
  });

  test("a line drawn above a total is a sum line: no split", () => {
    const r = reading([block("b1", "day_sales", null)], [line("e1", "b1", "চাল ৭২", "cash_sale", 0), line("e2", "b1", "ডিম ৬০", "cash_sale", 1), line("e3", "b1", "মোট ১৩২", "subtotal", 2, { item: null })]);
    expect(splitAtStrokes(r, [under(1)])).toBe(r);
  });

  test("not his stroke: too short, too long, starting to the right, or inside a line", () => {
    const r = reading([block("b1", "day_sales", null)], [line("e1", "b1", "চাল ৭২", "cash_sale", 0), line("e2", "b1", "ডিম ৬০", "cash_sale", 1)]);
    expect(splitAtStrokes(r, [under(0, { x1: 150 })])).toBe(r); // a word's headline
    expect(splitAtStrokes(r, [under(0, { x1: 800 })])).toBe(r); // a piece of a ruled line
    expect(splitAtStrokes(r, [under(0, { x0: 400, x1: 650 })])).toBe(r);
    expect(splitAtStrokes(r, [under(0, { y: 115 })])).toBe(r); // through the first line
    expect(splitAtStrokes(r, [])).toBe(r);
  });

  test("strokes between parts already apart change nothing", () => {
    const r = reading([block("b1", "day_sales", null), block("b2", "customer_account", "জামাল")], [
      line("e1", "b1", "আলু ৭০", "cash_sale", 0),
      line("e2", "b2", "জামাল জমা ১৫০", "repayment", 1, { customer: "জামাল", item: null }),
    ]);
    expect(splitAtStrokes(r, [under(0)])).toBe(r);
  });
});
