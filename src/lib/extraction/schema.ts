/**
 * The structured output requested from Meta, versioned.
 *
 * Two definitions of the same shape live here on purpose:
 *  - EXTRACTION_JSON_SCHEMA is sent to the API as `text.format` (strict JSON Schema).
 *  - modelOutputSchema (zod) re-validates every response locally, because an
 *    API-side schema is not a substitute for application-side validation.
 * A unit test keeps the two in agreement.
 *
 * The model only transcribes. It returns numbers as the text that was written;
 * all normalization and arithmetic happen in TypeScript.
 */
import { z } from "zod";
import { LEDGER_TYPES, REVIEWABLE_FIELDS, TRANSACTION_TYPES } from "@/lib/ledger/types";

export const SCHEMA_VERSION = "scriba-extraction-1";
export const SCHEMA_NAME = "scriba_ledger_extraction_v1";

export const LEGIBILITY = ["clear", "partly_unclear", "mostly_unclear"] as const;

const nullableString = { type: ["string", "null"] } as const;

export const ENTRY_FIELDS = [
  "id",
  "line",
  "text",
  "type",
  "customer",
  "item",
  "qty",
  "unit",
  "rate",
  "amount",
  "balance",
  "crossed_out",
  "review",
  "note",
  "box",
] as const;

export const PAGE_FIELDS = ["date_text", "ledger_type", "account_name", "legibility"] as const;

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["page", "entries", "warnings"],
  properties: {
    page: {
      type: "object",
      additionalProperties: false,
      required: [...PAGE_FIELDS],
      properties: {
        date_text: nullableString,
        ledger_type: { type: "string", enum: [...LEDGER_TYPES] },
        account_name: nullableString,
        legibility: { type: "string", enum: [...LEGIBILITY] },
      },
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...ENTRY_FIELDS],
        properties: {
          id: { type: "string" },
          line: { type: "integer" },
          text: { type: "string" },
          type: { type: "string", enum: [...TRANSACTION_TYPES] },
          customer: nullableString,
          item: nullableString,
          qty: nullableString,
          unit: nullableString,
          rate: nullableString,
          amount: nullableString,
          balance: nullableString,
          crossed_out: { type: "boolean" },
          review: { type: "array", items: { type: "string", enum: [...REVIEWABLE_FIELDS] } },
          note: nullableString,
          box: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["x_min", "y_min", "x_max", "y_max"],
                properties: {
                  x_min: { type: "integer" },
                  y_min: { type: "integer" },
                  x_max: { type: "integer" },
                  y_max: { type: "integer" },
                },
              },
              { type: "null" },
            ],
          },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

// Local validation. Bounds keep a malformed or runaway response from being stored as data.
const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => z.string().max(max).nullable();

export const modelBoxSchema = z.object({
  x_min: z.number(),
  y_min: z.number(),
  x_max: z.number(),
  y_max: z.number(),
});

export const modelEntrySchema = z.object({
  id: text(40),
  line: z.number().int().min(0).max(10_000),
  text: text(600),
  type: z.enum(TRANSACTION_TYPES),
  customer: optionalText(200),
  item: optionalText(200),
  qty: optionalText(60),
  unit: optionalText(60),
  rate: optionalText(60),
  amount: optionalText(60),
  balance: optionalText(60),
  crossed_out: z.boolean(),
  review: z.array(z.enum(REVIEWABLE_FIELDS)).max(REVIEWABLE_FIELDS.length),
  note: optionalText(300),
  box: modelBoxSchema.nullable(),
});

export const modelOutputSchema = z.object({
  page: z.object({
    date_text: optionalText(100),
    ledger_type: z.enum(LEDGER_TYPES),
    account_name: optionalText(200),
    legibility: z.enum(LEGIBILITY),
  }),
  entries: z.array(modelEntrySchema).max(200),
  warnings: z.array(text(400)).max(30),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type ModelEntry = z.infer<typeof modelEntrySchema>;
