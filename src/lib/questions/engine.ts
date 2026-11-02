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
 * first (it decides the party and the checks) and whether it is all one part (T2), then line by
 * line, then its sums; the page's date last.
 *
 * U4: a company memo photographed with the page proposes the prices of the visit's goods. Code
 * links the memo to its visit by name (or asks), pairs its lines with the handwritten goods, and
 * checks its sums; a price is proposed only from a memo line that is sure, read with confidence
 * and consistent with the memo's own total. He still confirms each one.
 */
import type { NormalizedDoubt } from "@/lib/extraction/parse";
import { type BlockGroup, blockPartyKind, groupByBlock, isUnpricedGoods } from "@/lib/ledger/blocks";
import { type PartyKind, type PartyLink, partyLinkFor } from "@/lib/ledger/parties";
import {
  type AnswerRecord,
  type BlockKind,
  type BlockValues,
  type EntryValues,
  type PageValues,
  type ReviewableField,
  type TransactionType,
  MARKER_TYPES,
} from "@/lib/ledger/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { type MemoForPage, blocksNamedOnMemo, pairLines } from "@/lib/memo/match";
import type { MemoLine } from "@/lib/memo/parse";
import { formatTaka, parseMoney, parseQuantity, parseRate } from "@/lib/numerals";
import { ackFingerprint } from "@/lib/review/approval";
import { type ReviewRow, toValidationInput } from "@/lib/review/state";
import { EMPTY_ENTRY, FIELD_TO_VALUE_KEY, MAX_BLOCKS } from "@/lib/review/values";
import { type Finding, accountSign, deriveNumbers, validateLedger } from "@/lib/validation/engine";
import { soundsAlike } from "./similar";
import type { Change, KnownParty, MemoRef, Question, QuestionInput, QuestionOption, QuestionSet, Sentence, SentenceArg, SplitValues, Why } from "./types";

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
/** "Yes, the same company" / "No, a new customer", and the khata's last due for "why". */
const SAME_PARTY: Record<PartyKind, { yes: MessageKey; no: MessageKey; due: MessageKey; match: MessageKey }> = {
  supplier: { yes: "q.same.yes.supplier", no: "q.same.no.supplier", due: "q.same.due.supplier", match: "q.same.match.supplier" },
  customer: { yes: "q.same.yes.customer", no: "q.same.no.customer", due: "q.same.due.customer", match: "q.same.match.customer" },
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
  /** U4: the memo linked to each visit block. */
  memos: Map<string, BlockMemo>;
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

function question(q: Omit<Question, "entries" | "input" | "proposed" | "why"> & Partial<Pick<Question, "entries" | "input" | "proposed" | "why">>): Question {
  return { entries: q.entry ? [q.entry] : [], input: null, proposed: null, why: null, ...q };
}

const later: QuestionOption = { id: "later", label: { key: "q.later" }, changes: [], later: true };
/** "Later" for a price: he'll give it once he has the memo. */
const priceLater: QuestionOption = { ...later, label: { key: "q.price.later" } };
const PRICE_WHY: Why = { sentence: { key: "q.price.why" }, verified: false };

const amountOf = (r: ReviewRow): number | null => {
  const n = deriveNumbers(r.values).amount;
  return n?.ok ? n.value : null;
};

const quantityOf = (r: ReviewRow): number | null => {
  const n = deriveNumbers(r.values).quantity;
  return n?.ok ? n.value : null;
};

const MAX_TEXT = 200;
const MAX_SOURCE = 600;

/**
 * A delivery priced as one total: one line for it, carrying every item as written, and the
 * unpriced lines it replaces rejected (kept in the audit trail), so nothing is counted twice or
 * left at zero.
 */
export function deliveryChanges(goods: readonly ReviewRow[], target: { block: string; after: string; type: TransactionType }, amountText: string): Change[] {
  const sourceText = goods.map((r) => r.values.sourceText.trim()).filter(Boolean).join(" + ").slice(0, MAX_SOURCE);
  const item = goods.map((r) => r.values.item?.trim()).filter(Boolean).join(", ").slice(0, MAX_TEXT) || null;
  return [
    { op: "add", after: target.after, values: { ...EMPTY_ENTRY, sourceText, type: target.type, item, amountText, block: target.block } },
    ...goods.map((r) => ({ op: "reject" as const, entry: r.id })),
  ];
}

// ---------------------------------------------------------------------------
// Block questions
// ---------------------------------------------------------------------------

/**
 * "You owed ৳2,800 before, and paid ৳1,500 this time": a visit's due before and payments as
 * read (several payments summed by code). Null when neither reads as a number.
 */
function visitFigures(rows: ReviewRow[]): Sentence | null {
  const opening = rows.find((r) => r.values.type === "opening_balance");
  const before = opening ? amountOf(opening) : null;
  const payments = rows.filter((r) => r.values.type === "supplier_payment").map(amountOf);
  const paid = payments.length > 0 && payments.every((n) => n != null) ? payments.reduce<number>((s, n) => s + n!, 0) : null;
  if (before != null && paid != null) return { key: "q.visit.both", args: [{ money: before }, { money: paid }] };
  if (before != null) return { key: "q.visit.before", args: [{ money: before }] };
  if (paid != null) return { key: "q.visit.paid", args: [{ money: paid }] };
  return null;
}

function meaningQuestion(block: BlockValues, rows: ReviewRow[], memo: BlockMemo | undefined): Question | null {
  if (block.kind === "day_sales" || block.kind === "expenses") return null;
  const party = block.party?.trim() || null;
  const person = block.person?.trim() || null;
  const kindOption = (kind: BlockKind): QuestionOption => ({
    id: `kind:${kind}`,
    label: { key: KIND_LABEL[kind] },
    changes: [{ op: "block", block: block.id, values: { kind } }],
  });
  // "A line is wrong" opens the part's lines, so a figure can be fixed from this card (T1).
  const wrongLine: QuestionOption[] = rows.length > 0 ? [{ id: "line", label: { key: "q.meaning.line" }, changes: [], local: true }] : [];
  const others = [...OTHER_KINDS[block.kind].map(kindOption), ...wrongLine];
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
    const figures = visitFigures(rows);
    const who: SentenceArg[] = person ? [{ text: person }, { text: party }] : [{ text: party }];
    if (figures) sentence = { key: person ? "q.meaning.visit.rep.figures" : "q.meaning.visit.figures", args: [...who, { say: figures }] };
    else sentence = { key: person ? "q.meaning.visit.rep" : "q.meaning.visit", args: who };
  } else {
    sentence = { key: block.kind === "supplier_account" ? "q.meaning.supplier" : "q.meaning.customer", args: [{ text: party }] };
  }
  const why = block.kind === "supplier_visit" && memo ? memoAgreesWhy(memo, rows) : null;
  return question({ ...base, sentence, why, options: [{ id: "yes", label: { key: "q.yes" }, changes: [] }, ...others], proposed: "yes" });
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
  const words = SAME_PARTY[link.kind];
  const options: QuestionOption[] = [
    ...alike.map((p) => ({ id: `party:${p.id}`, label: single ? { key: words.yes } : { key: "q.value" as const, args: [{ text: p.name }] }, changes: rename(p) })),
    { id: "no", label: { key: words.no }, changes: [] },
  ];
  // Why he might say yes: the due the khata last showed, and whether this page's "before" is the same.
  const due = single ? ctx.input.dues?.get(alike[0]!.id) : undefined;
  const opening = subject.rows.find((r) => r.values.type === "opening_balance");
  const match = opening != null && amountOf(opening) === due;
  const why: Why | null = due != null && due > 0 ? { sentence: { key: match ? words.match : words.due, args: [{ money: due }] }, verified: match } : null;
  return question({
    id: subject.block ? `party:${subject.block}` : `party:${link.kind}:${link.key}`,
    kind: "same_party",
    fp: fingerprint([link.key, ...alike.map((p) => p.id)]),
    block: subject.block,
    entry: subject.block ? null : (subject.rows[0]?.id ?? null),
    field: subject.block ? null : "customer",
    entries: subject.rows.map((r) => r.id),
    sentence: single ? { key: "q.same", args: [{ text: written }, { text: alike[0]!.name }] } : { key: "q.same.which", args: [{ text: written }] },
    why,
    options,
  });
}

