/**
 * The questions Scriba asks about a page (U2). Pure TypeScript: no Meta, no Supabase, no I/O.
 *
 * Questions come from two places: the structure of the reading (a block's meaning, a line with
 * no kind, goods with no price, a new name that may be an old party, a sum that doesn't come
 * out, no date) and the model's doubts (two or three readings of one value). The engine never
 * computes an answer for him: it proposes what was read, and every option is a valid value for
 * its field. A sum is only shown as code computed it (the validator's expected value).
 *
 * The questions are a function of the review state, so after each answer they are worked out
 * again: an answer that fixes a value makes its question disappear, and one that keeps a value
 * as it is is remembered on the page (see `AnswerRecord`) until that value changes.
 *
 * Order: block by block down the page, as the check screen walks it. In each block, what it is
 * first (it decides the party and the checks), then line by line, then its sums; the page's date
 * last.
 */
import type { NormalizedDoubt } from "@/lib/extraction/parse";
import { type BlockGroup, blockPartyKind, groupByBlock, isUnpricedGoods } from "@/lib/ledger/blocks";
import { type PartyKind, type PartyLink, partyLinkFor } from "@/lib/ledger/parties";
import {
  type AnswerRecord,
  type BlockKind,
  type BlockValues,
  type EntryValues,
  type ReviewableField,
  type TransactionType,
  MARKER_TYPES,
} from "@/lib/ledger/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { parseMoney, parseQuantity, parseRate } from "@/lib/numerals";
import { ackFingerprint } from "@/lib/review/approval";
import { type ReviewRow, toValidationInput } from "@/lib/review/state";
import { FIELD_TO_VALUE_KEY } from "@/lib/review/values";
import { type Finding, accountSign, deriveNumbers, validateLedger } from "@/lib/validation/engine";
import { soundsAlike } from "./similar";
import type { Change, KnownParty, Question, QuestionInput, QuestionOption, QuestionSet, Sentence, SentenceArg } from "./types";

