import type { GridBox } from "@/components/kit/strip-geometry";
import { blockPartyKind, cashByDefault, groupByBlock, isUnpricedGoods, pageBlocks } from "@/lib/ledger/blocks";
import type { BlockValues, PageValues, ReviewableField } from "@/lib/ledger/types";
import { acceptedFindings } from "@/lib/questions/answer";
import { parseMoney } from "@/lib/numerals";
import type { Answer, Question, QuestionKind, QuestionOption, QuestionSet } from "@/lib/questions/types";
import { ackFingerprint, assessEntry } from "@/lib/review/approval";
import type { ReviewRow } from "@/lib/review/state";
import { type Finding, type ValidationEntry, accountSign, deriveNumbers } from "@/lib/validation/engine";
import { type Acceptances, type Review, acceptanceFor, cardStatus, checkReview, isAccepted, typedText } from "./deck-model";
import type { LinePatch } from "./review-api";

/**
 * The "Scriba asks" deck (B7, DESIGN_SPEC D5) over a reading with blocks, kept pure so it is
 * tested. The questions come from the engine (`src/lib/questions`); this decides the order they
 * are shown in, which lines an answer accepts, and what is left for the quick confirm. Since F2
 * (4 Nov) every figure is checked first, all together, on the numbers screen; the questions come
 * after. Acceptance is still the approval model of `deck-model.ts`: the server re-checks every
 * line at confirmation, so nothing here can confirm a line on its own.
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
  | { kind: "rest"; ids: string[]; block: string | null };

export const itemKey = (item: AskItem): string =>
  item.kind === "question" || item.kind === "line" ? `${item.kind}:${item.id}` : item.kind === "prices" ? `prices:${item.ids[0]}` : `rest:${item.block}`;

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
 * by block: its questions, its problem lines, a quick confirm of the rest. Items that are done
 * drop out, so the first item is always the current card. After the numbers screen (F2) the
 * lines he saw there are accepted as each part's questions are answered (`acceptSeen`), so a
 * quick confirm only comes for lines an answer changed or added.
 */
