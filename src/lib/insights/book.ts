/**
 * The shop's book: confirmed records made ready for every insight.
 *  - One reading per page: if lines of two runs of the same page were confirmed (a page read
 *    again with "fresh"), only the run confirmed last counts, so no page is counted twice.
 *  - Merged parties are followed to the party they were merged into.
 *  - Records are in khata order: business date, then page capture time, then line order.
 */
import type { BookInput, Figure, InsightDayClose, InsightParty, InsightRecord } from "./types";

export type Book = {
  records: InsightRecord[];
  parties: ReadonlyMap<string, InsightParty>;
  closes: ReadonlyMap<string, InsightDayClose>;
  usualOpeningCashPoisha: number;
  /** Business date of the earliest record, or null for an empty book. */
  firstDate: string | null;
  /** Records left out because a later reading of the same page was confirmed. */
  supersededRecordIds: string[];
};

export function compareRecords(a: InsightRecord, b: InsightRecord): number {
  return (
    cmp(a.businessDate, b.businessDate) ||
    cmp(a.capturedAt, b.capturedAt) ||
    cmp(a.documentId, b.documentId) ||
    a.lineOrder - b.lineOrder ||
    cmp(a.id, b.id)
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The party a party was merged into, following chains; a cycle stops where it repeats. */
export function rootPartyId(parties: ReadonlyMap<string, InsightParty>, id: string): string {
  const seen = new Set<string>();
  let current = id;
  for (;;) {
    seen.add(current);
    const next = parties.get(current)?.mergedInto;
    if (!next || seen.has(next) || !parties.has(next)) return current;
    current = next;
  }
}

/** Per page, the run whose lines were confirmed last (ties: the larger run id). */
function latestRunPerPage(records: readonly InsightRecord[]): Map<string, string> {
  const best = new Map<string, { runId: string; at: string }>();
  for (const r of records) {
    const seen = best.get(r.documentId);
    if (!seen || r.confirmedAt > seen.at || (r.confirmedAt === seen.at && r.runId > seen.runId)) {
      best.set(r.documentId, { runId: r.runId, at: r.confirmedAt });
    }
  }
  return new Map([...best].map(([documentId, v]) => [documentId, v.runId]));
}

export function prepareBook(input: BookInput): Book {
  const parties = new Map(input.parties.map((p) => [p.id, p]));
  const runOf = latestRunPerPage(input.records);
  const records: InsightRecord[] = [];
  const supersededRecordIds: string[] = [];
  for (const r of input.records) {
    if (runOf.get(r.documentId) !== r.runId) {
      supersededRecordIds.push(r.id);
      continue;
    }
    records.push(r.partyId ? { ...r, partyId: rootPartyId(parties, r.partyId) } : r);
  }
  records.sort(compareRecords);
  return {
    records,
    parties,
    closes: new Map(input.closes.map((c) => [c.businessDate, c])),
    usualOpeningCashPoisha: input.usualOpeningCashPoisha,
    firstDate: records[0]?.businessDate ?? null,
    supersededRecordIds,
  };
}

export function figureOf(records: readonly InsightRecord[]): Figure {
  return {
    poisha: records.reduce((sum, r) => sum + r.amountPoisha, 0),
    recordIds: records.map((r) => r.id),
  };
}

export function addFigures(...figures: Figure[]): Figure {
  return {
    poisha: figures.reduce((sum, f) => sum + f.poisha, 0),
    recordIds: figures.flatMap((f) => f.recordIds),
  };
}