/** FNV-1a over the parts: a short, stable fingerprint of what a question is about. */
export function fingerprint(parts: ReadonlyArray<string | number | null | undefined>): string {
  const s = JSON.stringify(parts);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Poisha as the plain digits the keypad types: 130000 → "1300", 12050 → "120.50". */
export function poishaText(poisha: number): string {
  const taka = Math.floor(poisha / 100);
  const rest = poisha % 100;
  return rest === 0 ? String(taka) : `${taka}.${String(rest).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const CUSTOMER_TYPES: ReadonlySet<TransactionType> = new Set(["credit_sale", "cash_sale", "repayment"]);
const SUPPLIER_TYPES: ReadonlySet<TransactionType> = new Set(["purchase", "credit_purchase", "supplier_payment"]);

/** The kinds a line may be, by where it is written, most likely first. At most four fit a card. */
const DIRECTIONS: Record<BlockKind | "customer_page" | "page", TransactionType[]> = {
  supplier_visit: ["opening_balance", "supplier_payment", "credit_purchase", "closing_balance"],
  supplier_account: ["opening_balance", "supplier_payment", "credit_purchase", "closing_balance"],
  customer_account: ["opening_balance", "credit_sale", "repayment", "closing_balance"],
  customer_page: ["opening_balance", "credit_sale", "repayment", "closing_balance"],
  day_sales: ["cash_sale", "credit_sale", "repayment"],
  expenses: ["expense", "purchase", "supplier_payment"],
  other: ["cash_sale", "credit_sale", "repayment", "expense"],
  page: ["cash_sale", "credit_sale", "repayment", "expense"],
};

/** What else a block may be, when he says it isn't what Scriba read. */
const OTHER_KINDS: Record<BlockKind, BlockKind[]> = {
  supplier_visit: ["supplier_account", "customer_account"],
  supplier_account: ["supplier_visit", "customer_account"],
  customer_account: ["supplier_visit", "supplier_account"],
  other: ["day_sales", "customer_account", "supplier_visit", "expenses"],
  day_sales: [],
  expenses: [],
};

const TYPE_LABEL: Record<TransactionType, MessageKey> = {
  credit_sale: "type.credit_sale",
  cash_sale: "type.cash_sale",
  repayment: "type.repayment",
  purchase: "type.purchase",
  credit_purchase: "type.credit_purchase",
  supplier_payment: "type.supplier_payment",
  expense: "type.expense",
  opening_balance: "type.opening_balance",
  closing_balance: "type.closing_balance",
  subtotal: "type.subtotal",
  adjustment: "type.adjustment",
  unknown: "type.unknown",
};

const KIND_LABEL: Record<BlockKind, MessageKey> = {
  day_sales: "q.kind.day_sales",
  customer_account: "q.kind.customer_account",
  supplier_visit: "q.kind.supplier_visit",
  supplier_account: "q.kind.supplier_account",
  expenses: "q.kind.expenses",
  other: "q.kind.other",
};

/** "you paid {who} {amount}": lines that need a name. */
const SAY_WITH_NAME: Partial<Record<TransactionType, MessageKey>> = {
  supplier_payment: "q.say.supplier_payment",
  credit_purchase: "q.say.credit_purchase",
  credit_sale: "q.say.credit_sale",
  repayment: "q.say.repayment",
};
/** "a cash sale of {amount}": lines that don't. */
const SAY_PLAIN: Partial<Record<TransactionType, MessageKey>> = {
  cash_sale: "q.say.cash_sale",
  purchase: "q.say.purchase",
  expense: "q.say.expense",
};
const SAY_BALANCE: Record<PartyKind, { opening: MessageKey; closing: MessageKey }> = {
  supplier: { opening: "q.say.opening.supplier", closing: "q.say.closing.supplier" },
  customer: { opening: "q.say.opening.customer", closing: "q.say.closing.customer" },
};

const DOUBT_FIELDS = ["customer", "item", "qty", "unit", "rate", "amount", "balance"] as const satisfies readonly ReviewableField[];
type DoubtField = (typeof DOUBT_FIELDS)[number];
type NumberField = "qty" | "rate" | "amount" | "balance";
const NUMBER_FIELDS: ReadonlySet<ReviewableField> = new Set(["qty", "rate", "amount", "balance"]);
const DOUBT_SENTENCE: Record<DoubtField, MessageKey> = {
  customer: "q.doubt.customer",
  item: "q.doubt.item",
  qty: "q.doubt.qty",
  unit: "q.doubt.unit",
  rate: "q.doubt.rate",
  amount: "q.doubt.amount",
  balance: "q.doubt.balance",
};
const FIELD_LABEL: Record<NumberField, MessageKey> = {
  qty: "q.field.qty",
  rate: "q.field.rate",
  amount: "q.field.amount",
  balance: "q.field.balance",
};

/** Whether a written value is a usable number for its field. */
export function readsAsNumber(field: ReviewableField, text: string): boolean {
  if (field === "qty") return parseQuantity(text).ok;
  if (field === "rate") return parseRate(text).ok;
  return parseMoney(text).ok;
}

// ---------------------------------------------------------------------------

type Group = BlockGroup<ReviewRow> & { convention: PartyKind | null };

type Ctx = {
  input: QuestionInput;
  rows: ReviewRow[];
  findings: Finding[];
  answers: Map<string, AnswerRecord>;
  pageTypes: TransactionType[];
  doubts: Map<string, NormalizedDoubt>;
  askedParties: Set<string>;
};

const isOpen = (r: ReviewRow) => r.status === "draft" && !r.values.crossedOut;
const MAX_QUOTE = 60;

/** The line as written, for "“…” — …?" sentences. */
function quote(r: ReviewRow): SentenceArg {
  const text = (r.values.sourceText.trim() || [r.values.item, r.values.quantityText, r.values.unit].filter(Boolean).join(" ")).replace(/\s+/g, " ");
  return { text: text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE - 1)}…` : text };
}

