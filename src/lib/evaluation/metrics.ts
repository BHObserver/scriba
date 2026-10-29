/**
 * Evaluation metrics, computed from stored model output and independent ground
 * truth. Pure functions: no model call, no database.
 *
 * Every ratio is returned as numerator and denominator. A zero denominator is
 * reported as N/A by the UI, never as 0%.
 */
import type { NormalizedEntry } from "@/lib/extraction/parse";
import type { EntryValues, LedgerType, ReviewableField } from "@/lib/ledger/types";
import { parseMoney, parseQuantity, parseRate } from "@/lib/numerals";
import { assessEntry } from "@/lib/review/approval";
import { ARITHMETIC_RULES, type Finding, type ValidationEntry, validateLedger } from "@/lib/validation/engine";
import type { GroundTruth, GroundTruthEntry } from "./ground-truth";

export const METRICS_VERSION = "scriba-metrics-1";

export const SCORED_FIELDS = ["type", "customer", "item", "qty", "unit", "rate", "amount", "balance"] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

export type Ratio = { numerator: number; denominator: number };

export type FieldComparison = {
  gtLine: number | null;
  extractedLine: number | null;
  field: ScoredField;
  expected: string | number | null;
  observed: string | number | null;
  correct: boolean;
};

export type SampleEvaluation = {
  sampleId: string;
  split: GroundTruth["split"];
  gtEntries: number;
  extractedEntries: number;
  missingEntries: number;
  extraEntries: number;
  comparisons: FieldComparison[];
  counts: {
    fieldsCorrect: number;
    fieldsScored: number;
    amountsLabelled: number;
    amountsCorrect: number;
    incorrectAmounts: number;
    incorrectAmountsCheckable: number;
    incorrectAmountsEscaped: number;
    unflaggedAmounts: number;
    unflaggedIncorrectAmounts: number;
    entriesFlagged: number;
    correctEntries: number;
    correctEntriesFalselyFlagged: number;
    expectedFlags: number;
    expectedFlagsCaught: number;
  };
};

const normText = (s: string | null | undefined) =>
  s == null ? null : s.normalize("NFC").replace(/\s+/g, " ").trim() || null;

function numberOrText(parse: typeof parseMoney, text: string | null): number | string | null {
  if (text == null || text.trim() === "") return null;
  const p = parse(text);
  return p.ok ? p.value : `unparsed:${normText(text)}`;
}

function expectedValue(gt: GroundTruthEntry, field: ScoredField): string | number | null {
  switch (field) {
    case "type":
      return gt.type;
    case "customer":
      return normText(gt.customer);
    case "item":
      return normText(gt.item);
    case "unit":
      return normText(gt.unit);
    case "qty":
      return numberOrText(parseQuantity, gt.quantity);
    case "rate":
      return numberOrText(parseRate, gt.rate);
    case "amount":
      return numberOrText(parseMoney, gt.amount);
    case "balance":
      return numberOrText(parseMoney, gt.balance);
  }
}

function observedValue(v: EntryValues, field: ScoredField): string | number | null {
  switch (field) {
    case "type":
      return v.type;
    case "customer":
      return normText(v.customer);
    case "item":
      return normText(v.item);
    case "unit":
      return normText(v.unit);
    case "qty":
      return numberOrText(parseQuantity, v.quantityText);
    case "rate":
      return numberOrText(parseRate, v.rateText);
    case "amount":
      return numberOrText(parseMoney, v.amountText);
    case "balance":
      return numberOrText(parseMoney, v.balanceText);
  }
}

const SCORED_TO_REVIEWABLE: Record<ScoredField, ReviewableField> = {
  type: "type",
  customer: "customer",
  item: "item",
  qty: "qty",
  unit: "unit",
  rate: "rate",
  amount: "amount",
  balance: "balance",
};

/** An entry "needs human attention" when it has a blocker or anything that must be acknowledged. */
export function isFlagged(entry: ValidationEntry, findings: Finding[]): boolean {
  const a = assessEntry(entry, findings);
  return a.blockers.length > 0 || a.needsAck.length > 0;
}

/** At least one arithmetic rule actually ran (pass or fail) on this entry. */
export function isArithmeticallyChecked(entryId: string, findings: Finding[]): boolean {
  return findings.some(
    (f) => ARITHMETIC_RULES.has(f.ruleId) && f.status !== "unverifiable" && f.entryIds.includes(entryId),
  );
}

/**
 * Evaluate the model's original output for one image against its ground truth.
 * Entries are aligned by reading order (line 1 with line 1, ...). This is strict:
 * a split or merged line misaligns everything after it, which is counted as error.
 */
