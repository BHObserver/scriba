import type { BoundingBox } from "@/lib/ledger/types";
import type { ReviewRow } from "@/lib/review/state";
import type { Finding, RuleId } from "@/lib/validation/engine";

/**
 * How one read line settles in the reveal (and, in B3, how the deck orders it):
 * - `look`: a check failed on this line, or Scriba flagged the reading (unsure number, unclear type);
 * - `ok`: a check covers the line and passed, and nothing failed on it;
 * - `plain`: read, but no passing check covers it (a lone amount, a missing rate), so nothing is claimed.
 */
export type LineState = "ok" | "look" | "plain";

/**
 * A failed sum over several lines is shown on the written figures it compares, not on every
 * summand: the total for a written total; the two ends for the balance and the running balance
 * (opening and closing, previous balance and this line's). Summands are still covered by their
 * own checks (quantity × rate) and are shown in full in the deck.
 */
const BLAMED: Partial<Record<RuleId, "last" | "ends">> = {
  written_total: "last",
  balance_equation: "ends",
  running_balance: "ends",
};

function blames(f: Finding, id: string): boolean {
  const mode = BLAMED[f.ruleId];
  if (!mode || f.entryIds.length <= 1) return true;
  return id === f.entryIds.at(-1) || (mode === "ends" && id === f.entryIds[0]);
}

/** A check failed on this line's written figure (for a sum, the total or the ends it compares). */
export function failsOn(findings: readonly Finding[], id: string): boolean {
  return findings.some((f) => f.status === "fail" && f.entryIds.includes(id) && blames(f, id));
}

export function lineState(findings: readonly Finding[], row: Pick<ReviewRow, "id" | "reviewFields">): LineState {
  const own = findings.filter((f) => f.entryIds.includes(row.id));
  const needsLook = own.some(
    (f) => (f.status === "fail" && blames(f, row.id)) || (f.status === "unverifiable" && f.severity !== "info"),
  );
  if (needsLook || row.reviewFields.length > 0) return "look";
  return own.some((f) => f.status === "pass") ? "ok" : "plain";
}

export type RevealLine = { id: string; box: BoundingBox; state: LineState };

/** Lines to draw on the photo, top to bottom: rejected lines and lines without a box are left out. */
export function revealLines(rows: readonly ReviewRow[], findings: readonly Finding[]): RevealLine[] {
  return rows
    .filter((r) => r.status !== "rejected" && r.candidate?.bbox)
    .map((r) => ({ id: r.id, box: r.candidate!.bbox!, state: lineState(findings, r) }))
    .sort((a, b) => a.box.y_min - b.box.y_min);
}

/** Counts for the summary chips, over every line that takes part (with or without a box). */
export function stateCounts(rows: readonly ReviewRow[], findings: readonly Finding[]): Record<LineState, number> {
  const counts: Record<LineState, number> = { ok: 0, look: 0, plain: 0 };
  for (const r of rows) if (r.status !== "rejected") counts[lineState(findings, r)]++;
  return counts;
}
