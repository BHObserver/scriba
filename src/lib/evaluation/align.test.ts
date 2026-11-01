import { describe, expect, test } from "bun:test";
import type { NormalizedEntry } from "@/lib/extraction/parse";
import type { TransactionType } from "@/lib/ledger/types";
import { alignByContent, lineSimilarity } from "./align";
import { type GroundTruth, groundTruthSchema } from "./ground-truth";
import { evaluateSample } from "./metrics";

// V02's sales block as drafted: one written line "চিনি ১৬০ + চাল ১৪০ — ২৭০" is lines 3-5.
const truth: GroundTruth = groundTruthSchema.parse({
  format: "scriba-ground-truth-1",
  sample_id: "V02",
  split: "development",
  writer: "author",
  page: { ledger_type: "mixed" },
  entries: [
    { line: 1, type: "cash_sale", item: "বিস্কুট", quantity: "2", unit: "প্যাকেট", amount: "60" },
    { line: 2, type: "cash_sale", item: "দুধ", quantity: "200", unit: "গ্রাম", amount: "260" },
    { line: 3, type: "cash_sale", item: "চিনি", amount: "160" },
    { line: 4, type: "cash_sale", item: "চাল", amount: "140" },
    { line: 5, type: "subtotal", amount: "270" },
    { line: 6, type: "cash_sale", item: "আলু", quantity: "2", unit: "কেজি", amount: "70" },
    { line: 7, type: "opening_balance", amount: "1600" },
  ],
});

type Row = { type: TransactionType; item?: string; qty?: string; unit?: string; amount?: string };

function reading(rows: Row[]): NormalizedEntry[] {
  return rows.map((r, i) => ({
    candidateId: `e${i + 1}`,
    line: i + 1,
    values: {
      sourceText: "",
      type: r.type,
      customer: null,
      item: r.item ?? null,
      quantityText: r.qty ?? null,
      unit: r.unit ?? null,
      rateText: null,
      amountText: r.amount ?? null,
      balanceText: null,
      crossedOut: false,
    },
    reviewFields: [],
    uncertaintyReason: null,
    bbox: null,
    numbers: { quantityMilli: null, ratePoisha: null, amountPoisha: null, balancePoisha: null },
  }));
}

const exact: Row[] = [
  { type: "cash_sale", item: "বিস্কুট", qty: "২", unit: "প্যাকেট", amount: "৬০" },
  { type: "cash_sale", item: "দুধ", qty: "২০০", unit: "গ্রাম", amount: "২৬০" },
  { type: "cash_sale", item: "চিনি", amount: "১৬০" },
  { type: "cash_sale", item: "চাল", amount: "১৪০" },
  { type: "subtotal", amount: "২৭০" },
  { type: "cash_sale", item: "আলু", qty: "২", unit: "কেজি", amount: "৭০" },
  { type: "opening_balance", amount: "১৬০০" },
];
// The model's reading: the written line as one line, with its written total.
const merged: Row[] = [exact[0]!, exact[1]!, { type: "cash_sale", item: "চিনি + চাল", amount: "২৭০" }, exact[5]!, exact[6]!];

describe("line similarity", () => {
  test("shared amounts and names count most; a name inside a merged name counts half; nothing shared is 0", () => {
    const [biscuit, , sugar, , subtotal] = truth.entries;
    expect(lineSimilarity(biscuit!, reading([exact[0]!])[0]!.values)).toBe(3 + 3 + 1 + 0.5 + 1);
    expect(lineSimilarity(sugar!, reading([merged[2]!])[0]!.values)).toBe(1.5 + 1);
    expect(lineSimilarity(subtotal!, reading([merged[2]!])[0]!.values)).toBe(3);
    expect(lineSimilarity(subtotal!, reading([{ type: "cash_sale", item: "আলু", amount: "৭০" }])[0]!.values)).toBe(0);
  });

  test("type codes are compared whole, not as text inside text", () => {
    const purchase = groundTruthSchema.shape.entries.element.parse({ line: 1, type: "purchase" });
    expect(lineSimilarity(purchase, reading([{ type: "credit_purchase" }])[0]!.values)).toBe(0);
  });
});

describe("align by content", () => {
  test("an exact reading pairs every line with its own", () => {
    expect(alignByContent(truth.entries, reading(exact))).toEqual(truth.entries.map((e) => ({ gtLine: e.line, line: e.line })));
  });

  test("a merged line costs only its own lines: the rest still pair with their own", () => {
    const pairs = alignByContent(truth.entries, reading(merged));
    expect(pairs).toEqual([
      { gtLine: 1, line: 1 },
      { gtLine: 2, line: 2 },
      { gtLine: 3, line: null },
      { gtLine: 4, line: null },
      { gtLine: 5, line: 3 },
      { gtLine: 6, line: 4 },
      { gtLine: 7, line: 5 },
    ]);
  });

  test("a misread line still pairs by what it shares; a line sharing nothing is missing and extra", () => {
    const misread = [...exact];
    misread[5] = { type: "cash_sale", item: "আলু", qty: "২", unit: "কেজি", amount: "৯০" };
    expect(alignByContent(truth.entries, reading(misread))[5]).toEqual({ gtLine: 6, line: 6 });
    const stranger: Row[] = [...exact.slice(0, 6), { type: "unknown", item: "ফোন", amount: "৫০০" }];
    expect(alignByContent(truth.entries, reading(stranger)).slice(-2)).toEqual([
      { gtLine: 7, line: null },
      { gtLine: null, line: 7 },
    ]);
  });
});

describe("evaluateSample with content pairs", () => {
  test("without pairs a merged line misaligns everything after it; with them only its lines are lost", () => {
    const strict = evaluateSample(truth, { ledgerType: "mixed", entries: reading(merged) });
    expect(strict.counts.amountsCorrect).toBe(2);
    expect(strict.missingEntries).toBe(2);

    const pairs = alignByContent(truth.entries, reading(merged));
    const aligned = evaluateSample(truth, { ledgerType: "mixed", entries: reading(merged) }, pairs);
    // 60, 260, the written 270, 70 and 1600 are right; 160 and 140 are not read as lines.
    expect(aligned.counts.amountsCorrect).toBe(5);
    expect(aligned.counts.amountsLabelled).toBe(7);
    expect(aligned.missingEntries).toBe(2);
    expect(aligned.extraEntries).toBe(0);
  });

  test("order pairs give the same result as no pairs", () => {
    const rows = reading(merged);
    const order = Array.from({ length: 7 }, (_, i) => ({ gtLine: i + 1, line: i < rows.length ? i + 1 : null }));
    expect(evaluateSample(truth, { ledgerType: "mixed", entries: rows }, order)).toEqual(
      evaluateSample(truth, { ledgerType: "mixed", entries: rows }),
    );
  });
});
