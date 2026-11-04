/**
 * F2 fix 10: his parts are divided by a short pen stroke drawn between them. On his 5 Nov pages
 * every part ends with one, yet the model ran on across six of them: হাবিব's credit took the cash
 * sales লবণ and মরিচ under it, the cash sales চাল and ডিম took "করিম জমা ২০০" from under the next
 * stroke, and two company visits took the cash sales after them. He had to split each by hand.
 *
 * The box snapper (`ink-rows.ts`) finds the strokes, since it takes them out before it looks for
 * rows of writing. Once the boxes are on the writing, a part with a stroke between two of its lines
 * is split there. Each new piece gets its kind from its own lines: one customer named on its জমা or
 * বাকি lines makes that customer's account; goods with nobody named are the day's sales (cash, as
 * on the rest of his pages); anything else is "something else", which Scriba asks about. The first
 * piece keeps the part as read when the part had a heading, since the heading is above it.
 *
 * Never split right before a total (মোট, হিসাব): a line drawn above a total is a sum line.
 * Pure: the reading with its boxes on the writing in, the reading out.
 */
import type { BoundingBox, BlockKind, TransactionType } from "@/lib/ledger/types";
import { nextBlockId } from "@/lib/ledger/blocks";
import { kindIn } from "@/lib/questions/engine";
import { MAX_BLOCKS } from "@/lib/review/values";
import type { Stroke } from "@/lib/images/ink-rows";
import type { NormalizedBlock, NormalizedEntry, NormalizedExtraction } from "./parse";

const TOTALS: ReadonlySet<TransactionType> = new Set(["subtotal", "closing_balance"]);
const MARKERS: ReadonlySet<TransactionType> = new Set(["subtotal", "closing_balance", "opening_balance"]);
const SALE_LIKE: ReadonlySet<TransactionType> = new Set(["unknown", "cash_sale", "credit_sale"]);
const ON_ACCOUNT: ReadonlySet<TransactionType> = new Set(["repayment", "credit_sale"]);

const mid = (b: BoundingBox) => (b.y_min + b.y_max) / 2;
const height = (b: BoundingBox) => Math.abs(b.y_max - b.y_min);
const named = (e: NormalizedEntry) => e.values.customer?.trim() || null;
const fold = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const hasSomething = (e: NormalizedEntry) => (e.values.amountText?.trim().length ?? 0) > 0 || (e.values.item?.trim().length ?? 0) > 0;
/** "হাবিব জমা ৩০০" read as "হাতে জমা" with no name is still money paid in, never a sale. */
const saysPaid = (e: NormalizedEntry) => /জমা|পরিশোধ|দিলাম|দিল/u.test(e.values.sourceText);

/**
 * How long his strokes between parts are, on the 0–1000 grid: 10% to 35% of the page's width. His
 * run 130–310 on his 5 Nov pages; the headline of a word is shorter, a piece of a ruled line longer.
 */
export const STROKE_MIN = 100;
export const STROKE_MAX = 350;
/** They start at the writing's left edge or further left; pieces of a ruled line start anywhere. */
export const STROKE_LEFT = 60;

/**
 * A stroke between line `a` and the next line `b` of the same part: below one and above the other,
 * as long as his strokes are, and starting where the writing starts. Measured on his 5 Nov pages:
 * every stroke he drew between two parts passes, and the pieces of ruled lines and letters don't.
 */
export function strokeBetween(a: BoundingBox, b: BoundingBox, strokes: readonly Stroke[]): boolean {
  const top = Math.max(mid(a), a.y_max - 0.2 * height(a));
  const bottom = Math.min(mid(b), b.y_min + 0.2 * height(b));
  const left = Math.min(a.x_min, b.x_min) + STROKE_LEFT;
  return strokes.some((s) => s.y > top && s.y < bottom && s.x1 - s.x0 >= STROKE_MIN && s.x1 - s.x0 <= STROKE_MAX && s.x0 <= left);
}