function amountArg(values: EntryValues): SentenceArg | null {
  const n = deriveNumbers(values).amount;
  if (n?.ok) return { money: n.value };
  return values.amountText?.trim() ? { text: values.amountText.trim() } : null;
}

function valueArg(field: ReviewableField, text: string): SentenceArg {
  if (field === "amount" || field === "balance" || field === "rate") {
    const n = field === "rate" ? parseRate(text) : parseMoney(text);
    if (n.ok) return { money: n.value };
  }
  return { text };
}

/** Who a block is about: "Selim (Praan)", or the party, or the person. */
function whoOf(block: BlockValues | null): SentenceArg | null {
  const party = block?.party?.trim();
  const person = block?.person?.trim();
  if (party && person) return { say: { key: "q.who.rep", args: [{ text: person }, { text: party }] } };
  if (party) return { text: party };
  if (person) return { text: person };
  return null;
}

/** "you paid Selim (Praan) ৳1,500": what a line says, if it were of this kind. */
function sayAs(type: TransactionType, row: ReviewRow, g: Group): Sentence {
  const amount = amountArg(row.values);
  const name = (g.block && blockPartyKind(g.block.kind) ? whoOf(g.block) : null) ?? (row.values.customer?.trim() ? { text: row.values.customer.trim() } : null);
  const side = g.convention ?? (SUPPLIER_TYPES.has(type) ? "supplier" : CUSTOMER_TYPES.has(type) ? "customer" : null);
  if (amount) {
    if ((type === "opening_balance" || type === "closing_balance") && name && side) {
      return { key: SAY_BALANCE[side][type === "opening_balance" ? "opening" : "closing"], args: [name, amount] };
    }
    const withName = SAY_WITH_NAME[type];
    if (withName && name) return { key: withName, args: [name, amount] };
    const plain = SAY_PLAIN[type];
    if (plain) return { key: plain, args: [{ text: "" }, amount] };
  }
  return { key: TYPE_LABEL[type] };
}

function question(q: Omit<Question, "entries" | "input" | "proposed"> & Partial<Pick<Question, "entries" | "input" | "proposed">>): Question {
  return { entries: q.entry ? [q.entry] : [], input: null, proposed: null, ...q };
}

const later: QuestionOption = { id: "later", label: { key: "q.later" }, changes: [], later: true };

// ---------------------------------------------------------------------------
// Block questions
// ---------------------------------------------------------------------------

function meaningQuestion(block: BlockValues, rows: ReviewRow[]): Question | null {
  if (block.kind === "day_sales" || block.kind === "expenses") return null;
  const party = block.party?.trim() || null;
  const person = block.person?.trim() || null;
  const kindOption = (kind: BlockKind): QuestionOption => ({
    id: `kind:${kind}`,
    label: { key: KIND_LABEL[kind] },
    changes: [{ op: "block", block: block.id, values: { kind } }],
  });
  const others = OTHER_KINDS[block.kind].map(kindOption);
  const base = {
    id: `meaning:${block.id}`,
    kind: "meaning" as const,
    // The kind alone: naming the party (or matching it to an old one) doesn't undo "that's right".
    fp: fingerprint([block.kind]),
    block: block.id,
    entry: null,
    field: null,
    entries: rows.map((r) => r.id),
    input: blockPartyKind(block.kind) ? { kind: "text" as const, target: { to: "party" as const, block: block.id } } : null,
  };
  if (block.kind === "other") return question({ ...base, sentence: { key: "q.meaning.other" }, options: others });
  if (!party) return question({ ...base, sentence: { key: "q.meaning.who" }, options: others });

  let sentence: Sentence;
  if (block.kind === "supplier_visit") {
    sentence = person ? { key: "q.meaning.visit.rep", args: [{ text: person }, { text: party }] } : { key: "q.meaning.visit", args: [{ text: party }] };
  } else {
    sentence = { key: block.kind === "supplier_account" ? "q.meaning.supplier" : "q.meaning.customer", args: [{ text: party }] };
  }
  return question({ ...base, sentence, options: [{ id: "yes", label: { key: "q.yes" }, changes: [] }, ...others], proposed: "yes" });
}

