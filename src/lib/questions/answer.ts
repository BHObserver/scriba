/**
 * Answering Scriba's questions (U2). Pure: the answer route runs these on the server's own copy
 * of the review, and the check screen may run them to preview what an answer would change.
 *
 * An answer never confirms anything. It becomes the same edits a reviewer could make by hand
 * (line values, checked fields, a rejected or added line, the page date, a block's kind or
 * party), saved through the review rows and the page, whose triggers write the audit trail.
 * The answer itself is recorded on the page (`AnswerRecord`). Confirming lines still goes through
 * the approval rules, with whatever problems the answers accepted.
 */
import { splitPartyPerson } from "@/lib/ledger/blocks";
import { parseWrittenDate } from "@/lib/ledger/dates";
import type { AnswerRecord, EntryValues, PageValues, ReviewableField } from "@/lib/ledger/types";
import { parseQuantity } from "@/lib/numerals";
import { lineOrderAfter } from "@/lib/review/line-order";
import type { ReviewRow } from "@/lib/review/state";
import { EMPTY_ENTRY, FIELD_TO_VALUE_KEY, MAX_ANSWERS, remainingReviewFields } from "@/lib/review/values";
import { buildQuestions, deliveryChanges, readsAsNumber } from "./engine";
import type { Answer, Change, Question, QuestionInput } from "./types";

export type ReviewState = { page: PageValues; rows: ReviewRow[] };

/** Rows an answer adds get these ids until they are saved. */
export const NEW_ROW_PREFIX = "new-";

const MAX_TEXT = 200;

function editRow(row: ReviewRow, values: Partial<EntryValues> | undefined, checked: readonly ReviewableField[] | undefined): ReviewRow {
  const next = values ? { ...row.values, ...values } : row.values;
  let reviewFields = remainingReviewFields(row.reviewFields, row.values, next);
  if (checked) reviewFields = reviewFields.filter((f) => !checked.includes(f));
  return { ...row, values: next, reviewFields };
}

/** The review as it would be after the changes. Added rows get `new-1`, `new-2`… ids. */
export function applyChanges(state: ReviewState, changes: readonly Change[]): ReviewState {
  let page = state.page;
  let rows = [...state.rows];
  let added = 0;
  for (const c of changes) {
    switch (c.op) {
      case "edit":
        rows = rows.map((r) => (r.id === c.entry ? editRow(r, c.values, c.checked) : r));
        break;
      case "reject":
        rows = rows.map((r) => (r.id === c.entry ? { ...r, status: "rejected" as const } : r));
        break;
      case "add": {
        const orders = rows.map((r) => ({ id: r.id, order: r.lineOrder }));
        const lineOrder = lineOrderAfter(orders, c.after) ?? Math.max(0, ...orders.map((o) => o.order)) + 1;
        const row: ReviewRow = {
          id: `${NEW_ROW_PREFIX}${++added}`,
          extractedEntryId: null,
          lineOrder,
          values: c.values,
          reviewFields: [],
          status: "draft",
          version: 1,
          candidate: null,
        };
        rows = [...rows, row].sort((a, b) => a.lineOrder - b.lineOrder);
        break;
      }
      case "date":
        page = { ...page, dateText: c.dateText };
        break;
      case "block":
        page = { ...page, blocks: (page.blocks ?? []).map((b) => (b.id === c.block ? { ...b, ...c.values } : b)) };
        break;
    }
  }
  return { page, rows };
}

/** The page with this answer recorded: the latest per question, at most MAX_ANSWERS kept. */
export function withAnswer(page: PageValues, record: AnswerRecord): PageValues {
  const answers = [...(page.answers ?? []).filter((a) => a.q !== record.q), record].slice(-MAX_ANSWERS);
  return { ...page, answers };
}

/**
 * Problems the shopkeeper accepted as written through his answers, as approval fingerprints.
 * The check screen adds them to the line's acknowledgements when confirming. A fingerprint holds
 * the values it was given for, so it stops matching when those values change.
 */
export function acceptedFindings(page: PageValues): Set<string> {
  return new Set((page.answers ?? []).flatMap((a) => a.accepted ?? []));
}

export type AnswerError =
  /** The question is gone or its subject changed since it was shown: reload and ask again. */
  | "stale"
  | "unknown_option"
  /** The option only moves the screen. */
  | "local"
  /** This question takes no typed answer. */
  | "no_input"
  /** The typed or spoken value isn't valid for the field. */
  | "bad_value";

