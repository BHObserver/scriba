/**
 * Party accounts: what each customer owes the shop (credit sales − repayments) and what the shop
 * owes each supplier (credit purchases − supplier payments), with a running balance, the last
 * payment, the oldest unpaid credit by FIFO (payments clear the oldest credit first) and risk
 * flags, each with the reason and the records behind it.
 *
 * Opening balances: a party's first one is its starting point (money owed from before Scriba).
 * A later one is the page's statement of the due (T3): account pages repeat the previous page's
 * closing balance as their opening line, so one equal to the running balance changes nothing. One
 * that differs is never dropped: it becomes an adjustment by the difference, so the balance is
 * what the page says, and the timeline shows why.
 */
import type { PartyKind } from "@/lib/ledger/parties";
import { type Book, compareRecords, rootPartyId } from "./book";
import { addDays, daysBetween } from "./calendar";
import type { Figure, InsightParty, InsightRecord, RecordType } from "./types";

const CREDIT: Record<PartyKind, RecordType> = { customer: "credit_sale", supplier: "credit_purchase" };
const PAYMENT: Record<PartyKind, RecordType> = { customer: "repayment", supplier: "supplier_payment" };

export const RISK_RULES = {
  /** No payment for this many days while money is owed. */
  quietDays: { customer: 30, supplier: 21 } as Record<PartyKind, number>,
  /** Balance higher at the end of each of this many weeks running. */
  growingWeeks: 3,
  /** A credit in the last `recentDays` at least this many times the party's usual credit… */
  bigCreditFactor: 3,
  /** …and at least ৳1,000. */
  bigCreditMinPoisha: 100_000,
  recentDays: 7,
  /** "Usual" is the median of the party's older credits, and needs at least this many. */
  usualMinCredits: 3,
};

export type AccountEntry = {
  recordId: string;
  documentId: string;
  date: string;
  /**
   * start: owed from before Scriba (an opening balance); up: credit; down: payment; adjust: a
   * later page's "before" that differs from the book (T3), which sets the balance to it.
   */
  direction: "start" | "up" | "down" | "adjust";
  /** Positive, except an adjustment's: the signed difference (negative when the due went down). */
  amountPoisha: number;
  /** Balance after this entry. */
  balancePoisha: number;
};

export type Risk =
  | { code: "no_payment"; rank: 3; days: number; recordIds: string[] }
  | { code: "growing"; rank: 2; weeks: number; recordIds: string[] }
  | { code: "big_credit"; rank: 1; amountPoisha: number; usualPoisha: number; recordIds: string[] };

export type PartyAccount = {
  partyId: string;
  kind: PartyKind;
  name: string;
  /** Positive: they owe the shop (customer) or the shop owes them (supplier). */
  balancePoisha: number;
  /** Oldest first, each with the balance after it. */
  entries: AccountEntry[];
  lastPayment: { recordId: string; date: string; amountPoisha: number; daysAgo: number } | null;
  oldestUnpaid: { recordId: string; date: string; leftPoisha: number; daysAgo: number } | null;
  /** Credits not yet cleared by payments, oldest first: the lines a reminder shows. */
  unpaidRecordIds: string[];
  /** Balance at the end of 21, 14 and 7 days ago, and now. */
  weeklyBalances: number[];
  /** Highest rank first; empty when nothing is owed. */
  risks: Risk[];
};

function entriesOf(records: readonly InsightRecord[], kind: PartyKind): AccountEntry[] {
  const entries: AccountEntry[] = [];
  let balance = 0;
  for (const r of records) {
    let direction: AccountEntry["direction"];
    if (r.type === CREDIT[kind]) direction = "up";
    else if (r.type === PAYMENT[kind]) direction = "down";
    else if (r.type === "opening_balance" && entries.length === 0) direction = "start";
    else if (r.type === "opening_balance" && r.amountPoisha !== balance) direction = "adjust";
    else continue;
    const amountPoisha = direction === "adjust" ? r.amountPoisha - balance : r.amountPoisha;
    balance += direction === "down" ? -amountPoisha : amountPoisha;
    entries.push({
      recordId: r.id,
      documentId: r.documentId,
      date: r.businessDate,
      direction,
      amountPoisha,
      balancePoisha: balance,
    });
  }
  return entries;
}