/** "Praan" may be প্রাণ, already in the book. Asked once per new name on the page. */
function samePartyQuestion(
  ctx: Ctx,
  link: PartyLink,
  written: string,
  subject: { block: string | null; rows: ReviewRow[] },
): Question | null {
  const asked = `${link.kind}|${link.key}`;
  if (ctx.askedParties.has(asked)) return null;
  ctx.askedParties.add(asked);
  const known = ctx.input.parties.filter((p) => p.kind === link.kind);
  if (known.some((p) => p.key === link.key)) return null;
  const alike = known.filter((p) => soundsAlike(written, p.name)).slice(0, 3);
  if (alike.length === 0) return null;

  const rename = (p: KnownParty): Change[] =>
    subject.block
      ? [{ op: "block", block: subject.block, values: { party: p.name } }]
      : subject.rows.map((r) => ({ op: "edit" as const, entry: r.id, values: { customer: p.name } }));
  const single = alike.length === 1;
  const options: QuestionOption[] = [
    ...alike.map((p) => ({ id: `party:${p.id}`, label: single ? { key: "q.same.yes" as const } : { key: "q.value" as const, args: [{ text: p.name }] }, changes: rename(p) })),
    { id: "no", label: { key: "q.same.no" }, changes: [] },
  ];
  return question({
    id: subject.block ? `party:${subject.block}` : `party:${link.kind}:${link.key}`,
    kind: "same_party",
    fp: fingerprint([link.key, ...alike.map((p) => p.id)]),
    block: subject.block,
    entry: subject.block ? null : (subject.rows[0]?.id ?? null),
    field: subject.block ? null : "customer",
    entries: subject.rows.map((r) => r.id),
    sentence: single ? { key: "q.same", args: [{ text: written }, { text: alike[0]!.name }] } : { key: "q.same.which", args: [{ text: written }] },
    options,
  });
}

/** Seven sales with no kind written are one question, not seven. */
function blockKindQuestion(ctx: Ctx, block: BlockValues, rows: ReviewRow[]): Question | null {
  if (block.kind !== "day_sales" && block.kind !== "expenses") return null;
  const unknown = rows.filter((r) => r.values.type === "unknown");
  const id = `kind:${block.id}`;
  if (unknown.length < 2 || ctx.answers.get(id)?.a === "each") return null;
  const setAll = (type: TransactionType): Change[] => unknown.map((r) => ({ op: "edit", entry: r.id, values: { type } }));
  const each: QuestionOption = { id: "each", label: { key: block.kind === "day_sales" ? "q.sales.each" : "q.each" }, changes: [] };
  const base = { id, kind: "block_kind" as const, fp: fingerprint(unknown.map((r) => r.id)), block: block.id, entry: null, field: "type" as const, entries: unknown.map((r) => r.id) };
  if (block.kind === "expenses") {
    return question({
      ...base,
      sentence: { key: "q.expenses", args: [{ count: unknown.length }] },
      options: [{ id: "yes", label: { key: "q.expenses.yes" }, changes: setAll("expense") }, each],
      proposed: "yes",
    });
  }
  // A credit sale needs the customer's name, or the due would belong to nobody.
  const credit: QuestionOption[] = unknown.every((r) => r.values.customer?.trim())
    ? [{ id: "credit", label: { key: "q.sales.credit" }, changes: setAll("credit_sale") }]
    : [];
  return question({
    ...base,
    sentence: { key: "q.sales", args: [{ count: unknown.length }] },
    options: [{ id: "cash", label: { key: "q.sales.cash" }, changes: setAll("cash_sale") }, ...credit, each],
    proposed: "cash",
  });
}

