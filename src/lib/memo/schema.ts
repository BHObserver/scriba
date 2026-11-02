/**
 * U4: the structured output requested for a company memo (challan, invoice, cash memo), versioned.
 *
 * As for a page, two definitions of one shape: MEMO_JSON_SCHEMA is sent as `text.format`
 * (strict JSON Schema) and memoOutputSchema (zod) re-validates every response. A test keeps
 * them in agreement. The model copies what is printed or written; code computes every number.
 */
import { z } from "zod";
import { LEGIBILITY } from "@/lib/extraction/schema";

export const MEMO_SCHEMA_VERSION = "scriba-memo-1";
/** A page can carry this many company memos (the documents route enforces it; the details screen hides "add"). */
export const MAX_MEMOS_PER_PAGE = 6;

export const MEMO_SCHEMA_NAME = "scriba_company_memo_v1";

/** The fields of a memo line the model may be unsure of. */
export const MEMO_LINE_FIELDS = ["item", "qty", "unit", "rate", "amount"] as const;
export type MemoLineField = (typeof MEMO_LINE_FIELDS)[number];

export const MEMO_FIELDS = ["company", "person", "number", "date_text", "legibility"] as const;
export const MEMO_LINE_KEYS = ["id", "text", "item", "qty", "unit", "rate", "amount", "crossed_out", "review", "box"] as const;
export const MEMO_TOTAL_FIELDS = ["subtotal", "discount", "total", "previous_due", "paid", "due"] as const;

const nullableString = { type: ["string", "null"] } as const;
const BOX = {
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
} as const;

export const MEMO_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["memo", "lines", "totals", "warnings"],
  properties: {
    memo: {
      type: "object",
      additionalProperties: false,
      required: [...MEMO_FIELDS],
      properties: {
        company: nullableString,
        person: nullableString,
        number: nullableString,
        date_text: nullableString,
        legibility: { type: "string", enum: [...LEGIBILITY] },
      },
    },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...MEMO_LINE_KEYS],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          item: nullableString,
          qty: nullableString,
          unit: nullableString,
          rate: nullableString,
          amount: nullableString,
          crossed_out: { type: "boolean" },
          review: { type: "array", items: { type: "string", enum: [...MEMO_LINE_FIELDS] } },
          box: BOX,
        },
      },
    },
    totals: {
      type: "object",
      additionalProperties: false,
      required: [...MEMO_TOTAL_FIELDS],
      properties: Object.fromEntries(MEMO_TOTAL_FIELDS.map((f) => [f, nullableString])) as Record<(typeof MEMO_TOTAL_FIELDS)[number], typeof nullableString>,
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

// Local validation. Bounds keep a malformed or runaway response from being stored as data.
const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => z.string().max(max).nullable();

export const memoOutputSchema = z.object({
  memo: z.object({
    company: optionalText(200),
    person: optionalText(200),
    number: optionalText(80),
    date_text: optionalText(100),
    legibility: z.enum(LEGIBILITY),
  }),
  lines: z
    .array(
      z.object({
        id: text(40),
        text: text(600),
        item: optionalText(200),
        qty: optionalText(60),
        unit: optionalText(60),
        rate: optionalText(60),
        amount: optionalText(60),
        crossed_out: z.boolean(),
        review: z.array(z.enum(MEMO_LINE_FIELDS)).max(MEMO_LINE_FIELDS.length),
        box: z.object({ x_min: z.number(), y_min: z.number(), x_max: z.number(), y_max: z.number() }).nullable(),
      }),
    )
    .max(80),
  totals: z.object(Object.fromEntries(MEMO_TOTAL_FIELDS.map((f) => [f, optionalText(60)])) as Record<(typeof MEMO_TOTAL_FIELDS)[number], ReturnType<typeof optionalText>>),
  warnings: z.array(text(400)).max(30),
});

export type MemoOutput = z.infer<typeof memoOutputSchema>;
