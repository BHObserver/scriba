import type { GridBox } from "@/components/kit/strip-geometry";
import { blockPartyKind, groupByBlock, isUnpricedGoods, pageBlocks } from "@/lib/ledger/blocks";
import type { BlockValues, PageValues } from "@/lib/ledger/types";
import { acceptedFindings } from "@/lib/questions/answer";
import { parseMoney } from "@/lib/numerals";
import type { Answer, Question, QuestionKind, QuestionOption, QuestionSet } from "@/lib/questions/types";
import { ackFingerprint, assessEntry } from "@/lib/review/approval";
import type { ReviewRow } from "@/lib/review/state";
import { type Finding, type ValidationEntry, accountSign, deriveNumbers } from "@/lib/validation/engine";
import { type Acceptances, type Review, acceptanceFor, cardStatus, checkReview, isAccepted, typedText } from "./deck-model";

/**
 * The "Scriba asks" deck (B7, DESIGN_SPEC D5) over a reading with blocks, kept pure so it is
 * tested. The questions come from the engine (`src/lib/questions`); this decides the order they
 * are shown in, which lines an answer accepts, what is left for the quick confirm, and when a
 * block gets its stamp. Acceptance is still the approval model of `deck-model.ts`: the server
 * re-checks every line at confirmation, so nothing here can confirm a line on its own.
 */

/** A reading the ask deck handles: one with blocks (prompt 6). Others keep the line cards. */
export function isBlockReading(page: PageValues): boolean {
  return pageBlocks(page).length > 0;
}

export type AskItem =
  | { kind: "question"; id: string; block: string | null }
  /** Consecutive `price` questions of one block, asked on one card with a slot per item. */
  | { kind: "prices"; ids: string[]; block: string | null }
  /** A line with a problem no question covers: it needs its own look. */
  | { kind: "line"; id: string; block: string | null }
  /** The block's other lines, confirmed together. */
  | { kind: "rest"; ids: string[]; block: string | null }
  /** The block is through the deck: its stamp (or its open due, with prices left for later). */
  | { kind: "stamp"; block: string };

export const itemKey = (item: AskItem): string =>
  item.kind === "question" || item.kind === "line" ? `${item.kind}:${item.id}` : item.kind === "prices" ? `prices:${item.ids[0]}` : `${item.kind}:${item.block}`;

/**
 * The questions the deck goes through. Normally the open ones; after "Answer them now" (`revisit`)
 * the ones put off for later come back too, except those put off again on this pass (`skipped`).
 */
export function deckSet(set: QuestionSet, revisit: boolean, skipped: readonly string[]): QuestionSet {
  if (!revisit) return set;
  return { questions: [...set.later.filter((q) => !skipped.includes(q.id)), ...set.questions], later: set.later.filter((q) => skipped.includes(q.id)) };
}

/** Lines an open or set-aside question is about: the deck leaves them to that question. */
export function coveredLines(set: QuestionSet): Set<string> {
  return new Set([...set.questions, ...set.later].flatMap((q) => [...q.entries, ...(q.entry ? [q.entry] : [])]));
}

const live = (rows: readonly ReviewRow[]) => rows.filter((r) => r.status !== "rejected");

/** The page's blocks with their live lines, in page order (a line naming no block comes last). */
export function blockLines(review: Review): Array<{ block: BlockValues | null; rows: ReviewRow[] }> {
  return groupByBlock(review.page.values, live(review.rows)).map(({ block, entries }) => ({ block, rows: entries }));
}

/**
 * What is still to go through, in order: the page's own questions (the date) first, then block
 * by block: its questions, its problem lines, a quick confirm of the rest, its stamp. Items
 * that are done drop out, so the first item is always the current card. A stamp stays until
 * it has been seen (`seen` holds item keys).
 */