/** Several goods from one company with no price: one total for the delivery, or each priced. */
function deliveryQuestion(ctx: Ctx, g: Group, rows: ReviewRow[]): Question | null {
  if (!g.block || g.convention !== "supplier") return null;
  const goods = rows.filter((r) => isUnpricedGoods(r.values) && (r.values.type === "credit_purchase" || r.values.type === "purchase"));
  if (goods.length < 2 || new Set(goods.map((r) => r.values.type)).size !== 1) return null;
  const id = `delivery:${g.block.id}`;
  if (ctx.answers.get(id)?.a === "each") return null;
  const who = whoOf(g.block) ?? { text: g.block.title ?? "" };
  return question({
    id,
    kind: "delivery",
    fp: fingerprint(goods.map((r) => r.id)),
    block: g.block.id,
    entry: null,
    field: "amount",
    entries: goods.map((r) => r.id),
    sentence: { key: "q.delivery", args: [who, { count: goods.length }] },
    options: [{ id: "each", label: { key: "q.delivery.each" }, changes: [] }, later],
    input: {
      kind: "money",
      target: { to: "delivery", block: g.block.id, entries: goods.map((r) => r.id), after: goods[goods.length - 1]!.id, type: goods[0]!.values.type },
    },
  });
}

/** An account with no "due before": ask for it, so the due now can be worked out. */
function openingQuestion(ctx: Ctx, g: Group, rows: ReviewRow[]): Question | null {
  if (!g.convention || rows.some((r) => r.values.type === "unknown")) return null;
  const f = ctx.findings.find((x) => x.ruleId === "balance_equation" && x.reason === "no_opening" && x.block === g.block?.id);
  if (!f) return null;
  const who = whoOf(g.block) ?? (ctx.input.page.accountName?.trim() ? { text: ctx.input.page.accountName.trim() } : null);
  if (!who) return null;
  // The new line goes just above the block's first line.
  const first = g.entries[0];
  const index = first ? ctx.rows.findIndex((r) => r.id === first.id) : -1;
  const after = index > 0 ? ctx.rows[index - 1]!.id : null;
  const blockId = g.block?.id ?? null;
  const opening = (amountText: string): Change[] => [
    { op: "add", after, values: { ...openingValues(blockId), amountText } },
  ];
  return question({
    id: `opening:${blockId ?? "page"}`,
    kind: "opening",
    fp: fingerprint([f.key]),
    block: blockId,
    entry: null,
    field: null,
    entries: rows.map((r) => r.id),
    sentence: { key: g.convention === "supplier" ? "q.opening.supplier" : "q.opening.customer", args: [who] },
    options: [{ id: "none", label: { key: "q.opening.none" }, changes: opening("0") }, later],
    input: { kind: "money", target: { to: "opening", block: blockId, after } },
  });
}

/** An opening line added by an answer: no writing of its own, clearly the reviewer's. */
export function openingValues(block: string | null): EntryValues {
  return {
    sourceText: "",
    type: "opening_balance",
    customer: null,
    item: null,
    quantityText: null,
    unit: null,
    rateText: null,
    amountText: null,
    balanceText: null,
    crossedOut: false,
    ...(block ? { block } : {}),
  };
}

const OFF_RULES: ReadonlySet<string> = new Set(["balance_equation", "running_balance", "written_total", "qty_x_rate"]);

