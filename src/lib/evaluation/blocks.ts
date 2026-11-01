/**
 * U3: how a reading groups the lines into blocks, against ground truth. Pure, like metrics.ts.
 *
 * Grouping agreement looks at every pair of ground-truth lines: they are in the same block or
 * not, and the reading agrees or not. The caller aligns the lines (by order, or alignByContent)
 * and gives each read line under the number of the truth line it was paired with. A pair is
 * scored only when the reading has both lines.
 */
import type { Ratio } from "./metrics";

/** Ground-truth blocks: each a list of line numbers (the informal `_blocks` of a ground-truth file). */
export type TruthBlocks = Array<{ kind: string; lines: number[] }>;

export function groupingAgreement(truth: TruthBlocks, reading: Array<{ line: number; block: string | null }>): Ratio {
  const truthBlockOf = new Map(truth.flatMap((b, i) => b.lines.map((l) => [l, i] as const)));
  const readBlockOf = new Map(reading.map((e) => [e.line, e.block]));
  const lines = [...truthBlockOf.keys()].filter((l) => readBlockOf.has(l)).sort((a, b) => a - b);
  let agree = 0;
  let pairs = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i]!, lines[j]!];
      const sameTruth = truthBlockOf.get(a) === truthBlockOf.get(b);
      const blockA = readBlockOf.get(a);
      const sameReading = blockA != null && blockA === readBlockOf.get(b);
      pairs++;
      if (sameTruth === sameReading) agree++;
    }
  }
  return { numerator: agree, denominator: pairs };
}

/** The block kinds of the truth found in the reading, as many times as each occurs. */
export function kindsFound(truth: TruthBlocks, readingKinds: string[]): Ratio {
  const left = [...readingKinds];
  let found = 0;
  for (const b of truth) {
    const i = left.indexOf(b.kind);
    if (i >= 0) {
      found++;
      left.splice(i, 1);
    }
  }
  return { numerator: found, denominator: truth.length };
}