export function deckItems(review: Review, set: QuestionSet, acceptances: Acceptances, seen: ReadonlySet<string>): AskItem[] {
  const { findings, entries } = checkReview(review);
  const covered = coveredLines(set);
  const kept = acceptedFindings(review.page.values);
  const items: AskItem[] = set.questions.filter((q) => q.block == null).map((q) => ({ kind: "question", id: q.id, block: null }));

  for (const { block, rows } of blockLines(review)) {
    const id = block?.id ?? null;
    for (const q of set.questions.filter((x) => x.block != null && x.block === id)) {
      const last = items.at(-1);
      if (q.kind === "price" && last?.kind === "prices" && last.block === id) last.ids.push(q.id);
      else items.push(q.kind === "price" ? { kind: "prices", ids: [q.id], block: id } : { kind: "question", id: q.id, block: id });
    }
    const waiting = rows.filter((r) => r.status === "draft" && !covered.has(r.id) && !isAccepted(entries.get(r.id), findings, acceptances[r.id]));
    const look = waiting.filter((r) => needsOwnCard(r, entries.get(r.id), findings, kept));
    items.push(...look.map((r): AskItem => ({ kind: "line", id: r.id, block: id })));
    const rest = waiting.filter((r) => !look.includes(r)).map((r) => r.id);
    if (rest.length > 0) items.push({ kind: "rest", ids: rest, block: id });
    if (id != null && !seen.has(`stamp:${id}`)) items.push({ kind: "stamp", block: id });
  }
  return items;
}

/**
 * A line that needs its own card: a blocker, an unsure reading, or a failed check he hasn't
 * kept as written through an answer. One whose problems he kept comes on the quick confirm.
 */
function needsOwnCard(row: ReviewRow, entry: ValidationEntry | undefined, findings: readonly Finding[], kept: ReadonlySet<string>): boolean {
  return cardStatus(row, entry, findings.filter((f) => !kept.has(ackFingerprint(f))), undefined) === "look";
}

/**
 * Which lines an answer may accept, by the question's kind (T1). A card accepts only the lines
 * whose figures it showed, with a way to change them: "yes, it's Karim's" settles the name and
 * the kind, never the lines, which then come on the quick confirm.
 * - `lines`: the lines the question is about, and any line the answer added;
 * - `changed`: only the lines whose figures the answer changed, and any it added ("use ৳…"
 *   changes one; "it's written that way" changes none);
 * - `added`: only a line the answer added (the "before" he gave);
 * - `none`: no line.
 */
export const ANSWER_ACCEPTS = {
  doubt: "lines",
  price: "lines",
  delivery: "lines",
  direction: "lines",
  memo_differs: "lines",
  // Its card lists each line with its figure (the chips).
  block_kind: "lines",
  unbalanced: "changed",
  opening: "added",
  meaning: "none",
  same_party: "none",
  date: "none",
  memo: "none",
  // Its lines come from the memo, not the page, and the card can't change their figures.
  memo_extra: "none",
} as const satisfies Record<QuestionKind, "lines" | "changed" | "added" | "none">;

const FIGURES = ["quantityText", "rateText", "amountText", "balanceText"] as const;

/**
 * The lines an answer accepts (`ANSWER_ACCEPTS`), from the review just before it and just after
 * it. An option that changes nothing ("later", "one by one") accepts none: nothing is settled.
 */
export function answeredLines(before: Review, after: Review, question: Question, answer: Answer): string[] {
  const rule = ANSWER_ACCEPTS[question.kind];
  const option = "option" in answer ? question.options.find((o) => o.id === answer.option) : null;
  if (rule === "none" || option?.changes.length === 0) return [];
  const was = new Map(before.rows.map((r) => [r.id, r]));
  const added = after.rows.filter((r) => !was.has(r.id)).map((r) => r.id);
  if (rule === "added") return added;
  if (rule === "changed") {
    const changed = after.rows.filter((r) => {
      const old = was.get(r.id);
      return old != null && FIGURES.some((k) => old.values[k] !== r.values[k]);
    });
    return [...changed.map((r) => r.id), ...added];
  }
  return [...new Set([...question.entries, ...(question.entry ? [question.entry] : []), ...added])];
}