/** A sum that doesn't come out: use what code worked out, keep what is written, or look again. */
function unbalancedQuestion(ctx: Ctx, f: Finding): Question | null {
  const byId = new Map(ctx.rows.map((r) => [r.id, r]));
  const rows = f.entryIds.map((id) => byId.get(id)).filter((r): r is ReviewRow => r != null);
  if (!rows.some(isOpen) || f.expected == null || f.observed == null) return null;

  let target: { row: ReviewRow | undefined; field: "amount" | "balance" };
  if (f.ruleId === "qty_x_rate") target = { row: rows[0], field: "amount" };
  else if (f.ruleId === "written_total") target = { row: rows.find((r) => r.values.type === "subtotal"), field: "amount" };
  else if (f.ruleId === "balance_equation") target = { row: rows.findLast((r) => r.values.type === "closing_balance"), field: "amount" };
  else target = { row: rows[rows.length - 1], field: "balance" };

  const options: QuestionOption[] = [];
  if (target.row && isOpen(target.row) && f.expected >= 0) {
    options.push({
      id: "use",
      label: { key: "q.off.use", args: [{ money: f.expected }] },
      value: poishaText(f.expected),
      changes: [{ op: "edit", entry: target.row.id, values: { [FIELD_TO_VALUE_KEY[target.field]]: poishaText(f.expected) } }],
    });
  }
  options.push({ id: "keep", label: { key: "q.off.keep" }, changes: [], accepts: [ackFingerprint(f)] });
  options.push({ id: "look", label: { key: "q.off.look" }, changes: [], local: true });

  const key: MessageKey = f.ruleId === "qty_x_rate" ? "q.off.qty" : f.ruleId === "written_total" ? "q.off.total" : "q.off.balance";
  return question({
    id: `off:${f.key}`,
    kind: "unbalanced",
    fp: ackFingerprint(f),
    block: f.block ?? null,
    entry: target.row?.id ?? null,
    field: target.row ? target.field : null,
    entries: rows.map((r) => r.id),
    sentence: { key, args: [{ money: f.expected }, { money: f.observed }] },
    options,
  });
}

// ---------------------------------------------------------------------------
// Line questions
// ---------------------------------------------------------------------------

function directionQuestion(ctx: Ctx, row: ReviewRow, g: Group, blockAsked: boolean): Question | null {
  const type = row.values.type;
  const opposite = g.convention != null && type !== "unknown" && accountSign(g.convention, type) == null && !MARKER_TYPES.has(type) && type !== "adjustment";
  const unsure = row.reviewFields.includes("type");
  if (type === "unknown" ? blockAsked : !unsure && !opposite) return null;

  const doubt = ctx.doubts.get(`${row.id}|type`);
  const where = g.block ? g.block.kind : g.convention === "customer" ? "customer_page" : "page";
  const types = [...new Set([...(type !== "unknown" ? [type] : []), ...((doubt?.options ?? []) as TransactionType[]), ...DIRECTIONS[where]])]
    .filter((t) => t !== "unknown")
    .slice(0, 4);
  const options: QuestionOption[] = types.map((t) => ({
    id: `type:${t}`,
    label: { key: TYPE_LABEL[t] },
    value: t,
    changes: t === type ? [{ op: "edit", entry: row.id, checked: ["type"] }] : [{ op: "edit", entry: row.id, values: { type: t } }],
  }));
  const proposed = type !== "unknown" && !opposite ? `type:${type}` : null;
  return question({
    id: `direction:${row.id}`,
    kind: "direction",
    fp: fingerprint([type, row.values.amountText, g.block?.kind ?? null]),
    block: g.block?.id ?? null,
    entry: row.id,
    field: "type",
    sentence: proposed ? { key: "q.direction.check", args: [quote(row), { say: sayAs(type, row, g) }] } : { key: "q.direction", args: [quote(row)] },
    options,
    proposed,
  });
}