type Resolved = { ok: true; changes: Change[]; a: string; accepted: string[] } | { ok: false; error: AnswerError };

/** What a typed or spoken value changes, once it is valid for what it fills. */
function valueChanges(q: Question, raw: string, rows: readonly ReviewRow[], capturedOn: string | null, now: Date): Resolved {
  if (!q.input) return { ok: false, error: "no_input" };
  const value = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (value.length === 0 || value.length > MAX_TEXT) return { ok: false, error: "bad_value" };
  const bad: Resolved = { ok: false, error: "bad_value" };
  const ok = (changes: Change[]): Resolved => ({ ok: true, changes, a: "value", accepted: [] });
  const target = q.input.target;

  switch (q.input.kind) {
    case "money":
      if (target.to === "entry" ? !readsAsNumber(target.field, value) : !readsAsNumber("amount", value)) return bad;
      break;
    case "quantity":
      if (!parseQuantity(value).ok) return bad;
      break;
    case "date": {
      const at = capturedOn ? new Date(`${capturedOn}T06:00:00Z`) : now;
      if (!parseWrittenDate(value, at)) return bad;
      break;
    }
    case "text":
      break;
  }

  switch (target.to) {
    case "entry":
      return ok([{ op: "edit", entry: target.entry, values: { [FIELD_TO_VALUE_KEY[target.field]]: value } as Partial<EntryValues>, checked: [target.field] }]);
    case "party": {
      // "প্রাণ (সেলিম)" said or typed is the company and its rep, as the reading would have it.
      const { party, person } = splitPartyPerson(value);
      return ok([{ op: "block", block: target.block, values: person ? { party, person } : { party } }]);
    }
    case "date":
      return ok([{ op: "date", dateText: value }]);
    case "opening":
      return ok([{ op: "add", after: target.after, values: { ...EMPTY_ENTRY, type: "opening_balance", amountText: value, ...(target.block ? { block: target.block } : {}) } }]);
    case "delivery": {
      const goods = target.entries.map((id) => rows.find((r) => r.id === id)).filter((r): r is ReviewRow => r != null);
      if (goods.length !== target.entries.length) return { ok: false, error: "stale" };
      return ok(deliveryChanges(goods, target, value));
    }
  }
}

function resolve(q: Question, answer: Answer, input: QuestionInput, now: Date): Resolved {
  if ("value" in answer) return valueChanges(q, answer.value, input.rows, input.capturedOn, now);
  const option = q.options.find((o) => o.id === answer.option);
  if (!option) return { ok: false, error: "unknown_option" };
  if (option.local) return { ok: false, error: "local" };
  return { ok: true, changes: option.changes, a: option.id, accepted: option.accepts ?? [] };
}

export type AnswerOutcome =
  | { ok: true; question: Question; changes: Change[]; record: AnswerRecord; after: ReviewState }
  | { ok: false; error: AnswerError };

/**
 * Check an answer against the questions as they stand now and work out what it changes.
 * `fp` is the fingerprint of the question the shopkeeper saw: if the page changed since, the
 * answer is refused as stale rather than applied to something he didn't see.
 *
 * The record keeps the question's fingerprint in the state the answer leads to, so a question
 * that is still there afterwards (a block he said is a customer's account, now asking "this is
 * Karim's account, right?") counts as answered.
 */
export function answerQuestion(input: QuestionInput, questionId: string, fp: string, answer: Answer, now: Date): AnswerOutcome {
  const before = buildQuestions(input);
  const q = [...before.questions, ...before.later].find((x) => x.id === questionId);
  if (!q || q.fp !== fp) return { ok: false, error: "stale" };
  const resolved = resolve(q, answer, input, now);
  if (!resolved.ok) return resolved;

  const changed = applyChanges(input, resolved.changes);
  const after = buildQuestions({ ...input, ...changed });
  const still = [...after.questions, ...after.later].find((x) => x.id === q.id);
  const record: AnswerRecord = {
    q: q.id,
    fp: still?.fp ?? q.fp,
    a: resolved.a,
    ...(resolved.accepted.length > 0 ? { accepted: resolved.accepted } : {}),
    at: now.toISOString(),
  };
  return { ok: true, question: q, changes: resolved.changes, record, after: { ...changed, page: withAnswer(changed.page, record) } };
}