function balanceAt(entries: readonly AccountEntry[], date: string): number {
  let balance = 0;
  for (const e of entries) {
    if (e.date > date) break;
    balance = e.balancePoisha;
  }
  return balance;
}

/** Median of whole amounts; for an even count, the upper middle (a credit that happened). */
function usualAmount(amounts: number[]): number {
  const sorted = [...amounts].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function risksOf(account: Omit<PartyAccount, "risks">, asOf: string): Risk[] {
  if (account.balancePoisha <= 0) return [];
  const risks: Risk[] = [];
  const { entries, lastPayment, oldestUnpaid, kind } = account;

  // Money owed for a long time and nothing paid for as long. A party who paid everything off
  // long ago and took new credit recently is not flagged.
  const quiet = RISK_RULES.quietDays[kind];
  if (oldestUnpaid && oldestUnpaid.daysAgo >= quiet && (!lastPayment || lastPayment.daysAgo >= quiet)) {
    risks.push({
      code: "no_payment",
      rank: 3,
      days: lastPayment ? lastPayment.daysAgo : oldestUnpaid.daysAgo,
      recordIds: [...(lastPayment ? [lastPayment.recordId] : []), oldestUnpaid.recordId],
    });
  }

  const b = account.weeklyBalances;
  if (b.every((value, i) => i === 0 || value > b[i - 1]!)) {
    const from = addDays(asOf, -7 * RISK_RULES.growingWeeks);
    risks.push({
      code: "growing",
      rank: 2,
      weeks: RISK_RULES.growingWeeks,
      recordIds: entries.filter((e) => e.date > from).map((e) => e.recordId),
    });
  }

  // Credits he gave: an adjustment isn't one, so it is neither usual nor big.
  const credits = entries.filter((e) => e.direction === "up");
  const isRecent = (e: AccountEntry) => daysBetween(e.date, asOf) < RISK_RULES.recentDays;
  const older = credits.filter((e) => !isRecent(e)).map((e) => e.amountPoisha);
  if (older.length >= RISK_RULES.usualMinCredits) {
    const usual = usualAmount(older);
    const big = credits
      .filter(isRecent)
      .filter((e) => e.amountPoisha >= RISK_RULES.bigCreditFactor * usual && e.amountPoisha >= RISK_RULES.bigCreditMinPoisha)
      .at(-1);
    if (big) {
      risks.push({ code: "big_credit", rank: 1, amountPoisha: big.amountPoisha, usualPoisha: usual, recordIds: [big.recordId] });
    }
  }
  return risks;
}

function buildAccount(party: InsightParty, records: readonly InsightRecord[], asOf: string): PartyAccount {
  const entries = entriesOf(records, party.kind);
  const balancePoisha = entries.at(-1)?.balancePoisha ?? 0;
  const payments = entries.filter((e) => e.direction === "down");
  const last = payments.at(-1);
  const lastPayment = last
    ? { recordId: last.recordId, date: last.date, amountPoisha: last.amountPoisha, daysAgo: daysBetween(last.date, asOf) }
    : null;

  // FIFO: all payments together clear the oldest credits first. An adjustment down clears them
  // the same way, but isn't a payment (it doesn't reset "no payment"); one up is owed like a credit.
  const clears = (e: AccountEntry) => e.direction === "down" || (e.direction === "adjust" && e.amountPoisha < 0);
  const credits = entries.filter((e) => !clears(e));
  let paid = entries.filter(clears).reduce((sum, e) => sum + Math.abs(e.amountPoisha), 0);
  let oldestUnpaid: PartyAccount["oldestUnpaid"] = null;
  let unpaidRecordIds: string[] = [];
  for (const [i, c] of credits.entries()) {
    if (paid >= c.amountPoisha) {
      paid -= c.amountPoisha;
      continue;
    }
    oldestUnpaid = { recordId: c.recordId, date: c.date, leftPoisha: c.amountPoisha - paid, daysAgo: daysBetween(c.date, asOf) };
    unpaidRecordIds = credits.slice(i).map((e) => e.recordId);
    break;
  }

  const weeklyBalances: number[] = [];
  for (let week = RISK_RULES.growingWeeks; week >= 0; week--) weeklyBalances.push(balanceAt(entries, addDays(asOf, -7 * week)));

  const account = {
    partyId: party.id,
    kind: party.kind,
    name: party.displayName,
    balancePoisha,
    entries,
    lastPayment,
    oldestUnpaid,
    unpaidRecordIds,
    weeklyBalances,
  };
  return { ...account, risks: risksOf(account, asOf).sort((a, b) => b.rank - a.rank) };
}

/** One party's account as of a date. A merged party opens the party it was merged into. */
export function partyAccount(book: Book, partyId: string, asOf: string): PartyAccount | null {
  const root = rootPartyId(book.parties, partyId);
  const party = book.parties.get(root);
  if (!party) return null;
  return buildAccount(party, book.records.filter((r) => r.partyId === root && r.businessDate <= asOf), asOf);
}

/** Where a page sits in the khata: its business day, then when it was photographed. */
export type PagePlace = { documentId: string; date: string; capturedAt: string };

/**
 * A party's due just before a page (T3), from the records ahead of it in khata order; the page's
 * own are left out (a page checked again). A merged party is followed to the party it was merged
 * into. Null when the book has nothing of the party before the page.
 */
export function dueBefore(book: Book, partyId: string, page: PagePlace): number | null {
  const root = rootPartyId(book.parties, partyId);
  const party = book.parties.get(root);
  if (!party) return null;
  const here = { businessDate: page.date, capturedAt: page.capturedAt, documentId: page.documentId, lineOrder: -1, id: "" };
  const ahead = book.records.filter(
    (r) => r.partyId === root && r.documentId !== page.documentId && compareRecords(r, { ...r, ...here }) < 0,
  );
  return entriesOf(ahead, party.kind).at(-1)?.balancePoisha ?? null;
}

/** Every party with records up to `asOf`, optionally of one kind. */
export function partyAccounts(book: Book, asOf: string, kind?: PartyKind): PartyAccount[] {
  const byParty = new Map<string, InsightRecord[]>();
  for (const r of book.records) {
    if (!r.partyId || r.businessDate > asOf) continue;
    const list = byParty.get(r.partyId);
    if (list) list.push(r);
    else byParty.set(r.partyId, [r]);
  }
  const accounts: PartyAccount[] = [];
  for (const [id, records] of byParty) {
    const party = book.parties.get(id);
    if (party && (!kind || party.kind === kind)) accounts.push(buildAccount(party, records, asOf));
  }
  return accounts;
}

const topRisk = (a: PartyAccount) => a.risks[0];

/** Dues order: risk rank, then days without payment, then balance (largest first). */
export function compareDues(a: PartyAccount, b: PartyAccount): number {
  const ra = topRisk(a);
  const rb = topRisk(b);
  const days = (r: Risk | undefined) => (r?.code === "no_payment" ? r.days : 0);
  return (
    (rb?.rank ?? 0) - (ra?.rank ?? 0) ||
    days(rb) - days(ra) ||
    b.balancePoisha - a.balancePoisha ||
    a.name.localeCompare(b.name, "bn") ||
    (a.partyId < b.partyId ? -1 : a.partyId > b.partyId ? 1 : 0)
  );
}

export type DuesList = {
  kind: PartyKind;
  /** Parties with money owed, riskiest first. */
  parties: PartyAccount[];
  /** Sum of their balances, backed by their credits and payments. */
  total: Figure;
  /** Parties with at least one risk. */
  flagged: number;
};

/** Receivables (kind "customer") or payables (kind "supplier") as of a date. */
export function duesList(book: Book, kind: PartyKind, asOf: string): DuesList {
  const parties = partyAccounts(book, asOf, kind)
    .filter((a) => a.balancePoisha > 0)
    .sort(compareDues);
  return {
    kind,
    parties,
    total: {
      poisha: parties.reduce((sum, a) => sum + a.balancePoisha, 0),
      recordIds: parties.flatMap((a) => a.entries.map((e) => e.recordId)),
    },
    flagged: parties.filter((a) => a.risks.length > 0).length,
  };
}