/** The book's parties whose last due would explain a "same party?" question: one per question with a single match. */
export function partiesToExplain(set: QuestionSet): string[] {
  return set.questions.flatMap((q) => {
    const matches = q.kind === "same_party" ? q.options.filter((o) => o.id.startsWith("party:")) : [];
    return matches.length === 1 ? [matches[0]!.id.slice("party:".length)] : [];
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
    why: { sentence: { key: "q.sales.why" }, verified: false },
    options: [{ id: "cash", label: { key: "q.sales.cash" }, changes: setAll("cash_sale") }, ...credit, each],
    proposed: "cash",
  });
}

/**
 * Several goods from one company with no price: one total for the delivery, or each priced. With
 * the company's memo pricing every one of them, the memo's prices are proposed instead.
 */
function deliveryQuestion(ctx: Ctx, g: Group, rows: ReviewRow[]): Question | null {
  if (!g.block || g.convention !== "supplier") return null;
  const goods = rows.filter((r) => isUnpricedGoods(r.values) && (r.values.type === "credit_purchase" || r.values.type === "purchase"));
  if (goods.length < 2 || new Set(goods.map((r) => r.values.type)).size !== 1) return null;
  const id = `delivery:${g.block.id}`;
  if (ctx.answers.get(id)?.a === "each") return null;
  const who = whoOf(g.block) ?? { text: g.block.title ?? "" };
  const target = { block: g.block.id, after: goods[goods.length - 1]!.id, type: goods[0]!.values.type };
  const base = {
    id,
    kind: "delivery" as const,
    fp: fingerprint(goods.map((r) => r.id)),
    block: g.block.id,
    entry: null,
    field: "amount" as const,
    entries: goods.map((r) => r.id),
    sentence: { key: "q.delivery", args: [who, { count: goods.length }] } satisfies Sentence,
    why: PRICE_WHY,
    options: [{ id: "each", label: { key: "q.delivery.each" }, changes: [] }, priceLater] satisfies QuestionOption[],
    input: { kind: "money" as const, target: { to: "delivery" as const, entries: goods.map((r) => r.id), ...target } },
  };
  const memo = ctx.memos.get(g.block.id);
  if (!memo) return question(base);
  return question({ ...base, ...(memoDelivery(memo, g.block, rows, goods, target) ?? { why: memoPartialWhy(memo, goods) }) });
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
// Splitting a part (T2)
// ---------------------------------------------------------------------------

/**
 * The lines a split at `from` moves to the new part: the block's lines from `from` to its end, in
 * page order (a rejected line stays where it is). Null when it can't split there: `from` isn't one
 * of the block's lines, or is at or above its first written line (what a part is, is the meaning
 * question's job; a "before" an answer added on top doesn't count), or a line from there down is
 * already in the khata.
 */
export function splitLines(rows: readonly ReviewRow[], block: string, from: string): ReviewRow[] | null {
  const own = rows.filter((r) => r.values.block === block && r.status !== "rejected").sort((a, b) => a.lineOrder - b.lineOrder);
  const at = own.findIndex((r) => r.id === from);
  const written = Math.max(0, own.findIndex((r) => r.candidate != null));
  if (at <= written) return null;
  const moved = own.slice(at);
  return moved.every((r) => r.status === "draft") ? moved : null;
}

const DAY_SALES_TYPES: ReadonlySet<TransactionType> = new Set(["cash_sale", "credit_sale", "repayment", "subtotal"]);
const EXPENSE_TYPES: ReadonlySet<TransactionType> = new Set(["expense", "purchase", "supplier_payment", "subtotal"]);

/**
 * A line's kind in the part it moves to. In day sales or expenses, a sale or a purchase on nobody's
 * account was paid there and then; a kind that can't be in the part becomes unknown, so Scriba asks.
 * An account or "something else" keeps the kinds: the line-kind questions ask about any that point
 * the other way.
 */
function kindIn(kind: BlockKind, values: EntryValues): TransactionType {
  const type = values.type;
  const named = (values.customer?.trim().length ?? 0) > 0;
  if (kind === "day_sales") {
    if (type === "credit_sale" && !named) return "cash_sale";
    return DAY_SALES_TYPES.has(type) && (type !== "repayment" || named) ? type : "unknown";
  }
  if (kind === "expenses") {
    if (type === "credit_purchase" && !named) return "purchase";
    return EXPENSE_TYPES.has(type) ? type : "unknown";
  }
  return type;
}

/** A split at `from`, and the kinds its lines take in the new part (`kindIn`). */
export function splitChanges(rows: readonly ReviewRow[], block: string, from: string, values: SplitValues): Change[] {
  const retyped = (splitLines(rows, block, from) ?? []).flatMap((r): Change[] => {
    const type = kindIn(values.kind, r.values);
    return type === r.values.type ? [] : [{ op: "edit", entry: r.id, values: { type } }];
  });
  return [{ op: "split", block, from, values }, ...retyped];
}

/** The words of the split question by the account's side, and the parts its answers make. */
const SPLIT_WORDS: Record<PartyKind, { apart: MessageKey; cash: MessageKey; other: MessageKey; apartKind: BlockKind; cashType: TransactionType; otherKind: BlockKind }> = {
  customer: { apart: "q.split.sale", cash: "q.split.sale.cash", other: "q.split.other.customer", apartKind: "day_sales", cashType: "cash_sale", otherKind: "customer_account" },
  supplier: { apart: "q.split.purchase", cash: "q.split.purchase.cash", other: "q.split.other.supplier", apartKind: "expenses", cashType: "purchase", otherKind: "supplier_account" },
};

/**
 * "Are the 3 lines after “মোট ২৬০” (৳250) Karim's too?" An account with two or more written
 * totals, whose lines after the first name no one, may be two things written one under the other:
 * the account, then a separate sale. Each total can check on its own, so the sums don't show it.
 * Code works out the count and the sum. Asked right after the part's meaning.
 */
function splitQuestion(ctx: Ctx, g: Group, open: readonly ReviewRow[]): Question | null {
  const block = g.block;
  if (!block || (block.kind !== "customer_account" && block.kind !== "supplier_account")) return null;
  const who = whoOf(block);
  const totals = open.filter((r) => r.values.type === "subtotal" && r.values.amountText?.trim());
  if (!who || totals.length < 2 || (ctx.input.page.blocks ?? []).length >= MAX_BLOCKS) return null;
  const first = totals[0]!;
  const after = g.entries.filter((r) => r.lineOrder > first.lineOrder);
  const lines = after.filter((r) => isOpen(r) && !MARKER_TYPES.has(r.values.type));
  if (lines.length === 0 || after.some((r) => r.values.customer?.trim())) return null;
  const from = after[0]!;
  const moved = splitLines(ctx.rows, block.id, from.id);
  if (!moved) return null;

  const words = SPLIT_WORDS[blockPartyKind(block.kind)!];
  const amounts = lines.map(amountOf);
  const sum = amounts.every((n) => n != null) ? amounts.reduce<number>((s, n) => s + n!, 0) : null;
  const cash = lines.every((r) => kindIn(words.apartKind, r.values) === words.cashType);
  return question({
    id: `split:${block.id}`,
    kind: "split",
    fp: fingerprint([block.kind, first.id, ...moved.map((r) => r.id)]),
    block: block.id,
    entry: null,
    field: null,
    // The first total too, so the picture shows what the lines come after.
    entries: [first.id, ...moved.map((r) => r.id)],
    sentence:
      sum != null
        ? { key: "q.split", args: [quote(first), { count: lines.length }, { money: sum }, who] }
        : { key: "q.split.nosum", args: [quote(first), { count: lines.length }, who] },
    why: { sentence: { key: "q.split.why" }, verified: false },
    options: [
      { id: "yes", label: { key: "q.split.yes", args: [who] }, changes: [] },
      {
        id: "apart",
        label: { key: words.apart },
        ...(cash ? { detail: { key: words.cash } } : {}),
        changes: splitChanges(ctx.rows, block.id, from.id, { kind: words.apartKind }),
      },
    ],
    input: { kind: "text", target: { to: "split", block: block.id, from: from.id, kind: words.otherKind }, label: { key: words.other } },
  });
}

/**
 * "From here down, a separate part" (T2): put to him only when he picks a line in its fix sheet,
 * never in the deck. The answer route works it out again from its id, `split:<block>:<line>`. Null
 * where a split can't start: a part's first line, a line in no part, a page with all its parts.
 */
export function splitHereQuestion(state: { page: PageValues; rows: readonly ReviewRow[] }, entry: string): Question | null {
  const blocks = state.page.blocks ?? [];
  const row = state.rows.find((r) => r.id === entry);
  const block = row?.values.block ? blocks.find((b) => b.id === row.values.block) : undefined;
  if (!block || blocks.length >= MAX_BLOCKS) return null;
  const moved = splitLines(state.rows, block.id, entry);
  if (!moved) return null;
  const option = (kind: BlockKind): QuestionOption => ({ id: `kind:${kind}`, label: { key: KIND_LABEL[kind] }, changes: splitChanges(state.rows, block.id, entry, { kind }) });
  return question({
    id: `split:${block.id}:${entry}`,
    kind: "split",
    fp: fingerprint([block.kind, ...moved.map((r) => r.id)]),
    block: block.id,
    entry,
    field: null,
    entries: moved.map((r) => r.id),
    sentence: { key: "q.split.here", args: [{ count: moved.length }] },
    options: [option("day_sales"), option("expenses"), option("other")],
    input: { kind: "text", target: { to: "split", block: block.id, from: entry, kind: "customer_account" }, label: { key: "q.split.other.customer" } },
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

/**
 * "6 at ৳15 each": what one reading of a line's amount comes to per unit, worked out by code, so
 * he can tell ৳90 for six eggs from ৳10. Only when the quantity reads as a number above zero.
 */
function perUnit(values: EntryValues, amountText: string): Sentence | null {
  const qty = parseQuantity(values.quantityText);
  const amount = parseMoney(amountText);
  if (!qty.ok || qty.value <= 0 || !amount.ok) return null;
  const each: SentenceArg = { money: Math.round((amount.value * 1000) / qty.value) };
  const count: SentenceArg = { text: values.quantityText!.trim() };
  const unit = values.unit?.trim();
  return unit ? { key: "q.per.unit", args: [count, { text: unit }, each] } : { key: "q.per", args: [count, each] };
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
    const options: QuestionOption[] = readings.map((v, i) => {
      const detail = field === "amount" ? perUnit(row.values, v) : null;
      return {
        id: `value:${i}`,
        label: { key: "q.value", args: [valueArg(field, v)] },
        ...(detail ? { detail } : {}),
        value: v,
        changes: v === current ? [{ op: "edit", entry: row.id, checked: [field] }] : [{ op: "edit", entry: row.id, values: { [key]: v } }],
        ...(v === current && mixed ? { accepts: [ackFingerprint(format)] } : {}),
      };
    });

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

function priceQuestion(ctx: Ctx, row: ReviewRow, g: Group): Question | null {
  if (!isUnpricedGoods(row.values) || row.values.type === "unknown") return null;
  const base = {
    id: `price:${row.id}`,
    kind: "price" as const,
    fp: fingerprint([row.values.item, row.values.quantityText, row.values.unit]),
    block: g.block?.id ?? null,
    entry: row.id,
    field: "amount" as const,
    sentence: { key: "q.price", args: [quote(row)] } satisfies Sentence,
    why: PRICE_WHY,
    options: [priceLater],
    input: { kind: "money" as const, target: { to: "entry" as const, entry: row.id, field: "amount" as const } },
  };
  const memo = g.block ? ctx.memos.get(g.block.id) : undefined;
  return question({ ...base, ...(memo ? memoPrice(memo, row, g.entries.filter(isOpen)) : {}) });
}

// ---------------------------------------------------------------------------
// The company's memo (U4)
// ---------------------------------------------------------------------------

/** A memo linked to a visit block: its lines paired with the block's goods. */
type BlockMemo = {
  memo: MemoForPage;
  /** A goods line's memo line, when each is the other's best match. */
  sure: Map<string, MemoLine>;
  /** Goods lines with no sure match, and the memo lines they may be. */
  maybe: Map<string, MemoLine[]>;
  /** Priced memo lines that none of the block's goods may be. */
  extras: MemoLine[];
};

const GOODS_TYPES: ReadonlySet<TransactionType> = new Set(["credit_purchase", "purchase", "unknown"]);
/** Goods a memo line may be: an item is written, bought or of no kind yet. */
const isGoods = (r: ReviewRow) => (r.values.item?.trim().length ?? 0) > 0 && GOODS_TYPES.has(r.values.type);

/** Nothing on the memo contradicts its sums: its lines agree with what it prints, or it prints none. */
const memoAgrees = (m: MemoForPage) => m.memo.check.agrees !== false;
/** A memo line whose price may be proposed: it reads as a number, the model was sure of it, and qty × rate doesn't say otherwise. */
const priceable = (l: MemoLine) => l.amountPoisha != null && !l.review.includes("amount") && l.multiplies !== false;

/** What the memo takes off its lines (a discount), so that its line prices aren't what he owes. Null: nothing. */
function discountOf(m: MemoForPage): number | null {
  const { total, linesSum } = m.memo.check;
  return total != null && linesSum != null && total !== linesSum ? linesSum - total : null;
}

const memoRef = (m: MemoForPage, lines: readonly MemoLine[]): MemoRef => ({ document: m.documentId, run: m.runId, lines: lines.map((l) => l.id) });

/** The amount of the block's one line of this kind; null when there is none, or more than one. */
function singleAmount(rows: readonly ReviewRow[], type: TransactionType): { row: ReviewRow; amount: number } | null {
  const of = rows.filter((r) => r.values.type === type);
  const amount = of.length === 1 ? amountOf(of[0]!) : null;
  return amount == null ? null : { row: of[0]!, amount };
}

/** He priced the block's goods as one total (typed, or the memo's): their line is no single memo line. */
const pricedAsTotal = (ctx: Ctx, block: string) => ["value", "memo_total"].includes(ctx.answers.get(`delivery:${block}`)?.a ?? "");

function memoBlock(ctx: Ctx, m: MemoForPage, g: Group): BlockMemo {
  if (pricedAsTotal(ctx, g.block!.id)) return { memo: m, sure: new Map(), maybe: new Map(), extras: [] };
  const goods = g.entries.filter((r) => isOpen(r) && isGoods(r));
  const pairing = pairLines(goods.map((r) => ({ id: r.id, item: r.values.item, quantityMilli: quantityOf(r) })), m.memo);
  const byId = new Map(m.memo.lines.map((l) => [l.id, l]));
  const sure = new Map<string, MemoLine>();
  const maybe = new Map<string, MemoLine[]>();
  for (const p of pairing.pairs) {
    const line = byId.get(p.line)!;
    if (p.sure) sure.set(p.goods, line);
    else maybe.set(p.goods, [...(maybe.get(p.goods) ?? []), line]);
  }
  const extras = pairing.unmatched.map((id) => byId.get(id)!).filter((l) => l.amountPoisha != null && l.amountPoisha > 0);
  return { memo: m, sure, maybe, extras };
}

/**
 * Which visit each memo belongs to. A memo that names one visit's company or rep is that visit's.
 * Otherwise Scriba asks, at the first visit it may be, and his answer links it. A visit takes one
 * memo: the first that is its. Returns the questions to ask, by block.
 */
function linkMemos(ctx: Ctx, groups: readonly Group[]): Map<string, Question[]> {
  const asks = new Map<string, Question[]>();
  const visits = groups.filter((g) => g.block && g.convention === "supplier" && g.entries.some(isOpen));
  for (const m of ctx.input.memos ?? []) {
    const free = visits.filter((g) => !ctx.memos.has(g.block!.id));
    if (free.length === 0) continue;
    const named = blocksNamedOnMemo(m.memo, free.map((g) => ({ block: g.block!.id, party: g.block!.party, person: g.block!.person })));
    let home = named.length === 1 ? free.find((g) => g.block!.id === named[0]) : undefined;
    if (!home) {
      const may = named.length > 1 ? free.filter((g) => named.includes(g.block!.id)) : free;
      const q = memoLinkQuestion(m, may, named.length > 1);
      const answered = ctx.answers.get(q.id);
      if (answered?.fp === q.fp) home = may.find((g) => answered.a === `block:${g.block!.id}`);
      const at = may[0]!.block!.id;
      asks.set(at, [...(asks.get(at) ?? []), q]);
    }
    if (home) ctx.memos.set(home.block!.id, memoBlock(ctx, m, home));
  }
  return asks;
}

/** "Is this memo from “PRAN Agro Ltd.” the one Selim (Praan) left?" */
function memoLinkQuestion(m: MemoForPage, groups: readonly Group[], several: boolean): Question {
  const { company } = m.memo;
  const from = company ?? m.memo.person;
  const single = groups.length === 1;
  const who = (b: BlockValues): SentenceArg => whoOf(b) ?? { text: b.title ?? "" };
  const first = groups[0]!.block!;
  const sentence: Sentence = !single
    ? { key: "q.memo.link.which" }
    : from
      ? { key: "q.memo.link", args: [{ text: from }, who(first)] }
      : { key: "q.memo.link.unnamed", args: [who(first)] };
  const why: Why = {
    sentence: !company ? { key: "q.memo.link.why.unnamed" } : { key: several ? "q.memo.link.why.several" : "q.memo.link.why", args: [{ text: company }] },
    verified: false,
  };
  return question({
    id: `memo:${m.documentId}`,
    kind: "memo",
    fp: fingerprint([m.runId, ...groups.map((g) => g.block!.id)]),
    block: single ? first.id : null,
    entry: null,
    field: null,
    entries: groups.flatMap((g) => g.entries.filter(isOpen).map((r) => r.id)),
    sentence,
    why,
    options: [
      ...groups.map((g) => ({
        id: `block:${g.block!.id}`,
        label: single ? { key: "q.memo.link.yes" as const } : { key: "q.value" as const, args: [who(g.block!)] },
        changes: [],
      })),
      { id: "no", label: { key: "q.memo.link.no" }, changes: [] },
      later,
    ],
    memo: memoRef(m, []),
  });
}

/** The memo's price on a goods line, and its rate too when he wrote the quantity the memo charges for. */
function memoPriceChanges(row: ReviewRow, l: MemoLine): Change[] {
  const values: Partial<EntryValues> = { amountText: poishaText(l.amountPoisha!) };
  const qty = quantityOf(row);
  if (l.multiplies === true && l.ratePoisha != null && qty != null && qty === l.quantityMilli && !row.values.rateText?.trim()) {
    values.rateText = poishaText(l.ratePoisha);
  }
  return [{ op: "edit", entry: row.id, values, checked: ["amount"] }];
}

/**
 * What the shop would owe the company after the visit with these prices, worked out by code from
 * the block's lines: due before, + goods on credit, − payments. Null when a line's effect or amount
 * isn't known, or there is no single "before".
 */
function supplierDueAfter(rows: readonly ReviewRow[], prices: ReadonlyMap<string, number>): number | null {
  const before = singleAmount(rows, "opening_balance");
  if (!before) return null;
  let due = before.amount;
  for (const r of rows) {
    const type = r.values.type;
    if (r === before.row || type === "closing_balance" || type === "subtotal" || type === "purchase") continue;
    const sign = accountSign("supplier", type);
    const amount = prices.get(r.id) ?? amountOf(r);
    if (sign == null || amount == null) return null;
    due += sign * amount;
  }
  return due;
}

/**
 * Why the memo's prices can be taken. Best: with them the page comes to the due the memo prints,
 * two records agreeing. Else its lines add up to its total (code checked), or it prints no total.
 */
function memoPricesWhy(m: MemoForPage, rows: readonly ReviewRow[], prices: ReadonlyMap<string, number>): Why {
  const due = m.memo.totals.due.poisha;
  if (due != null && supplierDueAfter(rows, prices) === due) return { sentence: { key: "q.memo.due", args: [{ money: due }] }, verified: true };
  return m.memo.check.agrees === true ? { sentence: { key: "q.memo.sums" }, verified: true } : { sentence: { key: "q.memo.nototal" }, verified: false };
}

/** Why the memo proposes nothing: its sums don't agree, or it has some of the goods only. */
function memoPartialWhy(bm: BlockMemo, goods: readonly ReviewRow[]): Why {
  const { linesSum, total } = bm.memo.memo.check;
  if (!memoAgrees(bm.memo) && linesSum != null && total != null) {
    return { sentence: { key: "q.memo.sums.off", args: [{ money: linesSum }, { money: total }] }, verified: false };
  }
  const found = goods.filter((r) => bm.sure.has(r.id) || bm.maybe.has(r.id)).length;
  return { sentence: found > 0 ? { key: "q.memo.partial", args: [{ count: found }] } : { key: "q.memo.none" }, verified: false };
}

/**
 * The delivery card when the memo prices every unpriced good: its prices one by one, or, after a
 * discount, its total for them all (then only when its lines are exactly these goods). Null: the
 * memo can't propose, and the plain delivery question is asked.
 */
function memoDelivery(
  bm: BlockMemo,
  block: BlockValues,
  rows: readonly ReviewRow[],
  goods: readonly ReviewRow[],
  target: { block: string; after: string; type: TransactionType },
): Partial<Question> | null {
  const m = bm.memo;
  const lines = goods.map((r) => bm.sure.get(r.id));
  if (!memoAgrees(m) || lines.some((l) => !l || !priceable(l))) return null;
  const paired = lines as MemoLine[];
  const company: SentenceArg = { text: block.party?.trim() || m.memo.company || "" };
  const fp = fingerprint([...goods.map((r) => r.id), m.runId, ...paired.map((l) => `${l.id}:${l.amountPoisha}`)]);
  const each: QuestionOption = { id: "each", label: { key: "q.delivery.each" }, changes: [] };
  const off = discountOf(m);
  if (off == null) {
    const sum = paired.reduce((s, l) => s + l.amountPoisha!, 0);
    return {
      fp,
      sentence: { key: "q.memo.delivery", args: [company, { count: goods.length }, { money: sum }] },
      why: memoPricesWhy(m, rows, new Map(goods.map((r, i) => [r.id, paired[i]!.amountPoisha!]))),
      options: [
        {
          id: "memo",
          label: { key: "q.memo.delivery.use" },
          detail: { key: "q.value", args: [{ text: paired.map((l) => formatTaka(l.amountPoisha)).join(" + ") }] },
          changes: goods.flatMap((r, i) => memoPriceChanges(r, paired[i]!)),
        },
        each,
        priceLater,
      ],
      proposed: "memo",
      memo: memoRef(m, paired),
    };
  }
  const priced = m.memo.lines.filter((l) => !l.crossedOut && l.amountText != null);
  if (priced.length !== paired.length || priced.some((l) => !paired.includes(l))) return null;
  const total = m.memo.check.total!;
  // As one line: the goods' rows count the total between them (the first carries it, the rest nothing).
  const asTotal = new Map(goods.map((r, i) => [r.id, i === 0 ? total : 0]));
  return {
    fp,
    sentence: { key: "q.memo.delivery.total", args: [company, { money: total }, { count: goods.length }, { money: off }] },
    why: memoPricesWhy(m, rows, asTotal),
    options: [
      { id: "memo_total", label: { key: "q.memo.total.use", args: [{ money: total }] }, value: poishaText(total), changes: deliveryChanges(goods, target, poishaText(total)) },
      each,
      priceLater,
    ],
    proposed: "memo_total",
    memo: memoRef(m, paired),
  };
}

/**
 * A goods line the memo prices: proposed when its memo line is sure, read with confidence and the
 * memo's sums agree (and take nothing off). Otherwise the memo lines it may be are options to pick.
 */
function memoPrice(bm: BlockMemo, row: ReviewRow, rows: readonly ReviewRow[]): Partial<Question> {
  const m = bm.memo;
  const option = (l: MemoLine, label: Sentence): QuestionOption => ({ id: `memo:${l.id}`, label, value: poishaText(l.amountPoisha!), changes: memoPriceChanges(row, l) });
  const fpOf = (lines: readonly MemoLine[]) =>
    fingerprint([row.values.item, row.values.quantityText, row.values.unit, m.runId, ...lines.map((l) => `${l.id}:${l.amountPoisha}`)]);
  const sure = bm.sure.get(row.id);
  if (sure && priceable(sure) && memoAgrees(m) && discountOf(m) == null) {
    return {
      fp: fpOf([sure]),
      sentence: { key: "q.memo.price", args: [quote(row), { money: sure.amountPoisha! }] },
      why: priceWhy(m, sure, row, rows),
      options: [option(sure, { key: "q.memo.use", args: [{ money: sure.amountPoisha! }] }), priceLater],
      proposed: `memo:${sure.id}`,
      memo: memoRef(m, [sure]),
    };
  }
  const lines = (sure ? [sure] : (bm.maybe.get(row.id) ?? [])).filter((l) => l.amountPoisha != null);
  if (lines.length === 0) return {};
  const off = discountOf(m);
  const { linesSum, total } = m.memo.check;
  const why: Why =
    off != null
      ? { sentence: { key: "q.memo.discount", args: [{ money: off }] }, verified: false }
      : !memoAgrees(m) && linesSum != null && total != null
        ? { sentence: { key: "q.memo.sums.off", args: [{ money: linesSum }, { money: total }] }, verified: false }
        : { sentence: { key: sure ? "q.memo.unsure" : "q.memo.maybe" }, verified: false };
  return {
    fp: fpOf(lines),
    why,
    options: [...lines.map((l) => option(l, { key: "q.memo.line", args: [{ text: l.item ?? l.text }, { money: l.amountPoisha! }] })), priceLater],
    memo: memoRef(m, lines),
  };
}

/** Why one memo price can be taken: the page then comes to the memo's due, or the memo line itself (ticked when its sums check out). */
function priceWhy(m: MemoForPage, l: MemoLine, row: ReviewRow, rows: readonly ReviewRow[]): Why {
  const due = m.memo.totals.due.poisha;
  if (due != null && supplierDueAfter(rows, new Map([[row.id, l.amountPoisha!]])) === due) return { sentence: { key: "q.memo.due", args: [{ money: due }] }, verified: true };
  return { sentence: { key: "q.memo.from", args: [{ text: l.text }] }, verified: l.multiplies === true && m.memo.check.agrees === true };
}

/** "The page says ৳450, the memo says ৳480": a figure to look at again, on the page or the memo. */
function differsQuestion(m: MemoForPage, row: ReviewRow, pageAmount: number, memoAmount: number, sentence: Sentence, lines: readonly MemoLine[]): Question {
  return question({
    id: `memo_differs:${row.id}`,
    kind: "memo_differs",
    fp: fingerprint([row.values.amountText, m.runId, memoAmount]),
    block: row.values.block ?? null,
    entry: row.id,
    field: "amount",
    sentence,
    options: [
      { id: "page", label: { key: "q.memo.page", args: [{ money: pageAmount }] }, changes: [{ op: "edit", entry: row.id, checked: ["amount"] }] },
      {
        id: "memo",
        label: { key: "q.memo.memo", args: [{ money: memoAmount }] },
        value: poishaText(memoAmount),
        changes: [{ op: "edit", entry: row.id, values: { amountText: poishaText(memoAmount) }, checked: ["amount"] }],
      },
    ],
    memo: memoRef(m, lines),
  });
}

/** A priced goods line that its memo line prices differently. */
function memoDiffersQuestion(ctx: Ctx, row: ReviewRow, g: Group): Question | null {
  const bm = g.block ? ctx.memos.get(g.block.id) : undefined;
  const l = bm?.sure.get(row.id);
  const amount = amountOf(row);
  if (!bm || !l || !priceable(l) || !memoAgrees(bm.memo) || amount == null || amount === l.amountPoisha) return null;
  return differsQuestion(bm.memo, row, amount, l.amountPoisha!, { key: "q.memo.differs", args: [quote(row), { money: amount }, { money: l.amountPoisha! }] }, [l]);
}

/** The visit's "before" or payment, when the memo prints it differently. */
function memoFigureQuestions(ctx: Ctx, g: Group, rows: readonly ReviewRow[]): Question[] {
  const bm = g.block?.kind === "supplier_visit" ? ctx.memos.get(g.block.id) : undefined;
  if (!bm) return [];
  const t = bm.memo.memo.totals;
  const out: Question[] = [];
  const check = (type: TransactionType, memoAmount: number | null, key: MessageKey) => {
    const page = singleAmount(rows, type);
    if (page && memoAmount != null && page.amount !== memoAmount) {
      out.push(differsQuestion(bm.memo, page.row, page.amount, memoAmount, { key, args: [{ money: page.amount }, { money: memoAmount }] }, []));
    }
  };
  check("opening_balance", t.previousDue.poisha, "q.memo.differs.before");
  check("supplier_payment", t.paid.poisha, "q.memo.differs.paid");
  return out;
}

/** "The memo shows the same: ৳2,800 before and ৳1,500 paid." Only when nothing on it differs. */
function memoAgreesWhy(bm: BlockMemo, rows: readonly ReviewRow[]): Why | null {
  const t = bm.memo.memo.totals;
  const before = singleAmount(rows, "opening_balance")?.amount ?? null;
  const paid = singleAmount(rows, "supplier_payment")?.amount ?? null;
  const same = (page: number | null, memo: number | null) => (page == null || memo == null ? null : page === memo);
  const b = same(before, t.previousDue.poisha);
  const p = same(paid, t.paid.poisha);
  if (b === false || p === false) return null;
  if (b && p) return { sentence: { key: "q.memo.same.both", args: [{ money: before! }, { money: paid! }] }, verified: true };
  if (b) return { sentence: { key: "q.memo.same.before", args: [{ money: before! }] }, verified: true };
  if (p) return { sentence: { key: "q.memo.same.paid", args: [{ money: paid! }] }, verified: true };
  return null;
}

/** Goods the memo lists that aren't on the page: add them to the visit, or leave them out. */
function memoExtraQuestions(ctx: Ctx, g: Group, rows: readonly ReviewRow[]): Question[] {
  const block = g.block;
  const bm = block ? ctx.memos.get(block.id) : undefined;
  // A delivery priced as one total has no extras: it already counts everything that came.
  if (!block || !bm || bm.extras.length === 0 || rows.length === 0) return [];
  const m = bm.memo;
  const type = rows.find((r) => r.values.type === "credit_purchase" || r.values.type === "purchase")?.values.type ?? "credit_purchase";
  const after = rows[rows.length - 1]!.id;
  const add = (l: MemoLine): Change => ({
    op: "add",
    after,
    values: {
      ...EMPTY_ENTRY,
      type,
      item: (l.item ?? l.text).slice(0, MAX_TEXT),
      quantityText: l.quantityText,
      unit: l.unit,
      rateText: l.multiplies === true && l.ratePoisha != null ? poishaText(l.ratePoisha) : null,
      amountText: poishaText(l.amountPoisha!),
      block: block.id,
    },
  });
  // Each is added just after the block's last line, so adding them in reverse keeps the memo's order.
  const addAll = (lines: readonly MemoLine[]) => [...lines].reverse().map(add);
  const why: Why = { sentence: { key: "q.memo.extra.why" }, verified: false };

  const groupId = `memo_extras:${m.documentId}`;
  if (bm.extras.length >= 2 && ctx.answers.get(groupId)?.a !== "each") {
    return [
      question({
        id: groupId,
        kind: "memo_extra",
        fp: fingerprint([m.runId, ...bm.extras.map((l) => `${l.id}:${l.amountPoisha}`)]),
        block: block.id,
        entry: null,
        field: null,
        sentence: { key: "q.memo.extras", args: [{ count: bm.extras.length }, { money: bm.extras.reduce((s, l) => s + l.amountPoisha!, 0) }] },
        why,
        options: [
          { id: "all", label: { key: "q.memo.extras.add" }, changes: addAll(bm.extras) },
          { id: "each", label: { key: "q.each" }, changes: [] },
          { id: "none", label: { key: "q.memo.extras.skip" }, changes: [] },
          later,
        ],
        memo: memoRef(m, bm.extras),
      }),
    ];
  }
  return bm.extras.map((l) =>
    question({
      id: `memo_extra:${m.documentId}:${l.id}`,
      kind: "memo_extra",
      fp: fingerprint([m.runId, l.id, l.amountPoisha]),
      block: block.id,
      entry: null,
      field: null,
      sentence: { key: "q.memo.extra", args: [{ text: l.text }, { money: l.amountPoisha! }] },
      why,
      options: [
        { id: "add", label: { key: "q.memo.extra.add" }, changes: addAll([l]) },
        { id: "skip", label: { key: "q.memo.extra.skip" }, changes: [] },
        later,
      ],
      memo: memoRef(m, [l]),
    }),
  );
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
    // With the photo's day there is one day to propose; without it, he says which.
    sentence: { key: day ? "q.date" : "q.date.which" },
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
    memos: new Map(),
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
  const memoLinks = linkMemos(ctx, groups);

  for (const g of groups) {
    const open = g.entries.filter(isOpen);
    if (open.length === 0) continue;
    const block = g.block;
    const blockParty = block ? blockPartyKind(block.kind) : null;

    if (block) {
      add(meaningQuestion(block, open, ctx.memos.get(block.id)));
      add(splitQuestion(ctx, g, open));
      const party = block.party?.trim();
      if (blockParty && party) {
        const link = partyLinkFor({ ...open[0]!.values, type: "opening_balance" }, page, ctx.pageTypes);
        if (link) add(samePartyQuestion(ctx, link, party, { block: block.id, rows: open }));
      }
      for (const q of memoLinks.get(block.id) ?? []) add(q);
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
      if (!priced.has(row.id)) add(priceQuestion(ctx, row, g));
      add(memoDiffersQuestion(ctx, row, g));
    }

    add(delivery);
    for (const q of memoExtraQuestions(ctx, g, open)) add(q);
    add(openingQuestion(ctx, g, open));
    for (const q of memoFigureQuestions(ctx, g, open)) add(q);
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
