/**
 * Ask Scriba: run a question's shape on the shop's book. Every figure here is computed by the
 * insights engine from confirmed records and carries the ids of the records it came from, so
 * the answer card can show the handwriting behind it. When the shape can't be answered from
 * the khata (no such person, no such item, no real period), the answer says so; it never
 * guesses.
 */
import { type Risk, duesList, partyAccount } from "@/lib/insights/accounts";
import { type Book, figureOf } from "@/lib/insights/book";
import { daySummary } from "@/lib/insights/day";
import type { Figure, InsightRecord, RecordType } from "@/lib/insights/types";
import type { PartyKind } from "@/lib/ledger/parties";
import { type Period, comparisonPeriod, resolvePeriod } from "./period";
import { type AskQuery, type Measure, type OutKind, type SalesKind, itemKey, partiesNamed } from "./query";

/** One row of a breakdown, labelled by its record type ("type.cash_sale" in the dictionary). */
export type AnswerPart = { type: RecordType; figure: Figure };

export type RiskyParty = { partyId: string; name: string; balancePoisha: number; risk: Risk };

export type Answer =
  | { kind: "due"; partyId: string; partyKind: PartyKind; name: string; balance: Figure; risk: Risk | null }
  | { kind: "dues_total"; partyKind: PartyKind; total: Figure; people: number }
  | { kind: "risky"; partyKind: PartyKind; total: Figure; parties: RiskyParty[] }
  | { kind: "sales"; period: Period; salesKind: SalesKind; item: string | null; total: Figure; lines: number; parts: AnswerPart[] }
  | { kind: "out"; period: Period; outKind: OutKind; item: string | null; total: Figure; lines: number; parts: AnswerPart[] }
  | { kind: "compare"; measure: Measure; a: { period: Period; figure: Figure }; b: { period: Period; figure: Figure } }
  | { kind: "drawer"; period: Period; expected: Figure }
  | { kind: "pick"; partyKind: PartyKind; options: Array<{ partyId: string; name: string }> }
  | { kind: "not_found"; what: "party" | "item"; said: string }
  | { kind: "unknown" };

const SALES_PARTS: Record<SalesKind, RecordType[]> = {
  all: ["cash_sale", "credit_sale"],
  cash: ["cash_sale"],
  credit: ["credit_sale"],
};

/** "all" is cash out, as on Today; stock bought counts what was bought on credit as well. */
const OUT_PARTS: Record<OutKind, RecordType[]> = {
  all: ["purchase", "supplier_payment", "expense"],
  purchase: ["purchase", "credit_purchase"],
  supplier_payment: ["supplier_payment"],
  expense: ["expense"],
};

/** Lines that can name an item (a payment to a supplier has none). */
const ITEM_OUT_PARTS: RecordType[] = ["purchase", "credit_purchase", "expense"];

function between(book: Book, period: Period, types: readonly RecordType[], item: string | null): InsightRecord[] {
  const key = item ? itemKey(item) : null;
  return book.records.filter(
    (r) =>
      r.businessDate >= period.from &&
      r.businessDate <= period.to &&
      types.includes(r.type) &&
      (key === null || (r.itemName !== null && itemKey(r.itemName) === key)),
  );
}

function breakdown(records: readonly InsightRecord[], types: readonly RecordType[]): { total: Figure; lines: number; parts: AnswerPart[] } {
  return {
    total: figureOf(records),
    lines: records.length,
    parts: types.map((type) => ({ type, figure: figureOf(records.filter((r) => r.type === type)) })),
  };
}

/** The item a question means: the one it picked from the shop's list, else the words it said. */
function itemOf(book: Book, q: AskQuery): { item: string | null } | { notFound: string } {
  if (q.item) return { item: q.item };
  if (!q.item_said) return { item: null };
  const key = itemKey(q.item_said);
  const hit = book.records.find((r) => r.itemName !== null && itemKey(r.itemName) === key);
  return hit ? { item: hit.itemName!.trim() } : { notFound: q.item_said };
}

function measureOf(book: Book, measure: Measure, period: Period): Figure {
  return figureOf(between(book, period, measure === "sales" ? SALES_PARTS.all : OUT_PARTS.all, null));
}

