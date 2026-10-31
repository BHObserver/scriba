import type { EntryValues, TransactionType } from "@/lib/ledger/types";
import { toBanglaDigits } from "@/lib/numerals";
import { type Acknowledgements, ackFingerprint, assessEntry, decideApproval } from "@/lib/review/approval";
import { type PageState, type ReviewRow, toValidationInput } from "@/lib/review/state";
import { ARITHMETIC_RULES, type Finding, type ValidationEntry, validateLedger } from "@/lib/validation/engine";
import { lineState } from "./line-state";

/**
 * The check deck's rules (DESIGN_SPEC D2 "Deck"), kept pure so they are tested. Acceptance is
 * the existing approval model (`src/lib/review/approval.ts`): accepting a line records the
 * fingerprints of the problems shown on it, so an edit anywhere that changes a problem puts
 * the line back in front of the shopkeeper. The server re-checks all of it at confirmation.
 */
export type Review = { page: PageState; rows: ReviewRow[] };
export type Acceptance = { kind: "ok" | "asWritten"; acks: Acknowledgements };
export type Acceptances = Record<string, Acceptance>;
/** `look` needs a decision; `open` only needs a yes; `done` is accepted (or already in the khata). */
export type CardStatus = "look" | "open" | "done" | "removed";

export function checkReview(review: Review): { findings: Finding[]; entries: Map<string, ValidationEntry> } {
  const input = toValidationInput(review);
  return { findings: validateLedger(input), entries: new Map(input.entries.map((e) => [e.id, e])) };
}

function needsDecision(row: ReviewRow, entry: ValidationEntry, findings: readonly Finding[]): boolean {
  return lineState(findings, row) === "look" || assessEntry(entry, [...findings]).blockers.length > 0;
}

/** Cards to show: the page's unconfirmed lines, problems first, then page order. Computed once per visit so cards never jump. */
export function deckOrder(review: Review): string[] {
  const { findings, entries } = checkReview(review);
  const drafts = review.rows.filter((r) => r.status === "draft");
  const look = drafts.filter((r) => needsDecision(r, entries.get(r.id)!, findings));
  return [...look, ...drafts.filter((r) => !look.includes(r))].map((r) => r.id);
}

/** Accept a line as it stands: every problem now shown on it, and any check that couldn't run. */
export function acceptanceFor(entry: ValidationEntry, findings: readonly Finding[], kind: Acceptance["kind"]): Acceptance {
  const { needsAck, uncheckable } = assessEntry(entry, [...findings]);
  return { kind, acks: { findings: needsAck.map(ackFingerprint), uncheckable: uncheckable.length > 0 } };
}

export function isAccepted(entry: ValidationEntry | undefined, findings: readonly Finding[], acceptance: Acceptance | undefined): boolean {
  return entry != null && acceptance != null && decideApproval(entry, [...findings], acceptance.acks).ok;
}

/** True when the line can be accepted without editing (no missing amount, unknown type, crossed-out mark). */
export function canAccept(entry: ValidationEntry, findings: readonly Finding[]): boolean {
  return assessEntry(entry, [...findings]).blockers.length === 0;
}

export function cardStatus(row: ReviewRow, entry: ValidationEntry | undefined, findings: readonly Finding[], acceptance: Acceptance | undefined): CardStatus {
  if (row.status === "rejected") return "removed";
  if (row.status === "confirmed" || isAccepted(entry, findings, acceptance)) return "done";
  return entry && needsDecision(row, entry, findings) ? "look" : "open";
}

/** The next card still waiting after `from`, wrapping round; -1 when every card is done. */
export function nextWaiting(statuses: readonly CardStatus[], from: number): number {
  for (let step = 1; step <= statuses.length; step++) {
    const i = (from + step) % statuses.length;
    if (statuses[i] === "look" || statuses[i] === "open") return i;
  }
  return -1;
}

/** Unconfirmed lines not yet accepted (rejected lines don't count). */
export function linesLeft(review: Review, acceptances: Acceptances): number {
  const { findings, entries } = checkReview(review);
  return review.rows.filter((r) => r.status === "draft" && !isAccepted(entries.get(r.id), findings, acceptances[r.id])).length;
}

/** The confirm request body: every accepted draft line with the version it was accepted at. */
export function confirmEntries(review: Review, acceptances: Acceptances): Array<{ id: string; expectedVersion: number; acknowledgements: Acknowledgements }> {
  const { findings, entries } = checkReview(review);
  return review.rows
    .filter((r) => r.status === "draft" && isAccepted(entries.get(r.id), findings, acceptances[r.id]))
    .map((r) => ({ id: r.id, expectedVersion: r.version, acknowledgements: acceptances[r.id]!.acks }));
}