/** A value the model doubted (with its readings), or one that doesn't read as a number. */
function doubtQuestions(ctx: Ctx, row: ReviewRow, g: Group): Question[] {
  const out: Question[] = [];
  for (const field of DOUBT_FIELDS) {
    const key = FIELD_TO_VALUE_KEY[field];
    const current = (row.values[key] as string | null)?.trim() || null;
    const numeric = NUMBER_FIELDS.has(field);
    const format = ctx.findings.find((f) => f.ruleId === "numeral_format" && f.key === `numeral_format:${row.id}:${field}`);
    if (!row.reviewFields.includes(field) && !format) continue;

    const unreadable = numeric && current != null && !readsAsNumber(field, current);
    const mixed = format != null && !unreadable;
    const doubt = ctx.doubts.get(`${row.id}|${field}`);
    const readings = [...new Set([...(current && !unreadable ? [current] : []), ...(doubt?.options ?? [])])].filter((v) => !numeric || readsAsNumber(field, v));
    const options: QuestionOption[] = readings.map((v, i) => ({
      id: `value:${i}`,
      label: { key: "q.value", args: [valueArg(field, v)] },
      value: v,
      changes: v === current ? [{ op: "edit", entry: row.id, checked: [field] }] : [{ op: "edit", entry: row.id, values: { [key]: v } }],
      ...(v === current && mixed ? { accepts: [ackFingerprint(format)] } : {}),
    }));

    let sentence: Sentence;
    if (unreadable || readings.length === 0) {
      sentence = numeric
        ? { key: "q.unreadable", args: [quote(row), { say: { key: FIELD_LABEL[field as NumberField] } }] }
        : { key: DOUBT_SENTENCE[field], args: [quote(row)] };
    } else if (mixed) {
      sentence = { key: "q.mixed", args: [quote(row), { say: { key: FIELD_LABEL[field as NumberField] } }, { text: current! }] };
    } else if (readings.length === 1) {
      sentence = { key: "q.check", args: [quote(row), valueArg(field, current!)] };
    } else {
      sentence = { key: DOUBT_SENTENCE[field], args: [quote(row)] };
    }
    // One reading is a "right?" card; two or three are a choice he makes looking at the writing.
    const proposed = options.length === 1 || (mixed && options.length > 0) ? "value:0" : null;
    out.push(
      question({
        id: `doubt:${row.id}:${field}`,
        kind: "doubt",
        fp: fingerprint([field, current, ...readings]),
        block: g.block?.id ?? null,
        entry: row.id,
        field,
        sentence,
        options,
        proposed,
        input: { kind: field === "qty" ? "quantity" : numeric ? "money" : "text", target: { to: "entry", entry: row.id, field } },
      }),
    );
  }
  return out;
}