export function answerQuery(book: Book, q: AskQuery, asOf: string): Answer {
  switch (q.intent) {
    case "party_due": {
      const said = q.party ?? q.name_said;
      if (!said) return { kind: "unknown" };
      const found = partiesNamed(book, said, q.party_kind);
      if (found.length === 0) return { kind: "not_found", what: "party", said };
      if (found.length > 1) {
        return { kind: "pick", partyKind: q.party_kind, options: found.map((p) => ({ partyId: p.id, name: p.displayName })) };
      }
      const account = partyAccount(book, found[0]!.id, asOf)!;
      return {
        kind: "due",
        partyId: account.partyId,
        partyKind: account.kind,
        name: account.name,
        balance: { poisha: account.balancePoisha, recordIds: account.entries.map((e) => e.recordId) },
        risk: account.risks[0] ?? null,
      };
    }
    case "total_dues": {
      const dues = duesList(book, q.party_kind, asOf);
      return { kind: "dues_total", partyKind: q.party_kind, total: dues.total, people: dues.parties.length };
    }
    case "risky_dues": {
      const flagged = duesList(book, q.party_kind, asOf).parties.filter((a) => a.risks.length > 0);
      return {
        kind: "risky",
        partyKind: q.party_kind,
        total: { poisha: flagged.reduce((s, a) => s + a.balancePoisha, 0), recordIds: flagged.flatMap((a) => a.entries.map((e) => e.recordId)) },
        parties: flagged.map((a) => ({ partyId: a.partyId, name: a.name, balancePoisha: a.balancePoisha, risk: a.risks[0]! })),
      };
    }
    case "sales":
    case "money_out": {
      const period = resolvePeriod(q, asOf, book.firstDate);
      if (!period) return { kind: "unknown" };
      const item = itemOf(book, q);
      if ("notFound" in item) return { kind: "not_found", what: "item", said: item.notFound };
      if (q.intent === "sales") {
        const types = SALES_PARTS[q.sales_kind];
        return { kind: "sales", period, salesKind: q.sales_kind, item: item.item, ...breakdown(between(book, period, types, item.item), types) };
      }
      // One item is stock or a cost, however it was paid for: "all" of it includes what was bought on credit.
      const types = !item.item ? OUT_PARTS[q.out_kind] : q.out_kind === "all" ? ITEM_OUT_PARTS : OUT_PARTS[q.out_kind].filter((t) => ITEM_OUT_PARTS.includes(t));
      if (types.length === 0) return { kind: "unknown" };
      return { kind: "out", period, outKind: q.out_kind, item: item.item, ...breakdown(between(book, period, types, item.item), types) };
    }
    case "compare": {
      const a = resolvePeriod(q, asOf, book.firstDate);
      if (!a) return { kind: "unknown" };
      const b = comparisonPeriod(a, q.compare_to, asOf);
      if (b.from === a.from && b.to === a.to) return { kind: "unknown" };
      return { kind: "compare", measure: q.measure, a: { period: a, figure: measureOf(book, q.measure, a) }, b: { period: b, figure: measureOf(book, q.measure, b) } };
    }
    case "drawer_cash": {
      const period = resolvePeriod(q, asOf, book.firstDate);
      if (!period || period.from !== period.to) return { kind: "unknown" };
      const day = daySummary(book, period.to);
      return { kind: "drawer", period, expected: { poisha: day.expectedCash.poisha, recordIds: day.expectedCash.recordIds } };
    }
    case "unknown":
      return { kind: "unknown" };
  }
}

/** The records an answer was computed from, newest first (the order the card shows them in). */
export function answerRecordIds(answer: Answer, book: Book): string[] {
  const ids = (() => {
    switch (answer.kind) {
      case "due":
        return answer.balance.recordIds;
      case "dues_total":
      case "risky":
      case "sales":
      case "out":
        return answer.total.recordIds;
      case "compare":
        return [...answer.b.figure.recordIds, ...answer.a.figure.recordIds];
      case "drawer":
        return answer.expected.recordIds;
      default:
        return [];
    }
  })();
  const order = new Map(book.records.map((r, i) => [r.id, i]));
  return [...new Set(ids)].sort((x, y) => (order.get(y) ?? -1) - (order.get(x) ?? -1));
}
