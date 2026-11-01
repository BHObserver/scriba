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
import { BLOCK_KINDS, LEDGER_TYPES, REVIEWABLE_FIELDS, type ReviewableField, TRANSACTION_TYPES, type TransactionType } from "@/lib/ledger/types";

/** The current schema. Version 2 adds the money-out transaction types. */
export const SCHEMA_VERSION = "scriba-extraction-2";
export const SCHEMA_NAME = "scriba_ledger_extraction_v2";

/**
 * Version 3 (prompt 6): the page is a list of blocks, every entry names its block, goods may
 * have no amount, and the model lists its doubts with two or three candidate readings.
 */
export const SCHEMA_V3_VERSION = "scriba-extraction-3";
export const SCHEMA_V3_NAME = "scriba_ledger_extraction_v3";

/** Version 1, kept so prompt 3 can still be run exactly as it was measured. */
export const SCHEMA_V1_VERSION = "scriba-extraction-1";
export const SCHEMA_V1_NAME = "scriba_ledger_extraction_v1";
const SCHEMA_V1_TRANSACTION_TYPES = TRANSACTION_TYPES.filter(
  (t) => !["purchase", "credit_purchase", "supplier_payment", "expense"].includes(t),
);

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

function extractionJsonSchema(transactionTypes: readonly TransactionType[]) {
  return {
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
            type: { type: "string", enum: [...transactionTypes] },
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
}

export const EXTRACTION_JSON_SCHEMA = extractionJsonSchema(TRANSACTION_TYPES);
export const EXTRACTION_JSON_SCHEMA_V1 = extractionJsonSchema(SCHEMA_V1_TRANSACTION_TYPES);

export const PAGE_FIELDS_V3 = ["date_text", "ledger_type", "legibility"] as const;
export const BLOCK_FIELDS = ["id", "kind", "title", "party", "person", "date_text", "box"] as const;
export const ENTRY_FIELDS_V3 = [...ENTRY_FIELDS, "block"] as const;
export const DOUBT_FIELDS = ["entry", "field", "options", "note"] as const;
/** A doubt is about one value; the whole line's text is the source, not a reading to choose. */
export const DOUBT_FIELD_NAMES = ["type", "customer", "item", "qty", "unit", "rate", "amount", "balance"] as const satisfies readonly ReviewableField[];

const BOX_JSON_SCHEMA = EXTRACTION_JSON_SCHEMA.properties.entries.items.properties.box;
const V2_ENTRY = EXTRACTION_JSON_SCHEMA.properties.entries.items;

/** Schema 3. Array lengths are not limited here (strict mode may not support it); zod and the parser bound them. */
export const EXTRACTION_JSON_SCHEMA_V3 = {
  type: "object",
  additionalProperties: false,
  required: ["page", "blocks", "entries", "doubts", "warnings"],
  properties: {
    page: {
      type: "object",
      additionalProperties: false,
      required: [...PAGE_FIELDS_V3],
      properties: {
        date_text: nullableString,
        ledger_type: { type: "string", enum: [...LEDGER_TYPES] },
        legibility: { type: "string", enum: [...LEGIBILITY] },
      },
    },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...BLOCK_FIELDS],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: [...BLOCK_KINDS] },
          title: nullableString,
          party: nullableString,
          person: nullableString,
          date_text: nullableString,
          box: BOX_JSON_SCHEMA,
        },
      },
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...ENTRY_FIELDS_V3],
        properties: { ...V2_ENTRY.properties, block: { type: "string" } },
      },
    },
    doubts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...DOUBT_FIELDS],
        properties: {
          entry: { type: "string" },
          field: { type: "string", enum: [...DOUBT_FIELD_NAMES] },
          options: { type: "array", items: { type: "string" } },
          note: nullableString,
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

export const modelBlockSchema = z.object({
  id: text(40),
  kind: z.enum(BLOCK_KINDS),
  title: optionalText(200),
  party: optionalText(200),
  person: optionalText(200),
  date_text: optionalText(100),
  box: modelBoxSchema.nullable(),
});

// Options are bounded loosely so one long doubt does not throw the whole reading away; the
// parser keeps at most three valid ones.
export const modelDoubtSchema = z.object({
  entry: text(40),
  field: z.enum(DOUBT_FIELD_NAMES),
  options: z.array(text(200)).max(8),
  note: optionalText(300),
});

export const modelOutputSchemaV3 = z.object({
  page: z.object({
    date_text: optionalText(100),
    ledger_type: z.enum(LEDGER_TYPES),
    legibility: z.enum(LEGIBILITY),
  }),
  blocks: z.array(modelBlockSchema).max(30),
  entries: z.array(modelEntrySchema.extend({ block: text(40) })).max(200),
  doubts: z.array(modelDoubtSchema).max(60),
  warnings: z.array(text(400)).max(30),
});

export type ModelOutputV3 = z.infer<typeof modelOutputSchemaV3>;
export type ModelBlock = z.infer<typeof modelBlockSchema>;

/**
 * U3, pass 1 of a two-pass reading: the page's layout only, with schema 3's page and block
 * fields and no lines. Each block is then cut from the page and read with schema 3.
 */
export const LAYOUT_SCHEMA_VERSION = "scriba-layout-1";
export const LAYOUT_SCHEMA_NAME = "scriba_ledger_layout_v1";

export const LAYOUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["page", "blocks", "warnings"],
  properties: {
    page: EXTRACTION_JSON_SCHEMA_V3.properties.page,
    blocks: EXTRACTION_JSON_SCHEMA_V3.properties.blocks,
    warnings: EXTRACTION_JSON_SCHEMA_V3.properties.warnings,
  },
} as const;

export const modelLayoutSchema = z.object({
  page: modelOutputSchemaV3.shape.page,
  blocks: modelOutputSchemaV3.shape.blocks,
  warnings: modelOutputSchemaV3.shape.warnings,
});

export type ModelLayout = z.infer<typeof modelLayoutSchema>;
