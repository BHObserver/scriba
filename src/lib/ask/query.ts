/**
 * Ask Scriba (P2): the shapes a question can take.
 *
 * The model only picks a shape and its filters: which intent, whose account, which item, which
 * period. Code runs the shape on the insights engine (`answer.ts`). The shape holds no amount,
 * and names can only be picked from the shop's own list, so the model can't put a number or a
 * stranger in front of the shopkeeper.
 */
import { z } from "zod";
import { type Book, rootPartyId } from "@/lib/insights/book";
import type { InsightParty, RecordType } from "@/lib/insights/types";
import { PARTY_KINDS, type PartyKind, normalizePartyName } from "@/lib/ledger/parties";

export const ASK_INTENTS = ["party_due", "total_dues", "risky_dues", "sales", "money_out", "compare", "drawer_cash", "unknown"] as const;
export type AskIntent = (typeof ASK_INTENTS)[number];

export const PERIOD_KEYS = ["today", "yesterday", "last_7_days", "previous_7_days", "this_month", "last_month", "last_n_days", "on_date", "all_time"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
/** A comparison's second period needs no numbers of its own; null means "the same length just before". */
export const COMPARE_KEYS = ["today", "yesterday", "last_7_days", "previous_7_days", "this_month", "last_month"] as const;
export type CompareKey = (typeof COMPARE_KEYS)[number];

export const SALES_KINDS = ["all", "cash", "credit"] as const;
export type SalesKind = (typeof SALES_KINDS)[number];
export const OUT_KINDS = ["all", "purchase", "supplier_payment", "expense"] as const;
export type OutKind = (typeof OUT_KINDS)[number];
export const MEASURES = ["sales", "money_out"] as const;
export type Measure = (typeof MEASURES)[number];

/** Longest name or item the model may echo back. */
const MAX_SAID = 60;

export const askQuerySchema = z.object({
  intent: z.enum(ASK_INTENTS),
  /** A name from the shop's list, or null. */
  party: z.string().max(200).nullable(),
  /** The name as the question said it, when there was one. */
  name_said: z.string().max(200).nullable(),
  party_kind: z.enum(PARTY_KINDS),
  /** An item from the shop's list, or null. */
  item: z.string().max(200).nullable(),
  item_said: z.string().max(200).nullable(),
  period: z.enum(PERIOD_KEYS),
  /** last_n_days only. */
  days: z.number().int().nullable(),
  /** on_date only: day of the month, and the month (1–12) if the question named one. */
  day: z.number().int().nullable(),
  month: z.number().int().nullable(),
  compare_to: z.enum(COMPARE_KEYS).nullable(),
  sales_kind: z.enum(SALES_KINDS),
  out_kind: z.enum(OUT_KINDS),
  measure: z.enum(MEASURES),
});
export type AskQuery = z.infer<typeof askQuerySchema>;

/** A shape with every filter at its default, for suggestions and tests. */
export function askQuery(fields: Partial<AskQuery> & Pick<AskQuery, "intent">): AskQuery {
  return {
    party: null,
    name_said: null,
    party_kind: "customer",
    item: null,
    item_said: null,
    period: "today",
    days: null,
    day: null,
    month: null,
    compare_to: null,
    sales_kind: "all",
    out_kind: "all",
    measure: "sales",
    ...fields,
  };
}

// ---------------------------------------------------------------------------
// The shop's own words: names and items the model may pick from
// ---------------------------------------------------------------------------

export type AskVocabulary = { customers: string[]; suppliers: string[]; items: string[] };

export const VOCABULARY_LIMITS = { parties: 200, items: 150 } as const;

/** Lines whose item is goods or a cost; a payment's "item" is only words like জমা. */
const ITEM_TYPES: ReadonlySet<RecordType> = new Set(["cash_sale", "credit_sale", "purchase", "credit_purchase", "expense"]);

const tidy = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");
export const itemKey = (name: string) => tidy(name).toLowerCase();

/**
 * Names of the parties with confirmed lines (most recently active first) and the items written
 * on confirmed sale, purchase and cost lines (most lines first, in the spelling used most). Only names and items go to
 * the model, never an amount.
 */
export function askVocabulary(book: Book, limits: { parties: number; items: number } = VOCABULARY_LIMITS): AskVocabulary {
  const lastSeen = new Map<string, string>();
  const items = new Map<string, { lines: number; spellings: Map<string, number> }>();
  for (const r of book.records) {
    if (r.partyId) lastSeen.set(r.partyId, r.businessDate);
    const name = r.itemName && ITEM_TYPES.has(r.type) ? tidy(r.itemName) : "";
    if (!name) continue;
    const group = items.get(itemKey(name)) ?? { lines: 0, spellings: new Map<string, number>() };
    group.lines++;
    group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
    items.set(itemKey(name), group);
  }
  const names = (kind: PartyKind) => {
    const ids = [...lastSeen].filter(([id]) => book.parties.get(id)?.kind === kind).sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
    return [...new Set(ids.map(([id]) => tidy(book.parties.get(id)!.displayName)))].slice(0, limits.parties);
  };
  const itemNames = [...items.values()]
    .sort((a, b) => b.lines - a.lines)
    .map((g) => [...g.spellings].reduce((best, s) => (s[1] > best[1] ? s : best))[0])
    .slice(0, limits.items);
  return { customers: names("customer"), suppliers: names("supplier"), items: itemNames };
}

/** A strict-mode slot that can only hold one of `values`, or null. */
function pickOne(values: readonly string[]) {
  return values.length > 0 ? { anyOf: [{ type: "string", enum: [...values] }, { type: "null" }] } : { type: "null" };
}

const nullableString = { type: ["string", "null"] } as const;
const nullableInteger = { type: ["integer", "null"] } as const;

/** The JSON Schema the model answers in, with this shop's names and items as the only choices. */
export function askJsonSchema(vocabulary: AskVocabulary) {
  const parties = [...new Set([...vocabulary.customers, ...vocabulary.suppliers])];
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(askQuerySchema.shape),
    properties: {
      intent: { type: "string", enum: [...ASK_INTENTS] },
      party: pickOne(parties),
      name_said: nullableString,
      party_kind: { type: "string", enum: [...PARTY_KINDS] },
      item: pickOne(vocabulary.items),
      item_said: nullableString,
      period: { type: "string", enum: [...PERIOD_KEYS] },
      days: nullableInteger,
      day: nullableInteger,
      month: nullableInteger,
      compare_to: { anyOf: [{ type: "string", enum: [...COMPARE_KEYS] }, { type: "null" }] },
      sales_kind: { type: "string", enum: [...SALES_KINDS] },
      out_kind: { type: "string", enum: [...OUT_KINDS] },
      measure: { type: "string", enum: [...MEASURES] },
    },
  };
}

