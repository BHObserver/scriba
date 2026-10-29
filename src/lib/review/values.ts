import { z } from "zod";
import {
  type EntryValues,
  type ReviewableField,
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
});

export const pageValuesSchema = z.object({
  dateText: shortText,
  ledgerType: z.enum(LEDGER_TYPES),
  accountName: shortText,
});

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
