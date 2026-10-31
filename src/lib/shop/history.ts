/**
 * History (খাতা): one entry per business day, line search, and the rules for merging two
 * spellings of one party. Pure functions over the book; the server only loads rows.
 */
import { type Book, rootPartyId } from "@/lib/insights/book";
import { daySummary } from "@/lib/insights/day";
import type { Figure, InsightParty } from "@/lib/insights/types";
import { normalizePartyName } from "@/lib/ledger/parties";
import type { PageInfo } from "./rows";

export type CloseStatus = { status: "matched" | "short" | "over"; gapPoisha: number; changedSinceClose: boolean };

export type HistoryDay = {
  date: string;
  /** In capture order. */
  pages: PageInfo[];
  /** Confirmed sales; pages still waiting are not in it. */
  sales: Figure;
  /** Pages with lines still to check or not read yet. */
  waitingPages: number;
  close: CloseStatus | null;
};

/** Newest day first. A day appears when it has a page or a confirmed record. */
export function historyDays(book: Book, pages: readonly PageInfo[]): HistoryDay[] {
  const dates = new Set([...pages.map((p) => p.businessDate), ...book.records.map((r) => r.businessDate)]);
  return [...dates]
    .sort()
    .reverse()
    .map((date) => {
      const day = daySummary(book, date);
      const own = pages.filter((p) => p.businessDate === date);
      return {
        date,
        pages: own,
        sales: day.sales,
        waitingPages: own.filter((p) => p.state !== "checked").length,
        close: day.close
          ? {
              status: day.close.gapPoisha === 0 ? "matched" : day.close.gapPoisha < 0 ? "short" : "over",
              gapPoisha: day.close.gapPoisha,
              changedSinceClose: day.close.changedSinceClose,
            }
          : null,
      };
    });
}

/** What search can see of a record beyond the book: the words on the line. */
export type SearchText = { itemName: string | null; customerAlias: string | null; sourceText: string };

export const SEARCH_LIMIT = 50;

/**
 * Lines matching a name or an item, newest first. Names match through the party key, so
 * spelling variants (করিম / করীম, মোঃ রহিম / রহিম) and merged parties find the same lines.
 */
export function searchLines(book: Book, texts: ReadonlyMap<string, SearchText>, query: string, limit = SEARCH_LIMIT): string[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const key = normalizePartyName(q);
  const parties = new Set<string>();
  if (key) {
    for (const p of book.parties.values()) {
      if ((normalizePartyName(p.displayName) ?? "").includes(key)) parties.add(rootPartyId(book.parties, p.id));
    }
  }
  const hits: string[] = [];
  for (let i = book.records.length - 1; i >= 0 && hits.length < limit; i--) {
    const r = book.records[i]!;
    const t = texts.get(r.id);
    const words = [t?.itemName, t?.customerAlias, t?.sourceText].map((w) => (w ?? "").toLowerCase());
    if ((r.partyId && parties.has(r.partyId)) || words.some((w) => w.includes(q))) hits.push(r.id);
  }
  return hits;
}

export type MergeProblem = "same" | "kind" | "source_merged" | "cycle" | "missing";

/**
 * Merging `source` into `target` makes the source's lines count under the target (the engine
 * follows `merged_into`); records are not rewritten, so the merge can be undone.
 */
export function mergeProblem(parties: ReadonlyMap<string, InsightParty>, sourceId: string, targetId: string): MergeProblem | null {
  const source = parties.get(sourceId);
  const target = parties.get(targetId);
  if (!source || !target) return "missing";
  if (sourceId === targetId) return "same";
  if (source.kind !== target.kind) return "kind";
  if (source.mergedInto) return "source_merged";
  if (rootPartyId(parties, targetId) === sourceId) return "cycle";
  return null;
}