export function deckItems(review: Review, set: QuestionSet, acceptances: Acceptances): AskItem[] {
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
  // Each part's lines come on that part's quick confirm (T2).
  split: "none",
  // Its card shows the "before" line's figure beside the khata's (T3).
  book_differs: "lines",
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
 * the card that follows shows the open due. A line the answer moved to another part (T2) loses
 * its acceptance: it is looked at again in its new part.
 */
export function acceptAnswered(before: Review, after: Review, question: Question, answer: Answer, acceptances: Acceptances): Acceptances {
  const { findings, entries } = checkReview(after);
  const kept = acceptedFindings(after.page.values);
  const out = { ...acceptances };
  const part = new Map(before.rows.map((r) => [r.id, r.values.block ?? null]));
  for (const r of after.rows) if (part.has(r.id) && part.get(r.id) !== (r.values.block ?? null)) delete out[r.id];
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

// ---------------------------------------------------------------------------
// The numbers screen (F2, 4 Nov): every figure first, all together, then the questions
// ---------------------------------------------------------------------------

/** The figures a line can hold, as the fix sheet names them. */
export const NUMBER_FIELDS = ["qty", "rate", "amount", "balance"] as const satisfies readonly ReviewableField[];
export type NumberField = (typeof NUMBER_FIELDS)[number];

/** The figures on a line that Scriba wasn't sure of: the numbers screen marks them. */
export const unsureNumbers = (row: ReviewRow): NumberField[] => NUMBER_FIELDS.filter((f) => row.reviewFields.includes(f));

/** A line the numbers screen shows him to check: a draft that isn't crossed out. */
export const checkable = (row: ReviewRow): boolean => row.status === "draft" && !row.values.crossedOut;

/** In the day's sales, a line that is a sale: cash, credit, or of no kind yet (cash by default). */
export function isSaleLine(block: BlockValues | null, row: ReviewRow): boolean {
  if (block?.kind !== "day_sales" || row.status === "rejected") return false;
  return row.values.type === "cash_sale" || row.values.type === "credit_sale" || cashByDefault(block.kind, row.values);
}

/** What the day's sales are, as the part's tag says: all cash (the default), all on credit, or both. Null: no sales. */
export function salesKind(block: BlockValues | null, rows: readonly ReviewRow[]): "cash" | "credit" | "mixed" | null {
  const sales = rows.filter((r) => isSaleLine(block, r));
  if (sales.length === 0) return null;
  const credit = sales.filter((r) => r.values.type === "credit_sale").length;
  return credit === 0 ? "cash" : credit === sales.length ? "credit" : "mixed";
}

/**
 * What "all the numbers are right" saves, line by line: the figures Scriba was unsure of, which he
 * has now seen beside the writing (checked), and in the day's sales a line of no kind as the cash
 * sale its part's tag showed (`cashByDefault`). Lines with nothing to save are left out.
 */
export function numbersPatches(review: Review): Array<{ id: string; patch: LinePatch }> {
  const out: Array<{ id: string; patch: LinePatch }> = [];
  for (const { block, rows } of blockLines(review)) {
    for (const row of rows.filter(checkable)) {
      const markChecked = unsureNumbers(row);
      const cash = block != null && cashByDefault(block.kind, row.values);
      if (markChecked.length === 0 && !cash) continue;
      out.push({ id: row.id, patch: { ...(cash ? { values: { ...row.values, type: "cash_sale" as const } } : {}), ...(markChecked.length > 0 ? { markChecked } : {}) } });
    }
  }
  return out;
}

/**
 * Questions the numbers screen settles, so the deck won't ask them: a figure Scriba doubted (he
 * has seen it beside the writing; a mix of Bangla and English digits is still asked), the day's
 * sales as cash, and the photo's day when no date is written (shown at the top, he can change it).
 */
export function settledByNumbers(q: Question): boolean {
  if (q.kind === "doubt") return q.field != null && (NUMBER_FIELDS as readonly string[]).includes(q.field) && !q.options.some((o) => o.accepts);
  if (q.kind === "date") return q.proposed != null;
  return q.kind === "block_kind" && q.options.some((o) => o.id === "cash");
}

/**
 * How many questions the deck will ask after the numbers screen, for its "then N questions": not
 * those it settles, nor a line's kind in a part whose "what is this part?" is still open with no
 * answer to propose: his answer to that one usually decides the lines' kinds (F2: the day's sales
 * are cash), so they would only make the count look long.
 */
export function questionsAhead(set: QuestionSet): number {
  const open = new Set(set.questions.filter((q) => q.kind === "meaning" && q.proposed == null).map((q) => q.block));
  return set.questions.filter((q) => !settledByNumbers(q) && !(q.kind === "direction" && open.has(q.block))).length;
}

/** A line's figures and part: what he saw on the numbers screen, compared later by `acceptSeen`. */
export const figuresKey = (row: ReviewRow): string => JSON.stringify([row.values.block ?? null, ...FIGURES.map((k) => row.values[k] ?? null)]);

/** What he has seen: each line he could check, with its figures as they stand. */
export type SeenFigures = Readonly<Record<string, string>>;
export function seenNow(review: Review): SeenFigures {
  return Object.fromEntries(review.rows.filter(checkable).map((r) => [r.id, figuresKey(r)]));
}

/**
 * Every line whose figures he saw (and that haven't changed since) is accepted once nothing else
 * is open about it: no question left on it (answered, not put off for later), no blocker, no
 * problem he hasn't kept. Run after the numbers screen and after each answer or edit, so the
 * deck only asks; a line moved to another part (T2) or changed by an answer comes on its quick
 * confirm instead.
 */
export function acceptSeen(review: Review, set: QuestionSet, seen: SeenFigures, acceptances: Acceptances): Acceptances {
  const { findings, entries } = checkReview(review);
  const kept = acceptedFindings(review.page.values);
  const covered = coveredLines(set);
  const out = { ...acceptances };
  for (const row of review.rows) {
    if (row.status !== "draft" || covered.has(row.id) || seen[row.id] !== figuresKey(row)) continue;
    const entry = entries.get(row.id);
    if (!entry || isAccepted(entry, findings, out[row.id]) || needsOwnCard(row, entry, findings, kept)) continue;
    out[row.id] = acceptanceFor(entry, findings, "ok");
  }
  return out;
}

/** The sums on a part that don't come out, as code worked them out: the numbers screen shows them under the part. */
export function partFailures(findings: readonly Finding[], rows: readonly ReviewRow[]): Finding[] {
  const ids = new Set(rows.map((r) => r.id));
  return findings.filter((f) => f.status === "fail" && OFF_RULES.has(f.ruleId) && f.expected != null && f.observed != null && f.entryIds.some((id) => ids.has(id)));
}

/** True when some sum on the part was checked and came out. */
export function partChecked(findings: readonly Finding[], rows: readonly ReviewRow[]): boolean {
  const ids = new Set(rows.map((r) => r.id));
  return findings.some((f) => f.status === "pass" && OFF_RULES.has(f.ruleId) && f.entryIds.some((id) => ids.has(id)));
}

const OFF_RULES: ReadonlySet<string> = new Set(["balance_equation", "running_balance", "written_total", "qty_x_rate"]);

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

/**
 * How far a part's picture reaches above its first line and below its last, in line heights (its
 * lines' median). The model's boxes are often off by a third of a line, so the box round them cut
 * the first or last line of 6 of 60 parts on his five pages (F2, 4 Nov); with this, none.
 */
export const PART_REACH = 0.6;

/**
 * The part of the page a block covers: the box round its lines' boxes (blocks keep none of their
 * own), reaching `PART_REACH` of a line further up and down, but never past halfway to a line of
 * the page that isn't one of them (`page`) and sits above or below, so no other part comes in.
 */
export function blockRegion(rows: readonly ReviewRow[], page: readonly ReviewRow[] = []): GridBox | null {
  const boxes = rows.map((r) => r.candidate?.bbox).filter((b): b is GridBox => b != null);
  const box = unionBox(boxes);
  if (!box) return null;
  const heights = boxes.map((b) => Math.abs(b.y_max - b.y_min)).sort((a, b) => a - b);
  const reach = heights[Math.floor(heights.length / 2)]! * PART_REACH;
  const mine = new Set(rows.map((r) => r.id));
  const beside = page
    .filter((r) => !mine.has(r.id))
    .map((r) => r.candidate?.bbox)
    .filter((b): b is GridBox => b != null && b.x_max > box.x_min && b.x_min < box.x_max);
  const above = Math.max(0, ...beside.filter((b) => b.y_max <= box.y_min).map((b) => (b.y_max + box.y_min) / 2));
  const below = Math.min(1000, ...beside.filter((b) => b.y_min >= box.y_max).map((b) => (b.y_min + box.y_max) / 2));
  return { ...box, y_min: Math.max(box.y_min - reach, above), y_max: Math.min(box.y_max + reach, below) };
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