/** What a piece of a part is, from its own lines; null when they don't say. */
export function pieceKind(piece: readonly NormalizedEntry[]): { kind: BlockKind; party: string | null } | null {
  const entries = piece.filter((e) => !e.values.crossedOut);
  const names = [...new Set(entries.flatMap((e) => (named(e) ? [fold(named(e)!)] : [])))];
  const lines = entries.filter((e) => !MARKERS.has(e.values.type));
  if (names.length === 1 && lines.length > 0 && lines.every((e) => ON_ACCOUNT.has(e.values.type) || !hasSomething(e))) {
    return { kind: "customer_account", party: names[0]! };
  }
  if (names.length === 0 && lines.length > 0 && lines.every((e) => SALE_LIKE.has(e.values.type) && hasSomething(e) && !saysPaid(e))) {
    return { kind: "day_sales", party: null };
  }
  return null;
}

function boxOf(entries: readonly NormalizedEntry[]): BoundingBox | null {
  const boxes = entries.flatMap((e) => (e.bbox ? [e.bbox] : []));
  if (boxes.length === 0) return null;
  return {
    x_min: Math.min(...boxes.map((b) => b.x_min)),
    y_min: Math.min(...boxes.map((b) => b.y_min)),
    x_max: Math.max(...boxes.map((b) => b.x_max)),
    y_max: Math.max(...boxes.map((b) => b.y_max)),
  };
}

/** The reading with each part split at the strokes drawn between its lines. Unchanged when none is. */
export function splitAtStrokes(extraction: NormalizedExtraction, strokes: readonly Stroke[]): NormalizedExtraction {
  const blocks = extraction.blocks;
  if (!blocks || blocks.length === 0 || strokes.length === 0) return extraction;

  const byLine = [...extraction.entries].sort((a, b) => a.line - b.line);
  const out: NormalizedBlock[] = [];
  const moved = new Map<string, { block: string; kind: BlockKind }>();
  let made = 0;
  for (const block of blocks) {
    const own = byLine.filter((e) => e.values.block === block.id);
    // Pieces: a new one starts after a stroke, unless the line under it is a total.
    const pieces: NormalizedEntry[][] = [];
    for (const e of own) {
      const last = pieces.at(-1)?.at(-1);
      const cut = last?.bbox && e.bbox && !TOTALS.has(e.values.type) && strokeBetween(last.bbox, e.bbox, strokes);
      if (!last || cut) pieces.push([e]);
      else pieces.at(-1)!.push(e);
    }
    if (pieces.length < 2 || blocks.length + made + pieces.length - 1 > MAX_BLOCKS) {
      out.push(block);
      continue;
    }
    // The first piece is the part as read when it has a heading above it; otherwise its lines say.
    const first = block.title?.trim() ? null : pieceKind(pieces[0]!);
    const head: NormalizedBlock = first ? { ...block, kind: first.kind, party: first.party, person: first.kind === block.kind ? block.person : null } : block;
    out.push(head);
    if (head.kind !== block.kind) for (const e of pieces[0]!) moved.set(e.candidateId, { block: head.id, kind: head.kind });
    for (const piece of pieces.slice(1)) {
      const kind = pieceKind(piece) ?? { kind: "other" as const, party: null };
      const id = nextBlockId([...blocks, ...out]);
      out.push({ id, kind: kind.kind, title: null, party: kind.party, person: null, dateText: block.dateText, box: boxOf(piece) });
      made++;
      for (const e of piece) moved.set(e.candidateId, { block: id, kind: kind.kind });
    }
  }
  if (made === 0) return extraction;

  const retyped = new Set<string>();
  const entries = extraction.entries.map((e) => {
    const to = moved.get(e.candidateId);
    if (!to) return e;
    const type = kindIn(to.kind, e.values);
    if (type === e.values.type) return { ...e, values: { ...e.values, block: to.block } };
    retyped.add(e.candidateId);
    return { ...e, values: { ...e.values, block: to.block, type }, reviewFields: e.reviewFields.filter((f) => f !== "type") };
  });
  const doubts = extraction.doubts?.filter((d) => d.field !== "type" || !retyped.has(d.entryId));
  return {
    ...extraction,
    blocks: out,
    entries,
    ...(doubts ? { doubts } : {}),
    warnings: [...extraction.warnings, `Split ${made} part${made === 1 ? "" : "s"} at the lines drawn between them.`],
  };
}
