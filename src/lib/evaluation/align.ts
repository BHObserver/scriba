/**
 * U3: line alignment by content, for scoring readings against ground truth when a line is
 * split or merged differently (V02's "চিনি ১৬০ + চাল ১৪০ — ২৭০" is one written line; the
 * draft truth has three). The strict order alignment of evaluateSample then misaligns every
 * line after it; this one costs only the lines involved. Pure, like metrics.ts.
 *
 * Lines are paired in order (no crossing), choosing the pairs with the most in common. A line
 * that shares nothing with any line on the other side stays unpaired: missing or extra.
 */
import type { EntryValues } from "@/lib/ledger/types";
import type { GroundTruthEntry } from "./ground-truth";
import { type LinePair, type ScoredField, expectedValue, observedValue } from "./metrics";

// What a shared value says about two lines being the same line. Amounts and names say most.
const WEIGHT: Partial<Record<ScoredField, number>> = { amount: 3, balance: 3, item: 3, customer: 3, qty: 1, rate: 1, unit: 0.5, type: 1 };

/** How much a ground-truth line and a read line have in common; 0 means nothing. */
export function lineSimilarity(g: GroundTruthEntry, v: EntryValues): number {
  let score = 0;
  for (const [field, weight] of Object.entries(WEIGHT) as Array<[ScoredField, number]>) {
    const expected = expectedValue(g, field);
    const observed = observedValue(v, field);
    if (expected == null || observed == null) continue;
    if (expected === observed) score += weight;
    // "চিনি + চাল" read for the written line that holds চিনি: half the weight.
    else if (
      (field === "item" || field === "customer") &&
      typeof expected === "string" &&
      typeof observed === "string" &&
      (observed.includes(expected) || expected.includes(observed))
    ) {
      score += weight / 2;
    }
  }
  return score;
}

export function alignByContent(gt: GroundTruthEntry[], read: Array<{ line: number; values: EntryValues }>): LinePair[] {
  const g = [...gt].sort((a, b) => a.line - b.line);
  const x = [...read].sort((a, b) => a.line - b.line);
  const sim = g.map((ge) => x.map((xe) => lineSimilarity(ge, xe.values)));
  // best[i][j]: the most in common pairing the first i truth lines with the first j read lines.
  const best = Array.from({ length: g.length + 1 }, () => new Array<number>(x.length + 1).fill(0));
  for (let i = 1; i <= g.length; i++) {
    for (let j = 1; j <= x.length; j++) {
      const s = sim[i - 1]![j - 1]!;
      best[i]![j] = Math.max(best[i - 1]![j]!, best[i]![j - 1]!, s > 0 ? best[i - 1]![j - 1]! + s : 0);
    }
  }
  const pairs: LinePair[] = [];
  let i = g.length;
  let j = x.length;
  while (i > 0 || j > 0) {
    const s = i > 0 && j > 0 ? sim[i - 1]![j - 1]! : 0;
    if (s > 0 && best[i]![j] === best[i - 1]![j - 1]! + s) {
      pairs.push({ gtLine: g[--i]!.line, line: x[--j]!.line });
    } else if (j > 0 && (i === 0 || best[i]![j] === best[i]![j - 1])) {
      pairs.push({ gtLine: null, line: x[--j]!.line });
    } else {
      pairs.push({ gtLine: g[--i]!.line, line: null });
    }
  }
  // Built backwards, so within a gap the missing truth lines come before the extra read ones.
  return pairs.reverse();
}