export type PageOutcome = {
  /** Every line is in the khata or removed, nothing fails, and at least one check passed: the seal lands. */
  sealed: boolean;
  confirmed: number;
  fails: Finding[];
  /** At least one arithmetic check ran and passed. A page with nothing to check is never sealed. */
  checked: boolean;
};

export function pageOutcome(review: Review, findings: readonly Finding[]): PageOutcome {
  const arithmetic = findings.filter((f) => ARITHMETIC_RULES.has(f.ruleId));
  const fails = arithmetic.filter((f) => f.status === "fail");
  const checked = arithmetic.some((f) => f.status === "pass");
  const confirmed = review.rows.filter((r) => r.status === "confirmed").length;
  const settled = confirmed > 0 && review.rows.every((r) => r.status !== "draft");
  return { sealed: settled && fails.length === 0 && checked, confirmed, fails, checked };
}

const NUMBER_TEXTS = ["amountText", "quantityText", "rateText", "balanceText"] as const;

/** The first number the shopkeeper changed from Scriba's reading, for "you changed 400 to 800". */
export function editOf(row: ReviewRow): { from: string; to: string } | null {
  const before = row.candidate?.values;
  if (!before) return null;
  for (const key of NUMBER_TEXTS) {
    if (before[key] !== row.values[key] && row.values[key] != null) return { from: before[key] ?? "—", to: row.values[key]! };
  }
  return null;
}

/**
 * A number typed on the keypad (ASCII digits) written the way the khata writes it: Bangla digits
 * unless the reading used Latin ones. A point left at the end ("১.") is dropped.
 */
export function typedText(typed: string, previous: string | null): string {
  const latin = previous != null && /[0-9]/.test(previous) && !/[০-৯]/.test(previous);
  const clean = typed.replace(/\.$/, "");
  return latin ? clean : toBanglaDigits(clean);
}

/** What the add-a-line sheet asks for, by kind: a name for lines with someone on the other side, an item, qty × rate for goods. */
export function addFields(type: TransactionType): { name: boolean; item: boolean; qtyRate: boolean } {
  const goods = type === "cash_sale" || type === "credit_sale" || type === "purchase" || type === "credit_purchase";
  return {
    name: goods || type === "repayment" || type === "supplier_payment",
    item: goods || type === "expense",
    qtyRate: goods,
  };
}

export type AddedParts = { type: TransactionType; name: string; item: string; qty: string; rate: string; amount: string };

/**
 * The values of a line the shopkeeper adds himself: only the fields his kind of line asks for,
 * numbers written like the page's own (`sample`, any number the page has), and the writing put
 * together from what he typed, since there is no reading of it.
 */
export function addedLineValues(parts: AddedParts, sample: string | null): EntryValues {
  const want = addFields(parts.type);
  const text = (s: string, on: boolean) => (on && s.trim() ? s.trim() : null);
  const num = (s: string, on = true) => (on && s.replace(/\.$/, "") ? typedText(s, sample) : null);
  const customer = text(parts.name, want.name);
  const item = text(parts.item, want.item);
  const quantityText = num(parts.qty, want.qtyRate);
  const rateText = num(parts.rate, want.qtyRate);
  const amountText = num(parts.amount);
  const sourceText = [customer, item, quantityText && rateText ? `${quantityText} × ${rateText} =` : quantityText ?? rateText, amountText].filter(Boolean).join(" ");
  return { sourceText, type: parts.type, customer, item, quantityText, unit: null, rateText, amountText, balanceText: null, crossedOut: false };
}

/** Acceptances kept for this tab, so leaving the page (or a reload) doesn't throw away what he looked at. */
export type StoredAcceptances = Record<string, { version: number; acceptance: Acceptance }>;

export function storedAcceptances(review: Review, acceptances: Acceptances): StoredAcceptances {
  const out: StoredAcceptances = {};
  for (const row of review.rows) {
    const acceptance = acceptances[row.id];
    if (row.status === "draft" && acceptance) out[row.id] = { version: row.version, acceptance };
  }
  return out;
}

/** Only acceptances of draft lines still at the version he saw come back. The checks then decide again whether each still holds. */
export function restoreAcceptances(review: Review, stored: unknown): Acceptances {
  if (stored == null || typeof stored !== "object") return {};
  const out: Acceptances = {};
  for (const row of review.rows) {
    const item = (stored as Record<string, unknown>)[row.id] as { version?: unknown; acceptance?: Acceptance } | undefined;
    const a = item?.acceptance;
    if (row.status !== "draft" || item?.version !== row.version || !a || (a.kind !== "ok" && a.kind !== "asWritten")) continue;
    if (!Array.isArray(a.acks?.findings) || typeof a.acks.uncheckable !== "boolean") continue;
    out[row.id] = { kind: a.kind, acks: { findings: a.acks.findings.filter((f): f is string => typeof f === "string"), uncheckable: a.acks.uncheckable } };
  }
  return out;
}