const short = (s: string | null) => (s && tidy(s) ? tidy(s).slice(0, MAX_SAID) : null);

/**
 * A shape from untrusted input (the model's output, or a suggestion sent back by the browser):
 * names and items outside the shop's list are dropped, echoed words are cut short.
 */
export function toAskQuery(raw: unknown, vocabulary: AskVocabulary): AskQuery | null {
  const parsed = askQuerySchema.safeParse(raw);
  if (!parsed.success) return null;
  const q = parsed.data;
  const party = q.party && (vocabulary.customers.includes(tidy(q.party)) || vocabulary.suppliers.includes(tidy(q.party))) ? tidy(q.party) : null;
  const item = q.item && vocabulary.items.some((i) => itemKey(i) === itemKey(q.item!)) ? tidy(q.item) : null;
  return { ...q, party, item, name_said: short(q.name_said), item_said: short(q.item_said) };
}

/** The model's reply text as a shape, or null when it isn't one. */
export function parseAskOutput(text: string | null, vocabulary: AskVocabulary): AskQuery | null {
  if (!text) return null;
  try {
    return toAskQuery(JSON.parse(text), vocabulary);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Finding the party a question means
// ---------------------------------------------------------------------------

/**
 * Case endings a spoken name may carry (করিমের, করিমকে, রিনার, ভাইয়ের, আপার), longest first.
 * NFC like the name keys, which splits য় into য + nukta. Tried only after the whole word.
 */
const ENDINGS = ["য়েরকে", "েরকে", "য়ের", "ের", "এর", "কে", "রে", "র"].map((e) => e.normalize("NFC"));

function keyVariants(name: string): string[] {
  const key = normalizePartyName(name);
  if (!key) return [];
  const tokens = key.split(" ");
  const last = tokens[tokens.length - 1]!;
  // Normalized again, so a title the ending hid (আপার → আপা) is dropped like any other.
  const stems = ENDINGS.filter((e) => last.length > e.length + 1 && last.endsWith(e)).map((e) =>
    normalizePartyName([...tokens.slice(0, -1), last.slice(0, -e.length)].join(" ")),
  );
  return [...new Set([key, ...stems.filter((s): s is string => s !== null)])];
}

/** Parties (after merges) a name could mean: exact name first, then a name that contains its words. */
export function partiesNamed(book: Book, name: string, kind: PartyKind | null): InsightParty[] {
  const roots = (match: (key: string) => boolean) => {
    const ids = new Set<string>();
    for (const p of book.parties.values()) {
      const key = normalizePartyName(p.displayName);
      if (key && match(key)) ids.add(rootPartyId(book.parties, p.id));
    }
    return [...ids].map((id) => book.parties.get(id)!);
  };
  for (const variant of keyVariants(name)) {
    const words = variant.split(" ");
    for (const found of [roots((key) => key === variant), roots((key) => words.every((w) => key.split(" ").includes(w)))]) {
      if (found.length === 0) continue;
      const ofKind = kind ? found.filter((p) => p.kind === kind) : found;
      return ofKind.length > 0 ? ofKind : found;
    }
  }
  return [];
}