export function evaluateSample(
  gt: GroundTruth,
  extracted: { ledgerType: LedgerType; entries: NormalizedEntry[] },
): SampleEvaluation {
  const gtEntries = [...gt.entries].sort((a, b) => a.line - b.line);
  const exEntries = [...extracted.entries].sort((a, b) => a.line - b.line);

  const validationEntries: ValidationEntry[] = exEntries.map((e) => ({
    id: e.candidateId,
    line: e.line,
    values: e.values,
    reviewFields: e.reviewFields,
    uncertaintyReason: e.uncertaintyReason,
    excluded: false,
  }));
  const findings = validateLedger({
    page: { ledgerType: extracted.ledgerType, dateText: null, accountName: null },
    entries: validationEntries,
  });

  const comparisons: FieldComparison[] = [];
  const c: SampleEvaluation["counts"] = {
    fieldsCorrect: 0,
    fieldsScored: 0,
    amountsLabelled: 0,
    amountsCorrect: 0,
    incorrectAmounts: 0,
    incorrectAmountsCheckable: 0,
    incorrectAmountsEscaped: 0,
    unflaggedAmounts: 0,
    unflaggedIncorrectAmounts: 0,
    entriesFlagged: 0,
    correctEntries: 0,
    correctEntriesFalselyFlagged: 0,
    expectedFlags: 0,
    expectedFlagsCaught: 0,
  };

  const length = Math.max(gtEntries.length, exEntries.length);
  for (let i = 0; i < length; i++) {
    const g = gtEntries[i];
    const x = exEntries[i];
    const v = x ? validationEntries[i]! : null;
    const flagged = v ? isFlagged(v, findings) : false;
    if (v && flagged) c.entriesFlagged++;

    let allCorrect = Boolean(g && x);
    for (const field of SCORED_FIELDS) {
      if (g?.unreadable.includes(SCORED_TO_REVIEWABLE[field])) continue;
      const expected = g ? expectedValue(g, field) : null;
      const observed = x ? observedValue(x.values, field) : null;
      // A field absent from both sides of a missing/extra line carries no information.
      if (!g && observed == null) continue;
      if (!x && expected == null) continue;
      const correct = Boolean(g && x) && expected === observed;
      comparisons.push({ gtLine: g?.line ?? null, extractedLine: x?.line ?? null, field, expected, observed, correct });
      c.fieldsScored++;
      if (correct) c.fieldsCorrect++;
      else allCorrect = false;
    }

    // Amounts
    const gAmount = g && !g.unreadable.includes("amount") ? expectedValue(g, "amount") : null;
    const xAmount = x ? observedValue(x.values, "amount") : null;
    if (g && gAmount != null) {
      c.amountsLabelled++;
      if (x && xAmount === gAmount) c.amountsCorrect++;
    }
    if (x && typeof xAmount === "number") {
      const unreadableInGt = g?.unreadable.includes("amount") ?? false;
      if (!unreadableInGt) {
        const incorrect = !g || xAmount !== gAmount;
        if (!flagged) {
          c.unflaggedAmounts++;
          if (incorrect) c.unflaggedIncorrectAmounts++;
        }
        if (incorrect) {
          c.incorrectAmounts++;
          if (isArithmeticallyChecked(x.candidateId, findings)) {
            c.incorrectAmountsCheckable++;
            if (!flagged) c.incorrectAmountsEscaped++;
          }
        }
      }
    }

    if (g?.expected_flag) {
      c.expectedFlags++;
      if (flagged) c.expectedFlagsCaught++;
    } else if (g && x && allCorrect) {
      c.correctEntries++;
      if (flagged) c.correctEntriesFalselyFlagged++;
    }
  }

  return {
    sampleId: gt.sample_id,
    split: gt.split,
    gtEntries: gtEntries.length,
    extractedEntries: exEntries.length,
    missingEntries: Math.max(0, gtEntries.length - exEntries.length),
    extraEntries: Math.max(0, exEntries.length - gtEntries.length),
    comparisons,
    counts: c,
  };
}

export type EvaluationSummary = {
  metricsVersion: string;
  samples: number;
  fieldAccuracy: Ratio;
  fieldAccuracyByField: Record<ScoredField, Ratio>;
  exactAmountAccuracy: Ratio;
  wrongAmountEscapeRate: Ratio;
  incorrectAmountsOutsideChecks: number;
  errorRateAmongAccepted: Ratio;
  reviewRate: Ratio;
  falseAlarmRate: Ratio;
  expectedFlagRecall: Ratio;
  entryCountMismatches: number;
};

export function summarize(samples: SampleEvaluation[]): EvaluationSummary {
  const sum = (k: keyof SampleEvaluation["counts"]) => samples.reduce((s, x) => s + x.counts[k], 0);
  const byField = Object.fromEntries(
    SCORED_FIELDS.map((f) => {
      const comps = samples.flatMap((s) => s.comparisons.filter((c) => c.field === f));
      return [f, { numerator: comps.filter((c) => c.correct).length, denominator: comps.length }];
    }),
  ) as Record<ScoredField, Ratio>;
  return {
    metricsVersion: METRICS_VERSION,
    samples: samples.length,
    fieldAccuracy: { numerator: sum("fieldsCorrect"), denominator: sum("fieldsScored") },
    fieldAccuracyByField: byField,
    exactAmountAccuracy: { numerator: sum("amountsCorrect"), denominator: sum("amountsLabelled") },
    wrongAmountEscapeRate: { numerator: sum("incorrectAmountsEscaped"), denominator: sum("incorrectAmountsCheckable") },
    incorrectAmountsOutsideChecks: sum("incorrectAmounts") - sum("incorrectAmountsCheckable"),
    errorRateAmongAccepted: { numerator: sum("unflaggedIncorrectAmounts"), denominator: sum("unflaggedAmounts") },
    reviewRate: { numerator: sum("entriesFlagged"), denominator: samples.reduce((s, x) => s + x.extractedEntries, 0) },
    falseAlarmRate: { numerator: sum("correctEntriesFalselyFlagged"), denominator: sum("correctEntries") },
    expectedFlagRecall: { numerator: sum("expectedFlagsCaught"), denominator: sum("expectedFlags") },
    entryCountMismatches: samples.filter((s) => s.gtEntries !== s.extractedEntries).length,
  };
}

export function formatRatio(r: Ratio): string {
  if (r.denominator === 0) return `N/A (0 / 0)`;
  return `${((r.numerator / r.denominator) * 100).toFixed(1)}% (${r.numerator} / ${r.denominator})`;
}
