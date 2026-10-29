import { describe, expect, test } from "bun:test";
import type { NormalizedEntry } from "@/lib/extraction/parse";
import type { TransactionType } from "@/lib/ledger/types";
import { type GroundTruth, groundTruthSchema } from "./ground-truth";
import { evaluateSample, formatRatio, summarize } from "./metrics";

// Synthetic, text-only Sample 4 ground truth (no photograph involved).
const sample4: GroundTruth = groundTruthSchema.parse({
  format: "scriba-ground-truth-1",
  sample_id: "S04",
  split: "development",
  writer: "author",
  manual_transcription_seconds: 90,
  page: { ledger_type: "customer_credit" },
  entries: [
    { line: 1, type: "opening_balance", amount: "800" },
    { line: 2, type: "credit_sale", item: "চাল", quantity: "3", unit: "কেজি", rate: "60", amount: "180" },
    { line: 3, type: "credit_sale", item: "ডাল", quantity: "1", unit: "কেজি", rate: "140", amount: "140" },
    { line: 4, type: "subtotal", amount: "310", expected_flag: true, note: "intentionally wrong; items sum to 320" },
    { line: 5, type: "repayment", amount: "100" },
    { line: 6, type: "closing_balance", amount: "1,020" },
  ],
});

type Row = { type: TransactionType; item?: string; qty?: string; unit?: string; rate?: string; amount?: string | null };

function extraction(rows: Row[]): { ledgerType: "customer_credit"; entries: NormalizedEntry[] } {
  return {
    ledgerType: "customer_credit",
    entries: rows.map((r, i) => ({
      candidateId: `e${i + 1}`,
      line: i + 1,
      values: {
        sourceText: "",
        type: r.type,
        customer: null,
        item: r.item ?? null,
        quantityText: r.qty ?? null,
        unit: r.unit ?? null,
        rateText: r.rate ?? null,
        amountText: r.amount ?? null,
        balanceText: null,
        crossedOut: false,
      },
      reviewFields: [],
      uncertaintyReason: null,
      bbox: null,
      numbers: { quantityMilli: null, ratePoisha: null, amountPoisha: null, balancePoisha: null },
    })),
  };
}

const perfect: Row[] = [
  { type: "opening_balance", amount: "৮০০" },
  { type: "credit_sale", item: "চাল", qty: "৩", unit: "কেজি", rate: "৬০", amount: "১৮০" },
  { type: "credit_sale", item: "ডাল", qty: "১", unit: "কেজি", rate: "১৪০", amount: "১৪০" },
  { type: "subtotal", amount: "৩১০" },
  { type: "repayment", amount: "১০০" },
  { type: "closing_balance", amount: "১,০২০" },
];

describe("evaluateSample", () => {
  test("a perfect reading of sample 4: the wrong subtotal is caught and is not a false alarm", () => {
    const r = evaluateSample(sample4, extraction(perfect));
    expect(r.counts.fieldsCorrect).toBe(r.counts.fieldsScored);
    expect(r.counts.amountsCorrect).toBe(6);
    expect(r.counts.amountsLabelled).toBe(6);
    expect(r.counts.expectedFlags).toBe(1);
    expect(r.counts.expectedFlagsCaught).toBe(1);
    // The rice and lentil lines are part of the failing total and so get flagged too:
    // that is counted honestly as review burden on correctly read lines.
    expect(r.counts.correctEntries).toBe(5);
    expect(r.counts.incorrectAmounts).toBe(0);
  });

  test("a misread item amount is caught by quantity × rate and does not escape", () => {
    const rows = structuredClone(perfect);
    rows[1]!.amount = "১৩০";
    const r = evaluateSample(sample4, extraction(rows));
    expect(r.counts.amountsCorrect).toBe(5);
    expect(r.counts.incorrectAmounts).toBe(1);
    expect(r.counts.incorrectAmountsCheckable).toBe(1);
    expect(r.counts.incorrectAmountsEscaped).toBe(0);
  });

  test("a misread amount with no applicable check is reported outside check coverage", () => {
    const rows = structuredClone(perfect).slice(0, 5); // closing balance not read
    rows[4]!.amount = "৭০০";
    const r = evaluateSample(sample4, extraction(rows));
    expect(r.missingEntries).toBe(1);
    expect(r.counts.incorrectAmounts).toBe(1);
    expect(r.counts.incorrectAmountsCheckable).toBe(0);
    const s = summarize([r]);
    expect(s.incorrectAmountsOutsideChecks).toBe(1);
    expect(formatRatio(s.wrongAmountEscapeRate)).toBe("N/A (0 / 0)");
  });

  test("a hallucinated extra line counts as an incorrect amount", () => {
    const rows = [...structuredClone(perfect), { type: "credit_sale" as const, amount: "৫০" }];
    const r = evaluateSample(sample4, extraction(rows));
    expect(r.extraEntries).toBe(1);
    expect(r.counts.incorrectAmounts).toBe(1);
  });

  test("unreadable ground-truth fields are excluded from scoring", () => {
    const gt = structuredClone(sample4);
    gt.entries[1]!.unreadable = ["amount"];
    const rows = structuredClone(perfect);
    rows[1]!.amount = "১৩০";
    const r = evaluateSample(gt, extraction(rows));
    expect(r.counts.amountsLabelled).toBe(5);
    expect(r.counts.incorrectAmounts).toBe(0);
  });
});

describe("summary ratios", () => {
  test("zero denominators are N/A, never 0%", () => {
    const s = summarize([]);
    expect(formatRatio(s.errorRateAmongAccepted)).toBe("N/A (0 / 0)");
    expect(formatRatio(s.fieldAccuracy)).toBe("N/A (0 / 0)");
  });

  test("ratios show numerator and denominator", () => {
    expect(formatRatio({ numerator: 5, denominator: 6 })).toBe("83.3% (5 / 6)");
  });
});