/**
 * After an answer, the lines it accepts (`answeredLines`) are accepted as they now stand, but
 * only a line he has nothing left to decide on: no blocker, and every problem still on it one he
 * chose to keep ("it's written that way"). A line that still shows a problem comes back as its
 * own card. Checks that couldn't run (a balance waiting for a price) are accepted with it, as
 * the card that follows shows the open due.
 */
export function acceptAnswered(before: Review, after: Review, question: Question, answer: Answer, acceptances: Acceptances): Acceptances {
  const { findings, entries } = checkReview(after);
  const kept = acceptedFindings(after.page.values);
  const out = { ...acceptances };
  for (const id of answeredLines(before, after, question, answer)) {
    const row = after.rows.find((r) => r.id === id);
    const entry = entries.get(id);
    if (!row || row.status !== "draft" || !entry) continue;
    const { blockers, needsAck } = assessEntry(entry, findings);
    if (blockers.length === 0 && needsAck.every((f) => kept.has(ackFingerprint(f)))) out[id] = acceptanceFor(entry, findings, "ok");
  }
  return out;
}

/** "All correct" on the quick confirm: each listed line that needs no decision, or none but the problems he kept. */
export function acceptRest(review: Review, ids: readonly string[], acceptances: Acceptances): Acceptances {
  const { findings, entries } = checkReview(review);
  const kept = acceptedFindings(review.page.values);
  const out = { ...acceptances };
  for (const id of ids) {
    const row = review.rows.find((r) => r.id === id);
    const entry = entries.get(id);
    if (row?.status === "draft" && entry && !isAccepted(entry, findings, acceptances[id]) && !needsOwnCard(row, entry, findings, kept)) out[id] = acceptanceFor(entry, findings, "ok");
  }
  return out;
}

/** A typed price as poisha, or null while it isn't a whole number yet. */
export function draftPoisha(text: string | undefined): number | null {
  if (!text) return null;
  const n = parseMoney(text.replace(/\.$/, ""));
  return n.ok ? n.value : null;
}

/** The memo's prices a price slot can take (U4): the question's options with a value, not "later". */
export const priceOptions = (q: Question): QuestionOption[] => q.options.filter((o) => !o.later && !o.local && o.value != null);

/** What a price slot holds: what he typed, else the price the company's memo proposes (U4), else nothing. */
export function slotText(q: Question, drafts: Readonly<Record<string, string>>): string | undefined {
  const typed = q.entry ? drafts[q.entry] : undefined;
  return typed ?? priceOptions(q).find((o) => o.id === q.proposed)?.value;
}

/** The memo option whose price the slot holds, if any: the slot says where its price came from. */
export function slotOption(q: Question, text: string | undefined): QuestionOption | null {
  const p = draftPoisha(text);
  return p == null ? null : (priceOptions(q).find((o) => draftPoisha(o.value) === p) ?? null);
}

/**
 * What "Save the prices" sends for one slot: the memo's option while the slot holds its price, so
 * the answer records that the price came from the memo (and the memo's rate goes in with it),
 * else the typed value, written like the page's figures (`sample`). Null: the slot is empty.
 */
export function slotAnswer(q: Question, text: string | undefined, sample: string | null): Answer | null {
  if (draftPoisha(text) == null) return null;
  const memo = slotOption(q, text);
  return memo ? { option: memo.id } : { value: typedText(text!, sample) };
}

export type GoodsLine = { id: string; amount: number | null };

/**
 * A visit or account block worked out by code from its lines, in poisha, as the card shows it:
 * owed before, paid, goods (a missing price is null: a gap, never a zero) and owed now. `now`
 * is null while any goods line has no price; `known` is the part that is known.
 */
