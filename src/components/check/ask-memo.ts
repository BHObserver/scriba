import type { GridBox } from "@/components/kit/strip-geometry";
import type { MemoForPage } from "@/lib/memo/match";
import type { Question, Why } from "@/lib/questions/types";
import { unionBox } from "./ask-model";
import type { Photo } from "./reading-view";

/**
 * U4: a company memo photographed with the page, as the ask deck shows it beside the questions
 * that take their figures from it (`Question.memo`). Built on the server from the memo's latest
 * reading, and on the dev board from a stored one. Pure, so it is tested.
 */
export type MemoView = {
  document: string;
  photo: Photo;
  company: string | null;
  /** The due the memo prints, in poisha. */
  due: number | null;
  /** Its lines agree with its written totals (code's check); null: nothing to compare. */
  agrees: boolean | null;
  lines: Array<{ id: string; box: GridBox | null }>;
};

export function memoView({ documentId, memo }: MemoForPage, photo: Photo): MemoView {
  return {
    document: documentId,
    photo,
    company: memo.company,
    due: memo.totals.due.poisha,
    agrees: memo.check.agrees,
    lines: memo.lines.map((l) => ({ id: l.id, box: l.box })),
  };
}

/** The memo a question takes its figures from, if it was photographed and read. */
export const memoOf = (q: Question, memos: readonly MemoView[]): MemoView | null => (q.memo ? (memos.find((m) => m.document === q.memo!.document) ?? null) : null);

// The letterhead: the memo's top, down to its first line, within these bounds (0–1000 grid).
const HEAD_MIN = 120;
const HEAD_MAX = 300;

/**
 * The part of the memo a question points at: the box round the lines it names, or the letterhead
 * (the company's name) when it names none, as "which visit is this memo from?" does.
 */
export function memoRegion(view: MemoView, ids: readonly string[]): GridBox {
  const named = unionBox(view.lines.filter((l) => ids.includes(l.id)).map((l) => l.box));
  if (named) return named;
  const top = Math.min(HEAD_MAX, ...view.lines.map((l) => l.box?.y_min ?? HEAD_MAX));
  return { x_min: 0, y_min: 0, x_max: 1000, y_max: Math.max(HEAD_MIN, top) };
}

/** The price each goods line gets from the proposed answer: the memo's prices on the delivery card. */
export function proposedPrices(q: Question): Map<string, string> {
  const o = q.options.find((x) => x.id === q.proposed);
  return new Map((o?.changes ?? []).flatMap((c) => (c.op === "edit" && c.values?.amountText ? [[c.entry, c.values.amountText] as const] : [])));
}

/**
 * The line under the prices card. One price: its question's own (the engine's). Several priced
 * from the memo: ticked when, with the prices now in the slots, the visit comes to the due the memo
 * prints (`now`, worked out by code as the slots change), else ticked when the memo's lines agree
 * with its total. Several with no memo: the first's, as they all say the same.
 */
export function pricesWhy(questions: readonly Question[], memo: MemoView | null, now: number | null): Why | null {
  if (questions.length === 1 || !memo) return questions[0]?.why ?? null;
  if (memo.due != null && now === memo.due) return { sentence: { key: "q.memo.due", args: [{ money: memo.due }] }, verified: true };
  return memo.agrees === true ? { sentence: { key: "q.memo.sums" }, verified: true } : null;
}
