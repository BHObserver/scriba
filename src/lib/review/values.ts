import { z } from "zod";
import {
  type EntryValues,
  type ReviewableField,
  BLOCK_KINDS,
  LEDGER_TYPES,
  REVIEWABLE_FIELDS,
  TRANSACTION_TYPES,
} from "@/lib/ledger/types";

const shortText = z.string().trim().max(200).nullable().transform((s) => (s && s.length > 0 ? s : null));

export const entryValuesSchema = z.object({
  sourceText: z.string().max(600),
  type: z.enum(TRANSACTION_TYPES),
  customer: shortText,
  item: shortText,
  quantityText: shortText,
  unit: shortText,
  rateText: shortText,
  amountText: shortText,
  balanceText: shortText,
  crossedOut: z.boolean(),
  block: z.string().trim().min(1).max(40).nullable().optional(),
});

export const blockValuesSchema = z.object({
  id: z.string().trim().min(1).max(40),
  kind: z.enum(BLOCK_KINDS),
  title: shortText,
  party: shortText,
  person: shortText,
  dateText: shortText,
});

/** At most this many answers are kept per page: the latest per question, oldest dropped first. */
export const MAX_ANSWERS = 300;
/** At most this many blocks on a page: as read, and after he splits parts (T2). */
export const MAX_BLOCKS = 30;

export const answerRecordSchema = z.object({
  q: z.string().min(1).max(120),
  fp: z.string().min(1).max(40),
  a: z.string().min(1).max(60),
  accepted: z.array(z.string().max(400)).max(10).optional(),
  at: z.string().max(40),
});

export const pageValuesSchema = z.object({
  dateText: shortText,
  ledgerType: z.enum(LEDGER_TYPES),
  accountName: shortText,
  blocks: z
    .array(blockValuesSchema)
    .max(MAX_BLOCKS)
    .refine((blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length, "Block ids must be unique.")
    .optional(),
  answers: z.array(answerRecordSchema).max(MAX_ANSWERS).optional(),
});

/**
 * Values sent by a client that predates blocks carry no block fields. Keep the stored ones
 * instead of erasing them; an explicit value (even null for a line) replaces them.
 */
export function keepBlocks<T extends { blocks?: unknown }>(next: T, stored: { blocks?: unknown }): T {
  return next.blocks === undefined && stored.blocks !== undefined ? { ...next, blocks: stored.blocks } : next;
}
/** The same for answers to Scriba's questions: a page edit from an older client keeps them. */
export function keepAnswers<T extends { answers?: unknown }>(next: T, stored: { answers?: unknown }): T {
  return next.answers === undefined && stored.answers !== undefined ? { ...next, answers: stored.answers } : next;
}
export function keepBlock<T extends { block?: unknown }>(next: T, stored: { block?: unknown }): T {
  return next.block === undefined && stored.block !== undefined ? { ...next, block: stored.block } : next;
}

export const reviewableFieldSchema = z.enum(REVIEWABLE_FIELDS);

export const FIELD_TO_VALUE_KEY: Record<ReviewableField, keyof EntryValues> = {
  text: "sourceText",
  type: "type",
  customer: "customer",
  item: "item",
  qty: "quantityText",
  unit: "unit",
  rate: "rateText",
  amount: "amountText",
  balance: "balanceText",
};

export function changedFields(before: EntryValues, after: EntryValues): ReviewableField[] {
  return REVIEWABLE_FIELDS.filter((f) => before[FIELD_TO_VALUE_KEY[f]] !== after[FIELD_TO_VALUE_KEY[f]]);
}

/** A field the reviewer has edited is no longer "unread by the model": they chose its value. */
export function remainingReviewFields(current: ReviewableField[], before: EntryValues, after: EntryValues): ReviewableField[] {
  const touched = new Set(changedFields(before, after));
  return current.filter((f) => !touched.has(f));
}

export const EMPTY_ENTRY: EntryValues = {
  sourceText: "",
  type: "unknown",
  customer: null,
  item: null,
  quantityText: null,
  unit: null,
  rateText: null,
  amountText: null,
  balanceText: null,
  crossedOut: false,
};