export type AccountFigures = { kind: "account"; party: "supplier" | "customer"; before: number | null; paid: number; goods: GoodsLine[]; known: number; now: number | null };
/** Day sales, expenses or anything else: the sum of the lines' amounts. */
export type TotalFigures = { kind: "total"; total: number; lines: number };

const amountOf = (row: ReviewRow): number | null => {
  const n = deriveNumbers(row.values);
  return n.amount?.ok ? n.amount.value : null;
};

export function blockFigures(block: BlockValues | null, rows: readonly ReviewRow[]): AccountFigures | TotalFigures {
  const party = block ? blockPartyKind(block.kind) : null;
  const counted = live(rows).filter((r) => !r.values.crossedOut);
  if (!party) {
    const total = counted.filter((r) => r.values.type !== "subtotal" && r.values.type !== "closing_balance" && r.values.type !== "opening_balance").reduce((s, r) => s + (amountOf(r) ?? 0), 0);
    return { kind: "total", total, lines: counted.length };
  }
  let before: number | null = null;
  let paid = 0;
  const goods: GoodsLine[] = [];
  for (const row of counted) {
    if (row.values.type === "opening_balance") {
      const n = deriveNumbers(row.values);
      const v = n.balance?.ok ? n.balance.value : n.amount?.ok ? n.amount.value : null;
      if (v != null) before = (before ?? 0) + v;
      continue;
    }
    const sign = accountSign(party, row.values.type);
    if (sign === -1) paid += amountOf(row) ?? 0;
    else if (sign === 1) goods.push({ id: row.id, amount: isUnpricedGoods(row.values) ? null : amountOf(row) });
  }
  const known = (before ?? 0) - paid + goods.reduce((s, g) => s + (g.amount ?? 0), 0);
  return { kind: "account", party, before, paid, goods, known, now: goods.every((g) => g.amount != null) ? known : null };
}

/** The part of the page a block covers: the box round its lines' boxes (blocks keep none of their own). */
export function blockRegion(rows: readonly ReviewRow[]): GridBox | null {
  return unionBox(rows.map((r) => r.candidate?.bbox));
}

/** The box round several boxes; null when there are none. */
export function unionBox(all: ReadonlyArray<GridBox | null | undefined>): GridBox | null {
  const boxes = all.filter((b): b is GridBox => b != null);
  if (boxes.length === 0) return null;
  return {
    x_min: Math.min(...boxes.map((b) => b.x_min)),
    y_min: Math.min(...boxes.map((b) => b.y_min)),
    x_max: Math.max(...boxes.map((b) => b.x_max)),
    y_max: Math.max(...boxes.map((b) => b.y_max)),
  };
}

/** Block tone (DIRECTION.md): visit and supplier blocks blue, day sales green, the rest plain. */
export function blockTone(block: BlockValues | null): "blue" | "green" | "plain" {
  if (!block) return "plain";
  if (block.kind === "supplier_visit" || block.kind === "supplier_account") return "blue";
  return block.kind === "day_sales" ? "green" : "plain";
}

/**
 * A block is done (it gets its stamp) when nothing about it is open or set aside and each of its
 * draft lines is accepted. With a question put off for later it isn't: the card shows what is
 * still open instead.
 */
export function blockDone(review: Review, set: QuestionSet, acceptances: Acceptances, blockId: string): boolean {
  if ([...set.questions, ...set.later].some((q) => q.block === blockId)) return false;
  const { findings, entries } = checkReview(review);
  const group = blockLines(review).find((g) => g.block?.id === blockId);
  return (group?.rows ?? []).every((r) => r.status !== "draft" || isAccepted(entries.get(r.id), findings, acceptances[r.id]));
}

/** Questions per block for the overview's chips; the page's own under null. */
export function questionCounts(set: QuestionSet): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const q of set.questions) out.set(q.block, (out.get(q.block) ?? 0) + 1);
  return out;
}
