/**
 * Scriba's note on Today: up to three sentences picked in priority order, as data. The words
 * come from the i18n dictionary (text.ts); every number in them is computed here by code.
 *  1. a page of the day still unchecked (its lines are in no figure);
 *  2. the day's sales and how much of it went on credit;
 *  3. the riskiest customer due, with its reason;
 *  4. this week's sales against the week before.
 */
import type { PartyKind } from "@/lib/ledger/parties";
import type { DuesList, Risk } from "./accounts";
import type { DaySummary } from "./day";
import type { WeekComparison } from "./trends";
import type { Figure } from "./types";

export const NOTE_LIMIT = 3;

/** A page photographed for the day, in capture order. */
export type DayPage = {
  documentId: string;
  /** Every line confirmed or rejected. */
  checked: boolean;
  /** Lines still waiting for him. */
  waitingLines: number;
};

export type NoteSentence =
  | { kind: "pending_pages"; pageNumbers: number[]; waitingLines: number; documentIds: string[]; recordIds: string[] }
  | { kind: "sales"; sales: Figure; credit: Figure; recordIds: string[] }
  | { kind: "no_sales"; recordIds: string[] }
  | { kind: "due_risk"; partyId: string; partyKind: PartyKind; name: string; balancePoisha: number; risk: Risk; recordIds: string[] }
  | { kind: "week_trend"; diffPoisha: number; current: Figure; previous: Figure; recordIds: string[] };

export function scribaNote(input: {
  day: DaySummary;
  pages: readonly DayPage[];
  customerDues: DuesList;
  week: WeekComparison;
}): NoteSentence[] {
  const { day, pages, customerDues, week } = input;
  const sentences: NoteSentence[] = [];

  const pending = pages.map((page, i) => ({ page, n: i + 1 })).filter(({ page }) => !page.checked);
  if (pending.length > 0) {
    sentences.push({
      kind: "pending_pages",
      pageNumbers: pending.map((p) => p.n),
      waitingLines: pending.reduce((sum, p) => sum + p.page.waitingLines, 0),
      documentIds: pending.map((p) => p.page.documentId),
      recordIds: [],
    });
  }

  if (day.sales.poisha > 0) {
    sentences.push({ kind: "sales", sales: day.sales, credit: day.creditSales, recordIds: day.sales.recordIds });
  } else if (day.hasRecords) {
    sentences.push({ kind: "no_sales", recordIds: [] });
  }

  const risky = customerDues.parties.find((a) => a.risks.length > 0);
  if (risky) {
    const risk = risky.risks[0]!;
    sentences.push({
      kind: "due_risk",
      partyId: risky.partyId,
      partyKind: risky.kind,
      name: risky.name,
      balancePoisha: risky.balancePoisha,
      risk,
      recordIds: risk.recordIds,
    });
  }

  if (week.previous && week.diffPoisha !== null && (week.total.poisha > 0 || week.previous.poisha > 0)) {
    sentences.push({
      kind: "week_trend",
      diffPoisha: week.diffPoisha,
      current: week.total,
      previous: week.previous,
      recordIds: [...week.total.recordIds, ...week.previous.recordIds],
    });
  }

  return sentences.slice(0, NOTE_LIMIT);
}