function priceQuestion(row: ReviewRow, g: Group): Question | null {
  if (!isUnpricedGoods(row.values) || row.values.type === "unknown") return null;
  return question({
    id: `price:${row.id}`,
    kind: "price",
    fp: fingerprint([row.values.item, row.values.quantityText, row.values.unit]),
    block: g.block?.id ?? null,
    entry: row.id,
    field: "amount",
    sentence: { key: "q.price", args: [quote(row)] },
    options: [later],
    input: { kind: "money", target: { to: "entry", entry: row.id, field: "amount" } },
  });
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** A day as the page would have it written, day first: "1/11/2026". `parseWrittenDate` reads it. */
export function writtenDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

function dateQuestion(ctx: Ctx): Question | null {
  const page = ctx.input.page;
  if (!ctx.rows.some(isOpen)) return null;
  if (page.dateText?.trim() || (page.blocks ?? []).some((b) => b.dateText?.trim())) return null;
  const day = ctx.input.capturedOn;
  const options: QuestionOption[] = day
    ? [
        // The photo's day is already the page's day when none is written; saying so changes nothing.
        { id: "photo", label: { key: "q.date.photo", args: [{ day }] }, changes: [] },
        { id: "before", label: { key: "q.date.before", args: [{ day: previousDay(day) }] }, changes: [{ op: "date", dateText: writtenDay(previousDay(day)) }] },
      ]
    : [];
  return question({
    id: "date",
    kind: "date",
    fp: fingerprint([page.dateText ?? null]),
    block: null,
    entry: null,
    field: null,
    sentence: { key: "q.date" },
    options,
    proposed: day ? "photo" : null,
    input: { kind: "date", target: { to: "date" } },
  });
}

// ---------------------------------------------------------------------------

function conventionOf(block: BlockValues | null, inBlocks: boolean, ledgerType: string): PartyKind | null {
  if (block) return blockPartyKind(block.kind);
  return !inBlocks && ledgerType === "customer_credit" ? "customer" : null;
}

/** Every question Scriba has about the page now, in the order to ask them. */
export function buildQuestions(input: QuestionInput): QuestionSet {
  const rows = [...input.rows].sort((a, b) => a.lineOrder - b.lineOrder);
  const page = input.page;
  const findings = validateLedger(toValidationInput({ page: { values: page, version: 0, reviewStartedAt: null }, rows }));
  const byCandidate = new Map(rows.filter((r) => r.candidate).map((r) => [r.candidate!.candidateId, r.id]));
  const doubts = new Map<string, NormalizedDoubt>();
  for (const d of input.doubts) {
    const rowId = byCandidate.get(d.entryId);
    if (rowId) doubts.set(`${rowId}|${d.field}`, d);
  }
  const ctx: Ctx = {
    input,
    rows,
    findings,
    answers: new Map((page.answers ?? []).map((a) => [a.q, a])),
    pageTypes: rows.filter((r) => r.status !== "rejected").map((r) => r.values.type),
    doubts,
    askedParties: new Set(),
  };

  const questions: Question[] = [];
  const laterList: Question[] = [];
  const add = (q: Question | null) => {
    if (!q) return;
    const answered = ctx.answers.get(q.id);
    if (answered && answered.fp === q.fp) {
      if (q.options.find((o) => o.id === answered.a)?.later) laterList.push(q);
      return;
    }
    questions.push(q);
  };

  const inBlocks = (page.blocks ?? []).length > 0;
  const live = rows.filter((r) => r.status !== "rejected");
  const groupOfRow = new Map<string, string | null>();
  const groups: Group[] = groupByBlock(page, live).map((g) => {
    for (const r of g.entries) groupOfRow.set(r.id, g.block?.id ?? null);
    return { ...g, convention: conventionOf(g.block, inBlocks, page.ledgerType) };
  });

  for (const g of groups) {
    const open = g.entries.filter(isOpen);
    if (open.length === 0) continue;
    const block = g.block;
    const blockParty = block ? blockPartyKind(block.kind) : null;

    if (block) {
      add(meaningQuestion(block, open));
      const party = block.party?.trim();
      if (blockParty && party) {
        const link = partyLinkFor({ ...open[0]!.values, type: "opening_balance" }, page, ctx.pageTypes);
        if (link) add(samePartyQuestion(ctx, link, party, { block: block.id, rows: open }));
      }
    }
    const kindQuestion = block ? blockKindQuestion(ctx, block, open) : null;
    add(kindQuestion);
    const delivery = deliveryQuestion(ctx, g, open);
    const priced = new Set(delivery?.entries ?? []);

    for (const row of open) {
      add(directionQuestion(ctx, row, g, kindQuestion != null));
      for (const q of doubtQuestions(ctx, row, g)) add(q);
      if (!blockParty) {
        const link = partyLinkFor(row.values, page, ctx.pageTypes);
        const written = row.values.customer?.trim() || page.accountName?.trim();
        if (link && written) {
          const named = open.filter((r) => partyLinkFor(r.values, page, ctx.pageTypes)?.key === link.key);
          add(samePartyQuestion(ctx, link, written, { block: null, rows: named }));
        }
      }
      if (!priced.has(row.id)) add(priceQuestion(row, g));
    }

    add(delivery);
    add(openingQuestion(ctx, g, open));
    const groupId = block?.id ?? null;
    for (const f of findings) {
      if (f.status !== "fail" || !OFF_RULES.has(f.ruleId)) continue;
      const home = f.block ?? groupOfRow.get(f.entryIds[0] ?? "") ?? null;
      if (home === groupId) add(unbalancedQuestion(ctx, f));
    }
  }
  add(dateQuestion(ctx));
  return { questions, later: laterList };
}
