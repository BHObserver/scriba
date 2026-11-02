/**
 * "Scriba asks" (U2): the questions for a page and what each answer changes. The north-star
 * page is a company visit written beside the day's sales:
 *
 *   Praan (Selim)          চাল ২ কেজি ১৪০
 *   Before - 2800          ডিম ১০
 *   Given - 1500           তেল ১৮০
 *   Juice 1 Box
 *   Buiscite 2 Box
 *   Conacor - 1 Box
 *
 * No prices are written for the goods, no kind for the sales, and no date.
 */
import { describe, expect, test } from "bun:test";
import { type NormalizedExtraction, pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { BLOCKS_PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_V3_VERSION } from "@/lib/extraction/schema";
import { makeI18n } from "@/lib/i18n/format";
import { parseWrittenDate } from "@/lib/ledger/dates";
import { normalizePartyName } from "@/lib/ledger/parties";
import type { PageValues } from "@/lib/ledger/types";
import { decideApproval } from "@/lib/review/approval";
import { type ReviewRow, toValidationInput } from "@/lib/review/state";
import { keepAnswers, pageValuesSchema } from "@/lib/review/values";
import { validateLedger } from "@/lib/validation/engine";
import { readYesNo } from "@/lib/voice/answer-words";
import { acceptedFindings, answerQuestion, applyChanges } from "./answer";
import { bookPartiesOf, buildQuestions, splitHereQuestion, writtenDay } from "./engine";
import { romanize, soundsAlike } from "./similar";
import { spokenAnswer } from "./speech";
import { sentenceText } from "./text";
import type { Answer, KnownParty, Question, QuestionInput } from "./types";

const V3 = { promptVersion: BLOCKS_PROMPT_VERSION, schemaVersion: SCHEMA_V3_VERSION };
const NOW = new Date("2026-11-02T10:00:00Z");

function line(id: string, block: string, text: string, type: string, o: Record<string, unknown> = {}) {
  return {
    id, line: Number(id.slice(1)), block, text, type,
    customer: null, item: null, qty: null, unit: null, rate: null, amount: null, balance: null,
    crossed_out: false, review: [], note: null, box: null,
    ...o,
  };
}

const VISIT = { id: "b1", kind: "supplier_visit", title: "Praan (Selim)", party: "Praan", person: "Selim", date_text: null, box: null };
const SALES = { id: "b2", kind: "day_sales", title: null, party: null, person: null, date_text: null, box: null };

const PRAN_LINES = [
  line("e1", "b1", "Before - 2800", "opening_balance", { amount: "2800" }),
  line("e2", "b1", "Given - 1500", "supplier_payment", { amount: "1500" }),
  line("e3", "b1", "Juice 1 Box", "credit_purchase", { item: "Juice", qty: "1", unit: "Box" }),
  line("e4", "b1", "Buiscite 2 Box", "credit_purchase", { item: "Buiscite", qty: "2", unit: "Box" }),
  line("e5", "b1", "Conacor - 1 Box", "credit_purchase", { item: "Conacor", qty: "1", unit: "Box" }),
];
const SALES_LINES = [
  line("e6", "b2", "চাল ২ কেজি ১৪০", "unknown", { item: "চাল", qty: "২", unit: "কেজি", amount: "১৪০" }),
  line("e7", "b2", "ডিম ১০", "unknown", { item: "ডিম", amount: "১০" }),
  line("e8", "b2", "তেল ১৮০", "unknown", { item: "তেল", amount: "১৮০" }),
];

function read(o: { blocks?: unknown[]; entries?: unknown[]; doubts?: unknown[]; date?: string | null; ledger?: string } = {}): NormalizedExtraction {
  const output = {
    page: { date_text: o.date ?? null, ledger_type: o.ledger ?? "mixed", legibility: "clear" },
    blocks: o.blocks ?? [VISIT, SALES],
    entries: o.entries ?? [...PRAN_LINES, ...SALES_LINES],
    doubts: o.doubts ?? [],
    warnings: [],
  };
  const r = parseModelResponse({ status: "completed", incompleteReason: null, outputText: JSON.stringify(output), refusal: null }, V3);
  if (!r.ok) throw new Error(`${r.kind}: ${r.detail}`);
  return r.extraction;
}

/** Review rows as the database would hold them: their own ids, the model's candidate beside them. */
function inputOf(x: NormalizedExtraction, o: { parties?: KnownParty[]; page?: Partial<PageValues> } = {}): QuestionInput {
  const rows: ReviewRow[] = x.entries.map((e, i) => ({
    id: `r${i + 1}`,
    extractedEntryId: `x${i + 1}`,
    lineOrder: e.line,
    values: e.values,
    reviewFields: [...e.reviewFields],
    status: "draft",
    version: 1,
    candidate: { candidateId: e.candidateId, values: e.values, bbox: e.bbox, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason },
  }));
  return {
    page: { ...pageValuesOf(x), ...o.page },
    rows,
    doubts: x.doubts ?? [],
    parties: o.parties ?? [],
    capturedOn: "2026-11-01",
  };
}

function find(input: QuestionInput, id: string): Question {
  const set = buildQuestions(input);
  const q = [...set.questions, ...set.later].find((x) => x.id === id);
  if (!q) throw new Error(`no question ${id}; have ${set.questions.map((x) => x.id).join(", ")}`);
  return q;
}

/** Answer as the route does, and carry on from the state it leads to. */
function answer(input: QuestionInput, id: string, a: Answer): QuestionInput {
  const q = find(input, id);
  const out = answerQuestion(input, id, q.fp, a, NOW);
  if (!out.ok) throw new Error(`answer to ${id} refused: ${out.error}`);
  return { ...input, page: out.after.page, rows: out.after.rows };
}

const ids = (input: QuestionInput) => buildQuestions(input).questions.map((q) => q.id);
const row = (input: QuestionInput, id: string) => input.rows.find((r) => r.id === id)!;
const findings = (input: QuestionInput) => validateLedger(toValidationInput({ page: { values: input.page, version: 1, reviewStartedAt: null }, rows: input.rows }));
const bn = makeI18n("bn");
const en = makeI18n("en");

describe("the Pran page", () => {
  const start = inputOf(read());

  test("asks four things, block by block, then the date", () => {
    expect(ids(start)).toEqual(["meaning:b1", "delivery:b1", "kind:b2", "date"]);
  });

  test("the visit is put to him in one sentence, with one button to confirm", () => {
    const q = find(start, "meaning:b1");
    expect(q.proposed).toBe("yes");
    expect(q.options.map((o) => o.id)).toEqual(["yes", "kind:supplier_account", "kind:customer_account", "line"]);
    // T1: "A line is wrong" only opens the part's lines; the answer route refuses it.
    expect(q.options.at(-1)!.local).toBe(true);
    expect(answerQuestion(start, q.id, q.fp, { option: "line" }, NOW)).toEqual({ ok: false, error: "local" });
    expect(sentenceText(bn, q.sentence)).toBe("Praan কোম্পানির Selim এসেছিলেন। আগে দেনা ছিল ৳২,৮০০, এবার দিয়েছেন ৳১,৫০০। ঠিক বুঝেছি?");
    expect(sentenceText(en, q.sentence)).toBe("Selim came from Praan. You owed ৳2,800 before, and paid ৳1,500 this time. Did I get that right?");
  });

  test("the visit's figures are what is written, payments summed by code; without any, it names the company", () => {
    const sentence = (entries: unknown[]) => sentenceText(en, find(inputOf(read({ blocks: [VISIT], entries })), "meaning:b1").sentence);
    const [before, given, juice] = PRAN_LINES;
    const again = line("e6", "b1", "Given - 500", "supplier_payment", { amount: "500" });
    expect(sentence([before, given, again, juice])).toBe("Selim came from Praan. You owed ৳2,800 before, and paid ৳2,000 this time. Did I get that right?");
    expect(sentence([before, juice])).toBe("Selim came from Praan. You owed ৳2,800 before. Did I get that right?");
    expect(sentence([given, juice])).toBe("Selim came from Praan. You paid ৳1,500 this time. Did I get that right?");
    expect(sentence([juice])).toBe("Selim came from Praan, a company you buy from. Did I get that right?");
    const noRep = find(inputOf(read({ blocks: [{ ...VISIT, person: null }], entries: [before, juice] })), "meaning:b1");
    expect(sentenceText(bn, noRep.sentence)).toBe("Praan কোম্পানি থেকে লোক এসেছিল। আগে দেনা ছিল ৳২,৮০০। ঠিক বুঝেছি?");
  });

  test("three goods with no price are one question, with no proposed answer", () => {
    const q = find(start, "delivery:b1");
    expect(q.entries).toEqual(["r3", "r4", "r5"]);
    expect(q.proposed).toBeNull();
    expect(q.input?.kind).toBe("money");
    expect(sentenceText(bn, q.sentence)).toBe("Selim (Praan) ৩টা মাল দিয়ে গেছেন, দাম লেখা নেই। সব মিলিয়ে কত ছিল?");
    expect(sentenceText(en, q.why!.sentence)).toBe("Check the company's memo if you have it. Scriba won't guess a price.");
    expect(sentenceText(bn, q.options.find((o) => o.later)!.label)).toBe("পরে দেব");
  });

  test("seven type cards become one: were these sales all cash?", () => {
    const q = find(start, "kind:b2");
    expect(q.entries).toEqual(["r6", "r7", "r8"]);
    expect(q.options.map((o) => o.id)).toEqual(["cash", "each"]); // no names, so not "all on credit"
    expect(sentenceText(en, q.sentence)).toBe("Were these 3 sales all cash?");
    expect(sentenceText(bn, q.why!.sentence)).toBe("পাতায় নগদ বা বাকি লেখা নেই।");
    expect(sentenceText(bn, q.options[1]!.label)).toBe("কিছু বাকিতে");
  });

  test("confirming the visit is remembered on the page and not asked again", () => {
    const next = answer(start, "meaning:b1", { option: "yes" });
    expect(ids(next)).not.toContain("meaning:b1");
    expect(next.page.answers).toEqual([{ q: "meaning:b1", fp: find(start, "meaning:b1").fp, a: "yes", at: NOW.toISOString() }]);
    expect(next.rows).toEqual(start.rows);
  });

  test("a delivery total becomes one line; the unpriced lines are set aside, and code works out the due", () => {
    const next = answer(start, "delivery:b1", { value: "3450" });
    const added = next.rows.find((r) => r.id === "new-1")!;
    expect(added.values).toMatchObject({ type: "credit_purchase", amountText: "3450", block: "b1", item: "Juice, Buiscite, Conacor" });
    expect(added.values.sourceText).toBe("Juice 1 Box + Buiscite 2 Box + Conacor - 1 Box");
    expect(next.rows.map((r) => [r.id, r.status])).toEqual([
      ["r1", "draft"], ["r2", "draft"], ["r3", "rejected"], ["r4", "rejected"], ["r5", "rejected"], ["new-1", "draft"],
      ["r6", "draft"], ["r7", "draft"], ["r8", "draft"],
    ]);
    const balance = findings(next).find((f) => f.ruleId === "balance_equation" && f.block === "b1")!;
    expect(balance.reason).toBe("no_closing");
    expect(balance.expected).toBe(475_000); // 2,800 − 1,500 + 3,450
    expect(ids(next)).toEqual(["meaning:b1", "kind:b2", "date"]);
  });

  test("“I'll price each one” asks line by line instead", () => {
    const next = answer(start, "delivery:b1", { option: "each" });
    expect(ids(next)).toEqual(["meaning:b1", "price:r3", "price:r4", "price:r5", "kind:b2", "date"]);
    const priced = answer(next, "price:r3", { value: "৫৫০" });
    expect(row(priced, "r3").values.amountText).toBe("৫৫০");
    expect(ids(priced)).not.toContain("price:r3");
  });

  test("“later” puts the question aside, not away", () => {
    const next = answer(start, "delivery:b1", { option: "later" });
    const set = buildQuestions(next);
    expect(set.questions.map((q) => q.id)).toEqual(["meaning:b1", "kind:b2", "date"]);
    expect(set.later.map((q) => q.id)).toEqual(["delivery:b1"]);
    const back = answer(next, "delivery:b1", { value: "3450" });
    expect(buildQuestions(back).later).toEqual([]);
  });

  test("“all cash” sets every unread sale; “some on credit” asks line by line", () => {
    const cash = answer(start, "kind:b2", { option: "cash" });
    expect(["r6", "r7", "r8"].map((id) => row(cash, id).values.type)).toEqual(["cash_sale", "cash_sale", "cash_sale"]);
    expect(ids(cash)).toEqual(["meaning:b1", "delivery:b1", "date"]);

    const each = answer(start, "kind:b2", { option: "each" });
    expect(ids(each)).toEqual(["meaning:b1", "delivery:b1", "direction:r6", "direction:r7", "direction:r8", "date"]);
    const q = find(each, "direction:r6");
    expect(q.options.map((o) => o.value)).toEqual(["cash_sale", "credit_sale", "repayment"]);
    expect(q.proposed).toBeNull();
    const one = answer(each, "direction:r6", { option: "type:credit_sale" });
    expect(row(one, "r6").values.type).toBe("credit_sale");
    expect(ids(one)).not.toContain("kind:b2"); // still line by line after one is answered
  });

  test("no date: the photo's day is proposed; the day before is written in a form the date reader takes", () => {
    const q = find(start, "date");
    expect(q.proposed).toBe("photo");
    expect(sentenceText(en, q.sentence)).toBe("There's no date on this page. Shall I use the day the photo was taken?");
    expect(sentenceText(bn, q.options[0]!.label)).toBe("হ্যাঁ, ছবির দিন · ১ নভেম্বর");
    expect(sentenceText(bn, q.options[1]!.label)).toBe("আগের দিন · ৩১ অক্টোবর");
    const before = answer(start, "date", { option: "before" });
    expect(before.page.dateText).toBe("31/10/2026");
    expect(parseWrittenDate(before.page.dateText, new Date("2026-11-01T06:00:00Z"))).toBe("2026-10-31");
    expect(writtenDay("2026-01-05")).toBe("5/1/2026");
    expect(ids(answer(start, "date", { option: "photo" }))).not.toContain("date");
  });

  test("with no photo day there is nothing to propose: he says which day", () => {
    const q = find({ ...start, capturedOn: null }, "date");
    expect(q.options).toEqual([]);
    expect(q.proposed).toBeNull();
    expect(sentenceText(en, q.sentence)).toBe("There's no date on this page. Which day is it from?");
  });

  test("a typed date must be one the date reader understands", () => {
    const q = find(start, "date");
    expect(answerQuestion(start, "date", q.fp, { value: "কাল" }, NOW)).toEqual({ ok: false, error: "bad_value" });
    expect(answer(start, "date", { value: "৩০ অক্টো" }).page.dateText).toBe("৩০ অক্টো");
  });

  test("after every answer, the lines can be confirmed by the approval rules unchanged", () => {
    let s = answer(start, "meaning:b1", { option: "yes" });
    s = answer(s, "delivery:b1", { value: "3450" });
    s = answer(s, "kind:b2", { option: "cash" });
    s = answer(s, "date", { option: "photo" });
    expect(ids(s)).toEqual([]);
    const input = toValidationInput({ page: { values: s.page, version: 1, reviewStartedAt: null }, rows: s.rows });
    const all = validateLedger(input);
    for (const e of input.entries.filter((x) => !x.excluded)) {
      expect(decideApproval(e, all, { findings: [], uncheckable: true })).toEqual({ ok: true });
    }
  });
});

describe("a name that may already be in the book", () => {
  const pran: KnownParty = { id: "p1", kind: "supplier", name: "প্রাণ", key: normalizePartyName("প্রাণ")! };

  test("“Praan” may be প্রাণ: asked right after the visit, and yes takes the book's name", () => {
    const start = inputOf(read(), { parties: [pran] });
    expect(ids(start).slice(0, 2)).toEqual(["meaning:b1", "party:b1"]);
    const q = find(start, "party:b1");
    expect(sentenceText(bn, q.sentence)).toBe("“Praan” কি আপনার খাতার “প্রাণ”?");
    expect(q.options.map((o) => sentenceText(en, o.label))).toEqual(["Yes, the same company", "No, a new supplier"]);
    expect(q.why).toBeNull(); // the khata's due wasn't loaded
    expect(q.proposed).toBeNull();
    const yes = answer(answer(start, "meaning:b1", { option: "yes" }), "party:b1", { option: "party:p1" });
    expect(yes.page.blocks?.[0]?.party).toBe("প্রাণ");
    expect(ids(yes).slice(0, 1)).toEqual(["delivery:b1"]); // the visit stays confirmed
  });

  test("why: the khata's last due, and whether this page's “before” is the same", () => {
    const base = inputOf(read(), { parties: [pran] });
    expect(bookPartiesOf(base)).toEqual(["p1"]);
    const why = (due: number) => {
      const q = find({ ...base, dues: new Map([["p1", due]]) }, "party:b1");
      return [sentenceText(en, q.why!.sentence), sentenceText(bn, q.why!.sentence), q.why!.verified];
    };
    expect(why(280_000)).toEqual([
      "Your khata last showed ৳2,800 owed to them. This page's “before” is also ৳2,800.",
      "খাতায় তাদের কাছে শেষ দেনা ছিল ৳২,৮০০। এই পাতার “আগের” লেখাও ৳২,৮০০।",
      true, // code checked it: the screen shows a tick
    ]);
    expect(why(310_000)).toEqual(["Your khata last showed ৳3,100 owed to them.", "খাতায় তাদের কাছে শেষ দেনা ছিল ৳৩,১০০।", false]);
    expect(find({ ...base, dues: new Map([["p1", 0]]) }, "party:b1").why).toBeNull(); // nothing owed says nothing
  });

  test("two names that both sound alike are a choice by name, with no why", () => {
    const pran2: KnownParty = { id: "p2", kind: "supplier", name: "Pran", key: normalizePartyName("Pran")! };
    const input = inputOf(read(), { parties: [pran, pran2] });
    const q = find({ ...input, dues: new Map([["p1", 280_000]]) }, "party:b1");
    expect(q.options.map((o) => sentenceText(en, o.label))).toEqual(["প্রাণ", "Pran", "No, a new supplier"]);
    expect(q.why).toBeNull();
    expect(bookPartiesOf(input)).toEqual([]);
  });

  test("a customer's name gets a customer's words", () => {
    const karim: KnownParty = { id: "c1", kind: "customer", name: "করিম", key: normalizePartyName("করিম")! };
    const entries = [line("e1", "b1", "Karim 300", "credit_sale", { customer: "Karim", amount: "300" }), line("e2", "b1", "ডাল ১২০", "cash_sale", { amount: "১২০" })];
    const input = inputOf(read({ blocks: [{ ...SALES, id: "b1" }], entries, date: "1/11/26" }), { parties: [karim] });
    const [id] = bookPartiesOf(input);
    expect(id).toBe("c1");
    const q = buildQuestions({ ...input, dues: new Map([["c1", 150_000]]) }).questions.find((x) => x.kind === "same_party")!;
    expect(q.options.map((o) => sentenceText(en, o.label))).toEqual(["Yes, the same person", "No, a new customer"]);
    expect(sentenceText(bn, q.why!.sentence)).toBe("খাতায় তাদের শেষ বাকি ছিল ৳১,৫০০।");
  });

  test("no keeps the new name and isn't asked again", () => {
    const start = inputOf(read(), { parties: [pran] });
    expect(ids(answer(start, "party:b1", { option: "no" }))).not.toContain("party:b1");
  });

  test("a customer of the same name is a different party", () => {
    const start = inputOf(read(), { parties: [{ ...pran, kind: "customer" }] });
    expect(ids(start)).not.toContain("party:b1");
  });

  test("names are matched across scripts, and short names one letter apart are not", () => {
    expect(romanize("প্রাণ")).toBe("pran");
    expect(romanize("Praan")).toBe("pran");
    expect(soundsAlike("Praan", "প্রাণ")).toBe(true);
    expect(soundsAlike("Fresh", "ফ্রেশ")).toBe(true);
    expect(soundsAlike("Aarong", "আড়ং")).toBe(true);
    expect(soundsAlike("Karim", "করিম")).toBe(true);
    expect(soundsAlike("সেলিম", "Selim")).toBe(true);
    expect(soundsAlike("Kamal", "কামাল")).toBe(true);
    expect(soundsAlike("রহিম", "করিম")).toBe(false);
    expect(soundsAlike("মোঃ করিম ভাই", "করীম")).toBe(false); // the same key: already one party
    expect(soundsAlike("Fresh", "Pran")).toBe(false);
  });
});

describe("the khata's due as “before” (T3)", () => {
  // Shaped like the five-page test's second page, written for the test: Karim paid ৳200 with no
  // "before" written, and Fresh's Kamal came with "before ২৬০০" (the khata has ৳1,600).
  const KARIM = { id: "b1", kind: "customer_account", title: "করিম", party: "করিম", person: null, date_text: null, box: null };
  const FRESH = { id: "b2", kind: "supplier_visit", title: "ফ্রেশের কামাল", party: "ফ্রেশ", person: "কামাল", date_text: null, box: null };
  const LINES = [
    line("e1", "b1", "করিম জমা ২০০", "repayment", { amount: "২০০" }),
    line("e2", "b2", "আগের ২৬০০", "opening_balance", { amount: "২৬০০" }),
    line("e3", "b2", "দিলাম ১০০০", "supplier_payment", { amount: "১০০০" }),
  ];
  const karim: KnownParty = { id: "c1", kind: "customer", name: "করিম", key: normalizePartyName("করিম")! };
  const fresh: KnownParty = { id: "s1", kind: "supplier", name: "ফ্রেশ", key: normalizePartyName("ফ্রেশ")! };
  const page = (dues: Array<[string, number]>, o: { blocks?: unknown[]; parties?: KnownParty[] } = {}) => ({
    ...inputOf(read({ blocks: o.blocks ?? [KARIM, FRESH], entries: LINES, date: "2/11/26" }), { parties: o.parties ?? [karim, fresh] }),
    dues: new Map(dues),
  });

  test("each account part's party in the book is named for its due, before anything is asked", () => {
    expect(bookPartiesOf(page([]))).toEqual(["c1", "s1"]);
    expect(bookPartiesOf(page([], { parties: [fresh] }))).toEqual(["s1"]);
    expect(bookPartiesOf(page([], { parties: [] }))).toEqual([]);
  });

  test("no “before” written: the khata's ৳260 is proposed, and yes adds it as the part's first line", () => {
    const start = page([["c1", 26_000], ["s1", 260_000]]);
    expect(ids(start)).toEqual(["meaning:b1", "opening:b1", "meaning:b2"]);
    const q = find(start, "opening:b1");
    expect(sentenceText(bn, q.sentence)).toBe("খাতায় করিম-এর বাকি ৳২৬০ — এই পাতার আগে এটাই ছিল?");
    expect(sentenceText(en, q.sentence)).toBe("The khata shows করিম owing ৳260. Was that it before this page?");
    expect(q.proposed).toBe("book");
    expect(q.options.map((o) => sentenceText(bn, o.label))).toEqual(["হ্যাঁ, ৳২৬০", "পরে বলব"]);
    expect(sentenceText(en, q.input!.label!)).toBe("A different amount");
    expect(sentenceText(bn, q.why!.sentence)).toBe("অন্য টাকা দিলে খাতা সেই টাকায় ঠিক করা হবে, আর ঠিক করাটা খাতায় দেখা যাবে।");
    expect(q.why!.verified).toBe(false);

    const yes = answer(start, "opening:b1", { option: "book" });
    const added = yes.rows.find((r) => r.id.startsWith("new-"))!;
    expect(added.values).toMatchObject({ type: "opening_balance", amountText: "260", block: "b1" });
    expect(added.lineOrder).toBeLessThan(row(yes, "r1").lineOrder);
    expect(ids(yes)).toEqual(["meaning:b1", "meaning:b2"]);
  });

  test("a different amount is his: kept as given, and not compared with the khata again", () => {
    const start = page([["c1", 26_000]]);
    const other = answer(start, "opening:b1", { value: "৩০০" });
    expect(other.rows.find((r) => r.id.startsWith("new-"))!.values).toMatchObject({ type: "opening_balance", amountText: "৩০০" });
    expect(ids(other).filter((id) => id.endsWith("b1") || id.startsWith("book_differs"))).toEqual(["meaning:b1"]);
  });

  test("nothing owed in the khata: “No, nothing” is proposed", () => {
    const q = find(page([["c1", 0]]), "opening:b1");
    expect(sentenceText(bn, q.sentence)).toBe("খাতায় করিম-এর কোনো বাকি নেই — এই পাতার আগেও কিছু ছিল না?");
    expect(q.proposed).toBe("book");
    expect(sentenceText(en, q.options[0]!.label)).toBe("No, nothing");
    expect(q.options[0]!.changes).toMatchObject([{ op: "add", values: { amountText: "0" } }]);
  });

  test("nothing in the khata before the page, or paid ahead: asked as before T3", () => {
    for (const dues of [[], [["c1", -5_000]]] as Array<Array<[string, number]>>) {
      const q = find(page(dues), "opening:b1");
      expect(sentenceText(bn, q.sentence)).toBe("এর আগে করিম-এর কোনো বাকি ছিল?");
      expect(q.options.map((o) => o.id)).toEqual(["none", "later"]);
      expect(q.proposed).toBeNull();
      expect(q.why).toBeNull();
    }
  });

  test("a written “before” equal to the khata: a ticked line on the visit's card, nothing more to ask", () => {
    const start = page([["s1", 260_000]]);
    const q = find(start, "meaning:b2");
    expect(q.why).toEqual({ sentence: { key: "q.book.match", args: [{ money: 260_000 }] }, verified: true });
    expect(sentenceText(bn, q.why!.sentence)).toBe("খাতার সাথে মিলেছে: আগের ৳২,৬০০");
    expect(ids(start).some((id) => id.startsWith("book_differs"))).toBe(false);
  });

  test("a written “before” that differs: which is right, the page or the khata?", () => {
    const start = page([["s1", 160_000]]);
    expect(ids(start)).toEqual(["meaning:b1", "opening:b1", "meaning:b2", "book_differs:r2"]);
    const q = find(start, "book_differs:r2");
    expect(sentenceText(bn, q.sentence)).toBe("পাতায় আগের ৳২,৬০০, খাতায় ৳১,৬০০ — কোনটা ঠিক?");
    expect(sentenceText(en, q.sentence)).toBe("The page says ৳2,600 before, the khata ৳1,600. Which is right?");
    expect(q.options.map((o) => sentenceText(en, o.label))).toEqual(["Page: ৳2,600", "Khata: ৳1,600"]);
    expect(sentenceText(bn, q.options[0]!.detail!)).toBe("খাতা ৳১,০০০ বাড়িয়ে ঠিক করা হবে");
    expect(q.proposed).toBeNull(); // Scriba doesn't know which: he looks at the writing
    expect(q).toMatchObject({ entry: "r2", field: "amount", entries: ["r2"], input: { kind: "money", target: { to: "entry", entry: "r2", field: "amount" } } });
    expect(find(start, "meaning:b2").why).toBeNull();

    // The khata's: the line becomes ৳1,600, which the visit's card then ticks.
    const book = answer(start, "book_differs:r2", { option: "book" });
    expect(row(book, "r2").values.amountText).toBe("1600");
    expect(ids(book)).not.toContain("book_differs:r2");
    expect(find(book, "meaning:b2").why?.verified).toBe(true);

    // The page's: kept as written (an adjustment once confirmed), and not asked again.
    const kept = answer(start, "book_differs:r2", { option: "page" });
    expect(row(kept, "r2").values.amountText).toBe("২৬০০");
    expect(row(kept, "r2").reviewFields).not.toContain("amount");
    expect(ids(kept)).not.toContain("book_differs:r2");

    // Typed: what he typed, and not asked again either.
    const typed = answer(start, "book_differs:r2", { value: "২১০০" });
    expect(row(typed, "r2").values.amountText).toBe("২১০০");
    expect(ids(typed)).not.toContain("book_differs:r2");
  });

  test("a khata below the page's “before”: keeping the page brings it down", () => {
    const q = find(page([["s1", 300_000]]), "book_differs:r2");
    expect(sentenceText(en, q.options[0]!.detail!)).toBe("The khata is corrected down ৳400");
  });

  test("“same party?” yes: the part is then compared with the party it was matched to", () => {
    const named = [KARIM, { ...FRESH, party: "Fresh" }];
    const start = page([["s1", 160_000]], { blocks: named });
    expect(bookPartiesOf(start)).toEqual(["c1", "s1"]); // s1 through the "same party?" question
    expect(ids(start)).toContain("party:b2");
    expect(ids(start)).not.toContain("book_differs:r2");
    const yes = answer(answer(start, "meaning:b2", { option: "yes" }), "party:b2", { option: "party:s1" });
    expect(yes.page.blocks?.[1]?.party).toBe("ফ্রেশ");
    expect(ids(yes)).toContain("book_differs:r2");
  });

  test("a spelling merged into another party is in the book: its due, the khata's name, no “same party?”", () => {
    const alias: KnownParty = { id: "c9", kind: "customer", name: "Karim", key: normalizePartyName("Karim")!, mergedInto: "c1" };
    const start = page([["c9", 26_000]], { blocks: [{ ...KARIM, party: "Karim" }, FRESH], parties: [karim, alias, fresh] });
    expect(bookPartiesOf(start)).toEqual(["c9", "s1"]);
    expect(ids(start)).not.toContain("party:b1");
    expect(sentenceText(en, find(start, "opening:b1").sentence)).toBe("The khata shows করিম owing ৳260. Was that it before this page?");
    // Never offered as a match for a new name.
    const other = page([], { blocks: [{ ...KARIM, party: "Kareem" }, FRESH], parties: [alias, fresh] });
    expect(ids(other)).not.toContain("party:b1");
  });

  test("an answer is checked against the khata as it is now: a due that changed since makes it stale", () => {
    const shown = find(page([["c1", 26_000]]), "opening:b1");
    expect(answerQuestion(page([["c1", 30_000]]), "opening:b1", shown.fp, { option: "book" }, NOW)).toEqual({ ok: false, error: "stale" });
  });
});

describe("readings the model doubted", () => {
  const doubts = [{ entry: "e6", field: "amount", options: ["২৪০"], note: "১ or ২" }];

  test("two readings are a choice, the model's own first, with no proposal", () => {
    const start = inputOf(read({ doubts }));
    const q = find(start, "doubt:r6:amount");
    expect(q.options.map((o) => o.value)).toEqual(["১৪০", "২৪০"]);
    expect(q.proposed).toBeNull();
    expect(sentenceText(bn, q.options[1]!.label)).toBe("৳২৪০");
    expect(sentenceText(en, q.sentence)).toBe("“চাল 2 কেজি 140”: which amount is written?"); // digits follow the language
  });

  test("each reading of an amount shows what it comes to per unit, so ৳90 for six eggs reads apart from ৳10", () => {
    const eggs = line("e7", "b2", "ডিম ৬ ৯০", "cash_sale", { item: "ডিম", qty: "৬", amount: "৯০" });
    const input = inputOf(read({ entries: [...PRAN_LINES, SALES_LINES[0]!, eggs], doubts: [{ entry: "e7", field: "amount", options: ["১০"], note: null }] }));
    const q = find(input, "doubt:r7:amount");
    expect(q.options.map((o) => sentenceText(bn, o.detail!))).toEqual(["৬টা, ৳১৫ করে", "৬টা, ৳১.৬৭ করে"]);
    expect(q.options.map((o) => sentenceText(en, o.detail!))).toEqual(["6 at ৳15 each", "6 at ৳1.67 each"]);
    const rice = find(inputOf(read({ doubts })), "doubt:r6:amount");
    expect(rice.options.map((o) => sentenceText(en, o.detail!))).toEqual(["2 কেজি at ৳70 per কেজি", "2 কেজি at ৳120 per কেজি"]);
    expect(sentenceText(bn, rice.options[0]!.detail!)).toBe("২ কেজি, প্রতি কেজি ৳৭০");
    const noQty = find(inputOf(read({ doubts: [{ entry: "e8", field: "amount", options: ["১৩০"], note: null }] })), "doubt:r8:amount");
    expect(noQty.options.every((o) => o.detail === undefined)).toBe(true);
  });

  test("choosing the other reading changes the line and clears the doubt", () => {
    const next = answer(inputOf(read({ doubts })), "doubt:r6:amount", { option: "value:1" });
    expect(row(next, "r6").values.amountText).toBe("২৪০");
    expect(row(next, "r6").reviewFields).toEqual([]);
    expect(ids(next)).not.toContain("doubt:r6:amount");
  });

  test("keeping the model's reading marks it checked", () => {
    const next = answer(inputOf(read({ doubts })), "doubt:r6:amount", { option: "value:0" });
    expect(row(next, "r6").values.amountText).toBe("১৪০");
    expect(row(next, "r6").reviewFields).toEqual([]);
  });

  test("an unsure value with no other reading is a one-tap “right?”", () => {
    const entries = [...PRAN_LINES, { ...SALES_LINES[0]!, review: ["amount"] }];
    const q = find(inputOf(read({ entries })), "doubt:r6:amount");
    expect(q.proposed).toBe("value:0");
    expect(sentenceText(bn, q.sentence)).toBe("“চাল ২ কেজি ১৪০” — ৳১৪০ পড়েছি, ঠিক?");
  });

  test("an amount that isn't a number can only be typed", () => {
    const entries = [...PRAN_LINES, { ...SALES_LINES[0]!, amount: "১৪o" }];
    const start = inputOf(read({ entries }));
    const q = find(start, "doubt:r6:amount");
    expect(q.options).toEqual([]);
    expect(sentenceText(en, q.sentence)).toBe("“চাল 2 কেজি 140”: the amount can't be read as a number. What is written?");
    expect(answerQuestion(start, q.id, q.fp, { value: "abc" }, NOW)).toEqual({ ok: false, error: "bad_value" });
    expect(row(answer(start, q.id, { value: "140" }), "r6").values.amountText).toBe("140");
  });

  test("a doubt about the kind of line uses the model's readings", () => {
    const entries = [PRAN_LINES[0]!, { ...PRAN_LINES[1]!, review: ["type"] }];
    const start = inputOf(read({ entries, doubts: [{ entry: "e2", field: "type", options: ["repayment"], note: null }] }));
    const q = find(start, "direction:r2");
    expect(q.proposed).toBe("type:supplier_payment");
    expect(q.options.map((o) => o.value)).toEqual(["supplier_payment", "repayment", "opening_balance", "credit_purchase"]);
    expect(sentenceText(bn, q.sentence)).toBe("“Given - ১৫০০” — Selim (Praan)-কে ৳১,৫০০ দিয়েছেন, ঠিক?");
    expect(sentenceText(en, q.sentence)).toBe("“Given - 1500”: you paid Selim (Praan) ৳1,500. Right?");
    const kept = answer(start, "direction:r2", { option: "type:supplier_payment" });
    expect(row(kept, "r2").reviewFields).toEqual([]);
    expect(ids(kept)).not.toContain("direction:r2");
  });
});

describe("a company visit read wrong", () => {
  // The V02 photo: "আগের ১৬০০" was read as আজকের and left with no kind.
  const FRESH = { ...VISIT, title: "ফ্রেশের কামাল", party: "ফ্রেশ", person: "কামাল" };
  const lines = [
    line("e1", "b1", "আজকের ১৬০০", "unknown", { amount: "১৬০০" }),
    line("e2", "b1", "১০০০ টাকা দিলাম", "supplier_payment", { amount: "১০০০" }),
  ];

  test("a line with no kind is asked which way it went; then the balance runs", () => {
    const start = inputOf(read({ blocks: [FRESH], entries: lines, date: "1/11/26" }));
    expect(ids(start)).toEqual(["meaning:b1", "direction:r1"]); // not "opening" while a line has no kind
    const q = find(start, "direction:r1");
    expect(q.options.map((o) => o.value)).toEqual(["opening_balance", "supplier_payment", "credit_purchase", "closing_balance"]);
    expect(sentenceText(bn, q.sentence)).toBe("“আজকের ১৬০০” — এই লাইনটা কী?");
    const next = answer(start, "direction:r1", { option: "type:opening_balance" });
    expect(ids(next)).toEqual(["meaning:b1"]);
    expect(findings(next).find((f) => f.ruleId === "balance_equation")?.expected).toBe(60_000);
  });

  test("with no “due before” at all, Scriba asks for it and adds the line at the top of the block", () => {
    const start = inputOf(read({ blocks: [SALES, FRESH], entries: [{ ...SALES_LINES[0]!, line: 1 }, { ...lines[1]!, line: 2 }], date: "1/11/26" }));
    const q = find(start, "opening:b1");
    expect(sentenceText(bn, q.sentence)).toBe("এর আগে কামাল (ফ্রেশ)-এর কাছে কোনো দেনা ছিল?");
    const next = answer(start, "opening:b1", { value: "১৬০০" });
    expect(next.rows.map((r) => r.id)).toEqual(["r1", "new-1", "r2"]);
    expect(row(next, "new-1").values).toMatchObject({ type: "opening_balance", amountText: "১৬০০", block: "b1", sourceText: "" });
    expect(ids(next)).not.toContain("opening:b1");
    const none = answer(start, "opening:b1", { option: "none" });
    expect(row(none, "new-1").values.amountText).toBe("0");
  });

  test("a block with no name asks whose it is; “প্রাণ (সেলিম)” is the company and its rep", () => {
    const start = inputOf(read({ blocks: [{ ...VISIT, title: null, party: null, person: null }], entries: lines, date: "1/11/26" }));
    const q = find(start, "meaning:b1");
    expect(sentenceText(en, q.sentence)).toBe("Whose account is this part of the page? Say the name.");
    expect(q.proposed).toBeNull();
    const named = answer(start, "meaning:b1", { value: "প্রাণ (সেলিম)" });
    expect(named.page.blocks?.[0]).toMatchObject({ party: "প্রাণ", person: "সেলিম" });
    expect(ids(named)).not.toContain("meaning:b1");
  });

  test("saying it is a customer's account changes the block, and the new reading counts as confirmed", () => {
    const start = inputOf(read({ blocks: [FRESH], entries: lines, date: "1/11/26" }));
    const next = answer(start, "meaning:b1", { option: "kind:customer_account" });
    expect(next.page.blocks?.[0]?.kind).toBe("customer_account");
    expect(ids(next)).not.toContain("meaning:b1");
    expect(ids(next)).toContain("direction:r2"); // a payment to a supplier in a customer's account
  });
});

describe("a part that may be two (T2)", () => {
  // Shaped like the five-page test's first page (written for the test, not his data): Karim's
  // account with its total, then a separate sale just below with its own, read as one part; and
  // the day's sales after it. Each total checks, so the sums can't show it.
  const KARIM = { id: "b1", kind: "customer_account", title: "করিম বাকি", party: "করিম", person: null, date_text: "২/১১", box: null };
  const DAY = { ...SALES, id: "b2" };
  const lines = [
    line("e1", "b1", "চাল ১৬০", "credit_sale", { item: "চাল", amount: "১৬০" }),
    line("e2", "b1", "ডাল ১০০", "credit_sale", { item: "ডাল", amount: "১০০" }),
    line("e3", "b1", "মোট ২৬০", "subtotal", { amount: "২৬০" }),
    line("e4", "b1", "আটা ১২০", "credit_sale", { item: "আটা", amount: "১২০" }),
    line("e5", "b1", "লবণ ৩০", "credit_sale", { item: "লবণ", amount: "৩০" }),
    line("e6", "b1", "ডিম ১০০", "credit_sale", { item: "ডিম", amount: "১০০" }),
    line("e7", "b1", "মোট ২৫০", "subtotal", { amount: "২৫০" }),
    line("e8", "b2", "চা ২০", "cash_sale", { item: "চা", amount: "২০" }),
  ];
  const start = inputOf(read({ blocks: [KARIM, DAY], entries: lines, date: "2/11/26" }));
  const blockOf = (input: QuestionInput) => Object.fromEntries(input.rows.map((r) => [r.id, r.values.block]));
  const total = (input: QuestionInput, id: string) => findings(input).find((f) => f.ruleId === "written_total" && f.entryIds.includes(id));

  test("code asks right after the part's meaning, with the count and the sum it worked out", () => {
    expect(ids(start).slice(0, 2)).toEqual(["meaning:b1", "split:b1"]);
    const q = find(start, "split:b1");
    expect(sentenceText(bn, q.sentence)).toBe("“মোট ২৬০”-এর পরের ৩টা লাইন (৳২৫০) কি করিম-এরই?");
    expect(sentenceText(en, q.sentence)).toBe("Are the 3 lines after “মোট 260” (৳250) করিম's too?");
    expect(q.options.map((o) => o.id)).toEqual(["yes", "apart"]);
    expect(q.options[1]!.detail).toEqual({ key: "q.split.sale.cash" });
    expect(q.proposed).toBeNull(); // he chooses: Scriba doesn't know
    expect(q.input?.label).toEqual({ key: "q.split.other.customer" });
    expect(q.entries).toEqual(["r3", "r4", "r5", "r6", "r7"]); // the first total, and the lines after it
  });

  test("“a separate sale”: Karim's part keeps 3 lines, and the new day's sales part checks", () => {
    const next = answer(start, "split:b1", { option: "apart" });
    expect(next.page.blocks?.map((b) => [b.id, b.kind])).toEqual([
      ["b1", "customer_account"],
      ["b3", "day_sales"],
      ["b2", "day_sales"],
    ]);
    expect(next.page.blocks?.[1]).toMatchObject({ party: null, title: null, dateText: "২/১১" });
    expect(blockOf(next)).toMatchObject({ r1: "b1", r2: "b1", r3: "b1", r4: "b3", r5: "b3", r6: "b3", r7: "b3", r8: "b2" });
    // A sale on nobody's account was paid then and there.
    expect(["r4", "r5", "r6"].map((id) => row(next, id).values.type)).toEqual(["cash_sale", "cash_sale", "cash_sale"]);
    expect(total(next, "r7")).toMatchObject({ status: "pass", block: "b3" });
    expect(total(next, "r3")).toMatchObject({ status: "pass" });
    expect(ids(next)).not.toContain("split:b1");
    expect(next.page.answers?.find((a) => a.q === "split:b1")?.a).toBe("apart");
  });

  test("“yes, Karim's” changes nothing and isn't asked again", () => {
    const next = answer(start, "split:b1", { option: "yes" });
    expect(next.rows).toEqual(start.rows);
    expect(next.page.blocks).toEqual(start.page.blocks);
    expect(ids(next)).not.toContain("split:b1");
  });

  test("someone else's account: the name he gives makes their part, and Scriba asks what it is as usual", () => {
    const next = answer(start, "split:b1", { value: "রহিম" });
    expect(next.page.blocks?.[1]).toMatchObject({ id: "b3", kind: "customer_account", party: "রহিম" });
    expect(row(next, "r4").values.type).toBe("credit_sale");
    expect(ids(next)).toContain("meaning:b3");
    expect(ids(next)).toContain("opening:b3");
  });

  test("not asked with one total, when the lines after it name someone, or on a company visit", () => {
    const one = inputOf(read({ blocks: [KARIM, DAY], entries: lines.slice(0, 6).concat(lines[7]!), date: "2/11/26" }));
    expect(ids(one)).not.toContain("split:b1");
    const named = inputOf(read({ blocks: [KARIM, DAY], entries: lines.map((l) => (l.id === "e5" ? { ...l, customer: "করিম" } : l)), date: "2/11/26" }));
    expect(ids(named)).not.toContain("split:b1");
    const visit = inputOf(read({ blocks: [{ ...VISIT, id: "b1" }, DAY], entries: lines.map((l) => (l.type === "credit_sale" ? { ...l, type: "credit_purchase" } : l)), date: "2/11/26" }));
    expect(ids(visit)).not.toContain("split:b1");
  });

  test("a supplier's account gets a supplier's words: a separate purchase goes in as bought for cash", () => {
    const supplier = inputOf(
      read({
        blocks: [{ ...KARIM, kind: "supplier_account", title: "মামুন", party: "মামুন" }, DAY],
        entries: lines.map((l) => (l.type === "credit_sale" ? { ...l, type: "credit_purchase" } : l)),
        date: "2/11/26",
      }),
    );
    const q = find(supplier, "split:b1");
    expect(q.options.map((o) => sentenceText(bn, o.label))).toEqual(["হ্যাঁ, মামুন-এরই", "না, আলাদা কেনা"]);
    const next = answer(supplier, "split:b1", { option: "apart" });
    expect(next.page.blocks?.[1]?.kind).toBe("expenses");
    expect(row(next, "r4").values.type).toBe("purchase");
  });

  test("a separate part from any line but its part's first, through the same answers", () => {
    const q = splitHereQuestion(start, "r5")!;
    expect(q.id).toBe("split:b1:r5");
    expect(q.options.map((o) => o.id)).toEqual(["kind:day_sales", "kind:expenses", "kind:other"]);
    expect(sentenceText(bn, q.sentence)).toBe("এখান থেকে নিচের ৩টা লাইন কী?");
    expect(buildQuestions(start).questions.some((x) => x.id === q.id)).toBe(false); // never put to him unasked

    const other = answerQuestion(start, q.id, q.fp, { option: "kind:other" }, NOW);
    if (!other.ok) throw new Error(other.error);
    expect(blockOf({ ...start, ...other.after })).toMatchObject({ r4: "b1", r5: "b3", r6: "b3", r7: "b3", r8: "b2" });
    expect(row({ ...start, ...other.after }, "r5").values.type).toBe("credit_sale"); // "something else" keeps the kinds
    expect(other.after.page.answers?.at(-1)).toMatchObject({ q: "split:b1:r5", a: "kind:other" });

    const named = answerQuestion(start, q.id, q.fp, { value: "রহিম" }, NOW);
    if (!named.ok) throw new Error(named.error);
    expect(named.after.page.blocks?.[1]).toMatchObject({ kind: "customer_account", party: "রহিম" });

    // From where code asks, it's the same split as code's "a separate sale".
    const here = splitHereQuestion(start, "r4")!;
    const manual = answerQuestion(start, here.id, here.fp, { option: "kind:day_sales" }, NOW);
    const asked = answer(start, "split:b1", { option: "apart" });
    if (!manual.ok) throw new Error(manual.error);
    expect(manual.after.rows).toEqual(asked.rows);
    expect(manual.after.page.blocks).toEqual(asked.page.blocks);
  });

  test("refused at a part's first line, for another part's id, and over a line already in the khata", () => {
    expect(splitHereQuestion(start, "r1")).toBeNull();
    expect(splitHereQuestion(start, "r8")).toBeNull(); // the only line of its part
    // A "before" an answer added on top isn't the part's first written line.
    const opened = answer(start, "opening:b1", { option: "none" });
    expect(opened.rows[0]?.id).toBe("new-1");
    expect(splitHereQuestion(opened, "r1")).toBeNull();
    expect(splitHereQuestion(opened, "r2")?.entries).toEqual(["r2", "r3", "r4", "r5", "r6", "r7"]);
    expect(answerQuestion(start, "split:b1:r1", "00000000", { option: "kind:day_sales" }, NOW)).toEqual({ ok: false, error: "stale" });
    const q = splitHereQuestion(start, "r5")!;
    expect(answerQuestion(start, "split:b2:r5", q.fp, { option: "kind:day_sales" }, NOW)).toEqual({ ok: false, error: "stale" });
    const confirmed = { ...start, rows: start.rows.map((r) => (r.id === "r7" ? { ...r, status: "confirmed" as const } : r)) };
    expect(splitHereQuestion(confirmed, "r5")).toBeNull();
    expect(ids(confirmed)).not.toContain("split:b1");
    expect(answerQuestion(confirmed, q.id, q.fp, { option: "kind:day_sales" }, NOW)).toEqual({ ok: false, error: "stale" });
    // A rejected line stays where it was, and doesn't count as the part's first.
    const rejected = { ...start, rows: start.rows.map((r) => (r.id === "r1" ? { ...r, status: "rejected" as const } : r)) };
    expect(splitHereQuestion(rejected, "r2")).toBeNull();
    const full = { ...start, page: { ...start.page, blocks: [...start.page.blocks!, ...Array.from({ length: 28 }, (_, i) => ({ ...start.page.blocks![1]!, id: `x${i}` }))] } };
    expect(splitHereQuestion(full, "r5")).toBeNull();
    expect(ids(full)).not.toContain("split:b1");
  });

  test("a new part's id is one past the page's highest", () => {
    const page = { ...start.page, blocks: [...start.page.blocks!, { ...start.page.blocks![1]!, id: "b9" }] };
    const after = applyChanges({ page, rows: start.rows }, [{ op: "split", block: "b1", from: "r4", values: { kind: "other" } }]);
    expect(after.page.blocks?.map((b) => b.id)).toEqual(["b1", "b10", "b2", "b9"]);
    expect(pageValuesSchema.safeParse(after.page).success).toBe(true);
  });

  test("its sentences and options render in both languages", () => {
    const supplier = { ...start, page: { ...start.page, blocks: start.page.blocks!.map((b) => (b.id === "b1" ? { ...b, kind: "supplier_account" as const } : b)) } };
    const unread = { ...start, rows: start.rows.map((r) => (r.id === "r5" ? { ...r, values: { ...r.values, amountText: "?" } } : r)) };
    const qs = [find(start, "split:b1"), find(supplier, "split:b1"), find(unread, "split:b1"), splitHereQuestion(start, "r5")!];
    expect(sentenceText(en, qs[2]!.sentence)).toBe("Are the 3 lines after “মোট 260” করিম's too?");
    for (const q of qs) {
      const sentences = [q.sentence, q.why?.sentence, q.input?.label, ...q.options.flatMap((o) => [o.label, o.detail])].filter((s) => s != null);
      for (const i18n of [bn, en]) for (const s of sentences) expect(sentenceText(i18n, s)).not.toMatch(/\{\d\}|undefined|NaN/);
    }
  });
});

describe("sums that don't come out", () => {
  const lines = [
    line("e1", "b1", "Before - 2800", "opening_balance", { amount: "2800" }),
    line("e2", "b1", "Given - 1500", "supplier_payment", { amount: "1500" }),
    line("e3", "b1", "Now - 1400", "closing_balance", { amount: "1400" }),
  ];
  const start = inputOf(read({ blocks: [VISIT], entries: lines, date: "1/11/26" }));

  test("shows what code worked out and what is written", () => {
    const q = find(start, "off:balance_equation:r1,r2,r3:b1");
    expect(sentenceText(en, q.sentence)).toBe("It doesn't add up: the lines give ৳1,300, but ৳1,400 is written.");
    expect(q.options.map((o) => o.id)).toEqual(["use", "keep", "look"]);
    expect(q.proposed).toBeNull();
  });

  test("“use” writes code's figure on the closing line", () => {
    const next = answer(start, "off:balance_equation:r1,r2,r3:b1", { option: "use" });
    expect(row(next, "r3").values.amountText).toBe("1300");
    expect(findings(next).find((f) => f.ruleId === "balance_equation")?.status).toBe("pass");
  });

  test("“keep” accepts the problem as written, for the approval rules", () => {
    const next = answer(start, "off:balance_equation:r1,r2,r3:b1", { option: "keep" });
    expect(ids(next)).not.toContain("off:balance_equation:r1,r2,r3:b1");
    const accepted = [...acceptedFindings(next.page)];
    expect(accepted).toHaveLength(1);
    const input = toValidationInput({ page: { values: next.page, version: 1, reviewStartedAt: null }, rows: next.rows });
    const all = validateLedger(input);
    expect(decideApproval(input.entries[2]!, all, { findings: accepted, uncheckable: false })).toEqual({ ok: true });
  });

  test("“show me the lines” saves nothing", () => {
    const q = find(start, "off:balance_equation:r1,r2,r3:b1");
    expect(answerQuestion(start, q.id, q.fp, { option: "look" }, NOW)).toEqual({ ok: false, error: "local" });
  });
});

describe("answers are checked against the page as it is", () => {
  const start = inputOf(read());

  test("an answer to a question that changed since it was shown is stale", () => {
    const q = find(start, "kind:b2");
    const moved = applyChanges(start, [{ op: "edit", entry: "r6", values: { type: "cash_sale" } }]);
    expect(answerQuestion({ ...start, ...moved }, "kind:b2", q.fp, { option: "cash" }, NOW)).toEqual({ ok: false, error: "stale" });
    expect(answerQuestion(start, "nope", q.fp, { option: "cash" }, NOW)).toEqual({ ok: false, error: "stale" });
  });

  test("only the question's own options and inputs are accepted", () => {
    const q = find(start, "kind:b2");
    expect(answerQuestion(start, q.id, q.fp, { option: "credit" }, NOW)).toEqual({ ok: false, error: "unknown_option" });
    expect(answerQuestion(start, q.id, q.fp, { value: "100" }, NOW)).toEqual({ ok: false, error: "no_input" });
  });

  test("confirmed and crossed-out lines are not asked about", () => {
    const rows = start.rows.map((r) => (r.id === "r6" ? { ...r, status: "confirmed" as const } : r.id === "r7" ? { ...r, values: { ...r.values, crossedOut: true } } : r));
    expect(ids({ ...start, rows })).not.toContain("kind:b2"); // one unread sale left: asked on its own
    expect(ids({ ...start, rows })).toContain("direction:r8");
  });

  test("every change targets a line that is still open", () => {
    const set = buildQuestions(inputOf(read({ doubts: [{ entry: "e6", field: "amount", options: ["২৪০"], note: null }] })));
    const open = new Set(start.rows.map((r) => r.id));
    for (const q of set.questions) {
      for (const o of q.options) {
        for (const c of o.changes) if (c.op === "edit" || c.op === "reject") expect(open.has(c.entry)).toBe(true);
      }
    }
  });
});

describe("a page read without blocks (prompt 4)", () => {
  test("a customer's page asks a line with no kind among a customer's kinds", () => {
    const entries = [
      line("e1", "x", "করিম আগের ৫০০", "opening_balance", { amount: "৫০০" }),
      line("e2", "x", "চাল ১২০", "unknown", { item: "চাল", amount: "১২০" }),
    ];
    const x = read({ blocks: [], entries, date: "1/11/26", ledger: "customer_credit" });
    // Schema 3 always gives lines a block; a prompt 4 reading has none at all.
    const read3 = inputOf(x);
    const page: PageValues = { dateText: read3.page.dateText, ledgerType: "customer_credit", accountName: "করিম" };
    const input = { ...read3, page, rows: read3.rows.map((r) => ({ ...r, values: { ...r.values, block: null } })) };
    const q = find(input, "direction:r2");
    expect(q.options.map((o) => o.value)).toEqual(["opening_balance", "credit_sale", "repayment", "closing_balance"]);
  });
});

describe("answers on the page", () => {
  test("the page schema keeps them, and an older client's page edit doesn't erase them", () => {
    const record = { q: "meaning:b1", fp: "0a1b2c3d", a: "yes", at: NOW.toISOString() };
    const page = pageValuesSchema.parse({ dateText: null, ledgerType: "mixed", accountName: null, answers: [record] });
    expect(page.answers).toEqual([record]);
    const sent: PageValues = { dateText: "1/11", ledgerType: "mixed", accountName: null };
    expect(keepAnswers(sent, page)).toEqual({ ...sent, answers: [record] });
    expect(keepAnswers({ ...sent, answers: [] }, page)).toEqual({ ...sent, answers: [] });
  });

  test("the latest answer to a question replaces the one before", () => {
    const start = inputOf(read());
    const twice = answer(answer(start, "delivery:b1", { option: "later" }), "delivery:b1", { option: "each" });
    expect(twice.page.answers?.map((a) => [a.q, a.a])).toEqual([["delivery:b1", "each"]]);
  });
});

describe("spoken answers", () => {
  const start = inputOf(read({ doubts: [{ entry: "e6", field: "amount", options: ["২৪০"], note: null }] }));

  test("yes and no, in Bangla and English", () => {
    expect(readYesNo("হ্যাঁ")).toBe("yes");
    expect(readYesNo("হ্যা ঠিক আছে")).toBe("yes");
    expect(readYesNo("জি")).toBe("yes");
    expect(readYesNo("Yes, right.")).toBe("yes");
    expect(readYesNo("Han, thick,")).toBe("yes"); // Muse Voice on romanized হ্যাঁ ঠিক (live, 2 Nov)
    expect(readYesNo("No. That's not right.")).toBe("no");
    expect(readYesNo("না")).toBe("no");
    expect(readYesNo("ঠিক না")).toBe("no");
    expect(readYesNo("ঠিক নয়")).toBe("no");
    expect(readYesNo("ভুল হয়েছে")).toBe("no");
    expect(readYesNo("not right")).toBe("no");
    expect(readYesNo("জানি না")).toBeNull();
    expect(readYesNo("না, ঠিক আছে")).toBeNull();
    expect(readYesNo("")).toBeNull();
  });

  test("a yes confirms what Scriba proposed; a number picks the reading it names", () => {
    expect(spokenAnswer(find(start, "meaning:b1"), "হ্যাঁ ঠিক")).toEqual({ kind: "option", option: "yes" });
    expect(spokenAnswer(find(start, "meaning:b1"), "না")).toEqual({ kind: "no" });
    expect(spokenAnswer(find(start, "doubt:r6:amount"), "দুশো চল্লিশ")).toEqual({ kind: "option", option: "value:1" });
    expect(spokenAnswer(find(start, "doubt:r6:amount"), "একশো পঞ্চাশ")).toEqual({ kind: "value", value: "150" });
    expect(spokenAnswer(find(start, "delivery:b1"), "তিন হাজার চারশো পঞ্চাশ টাকা")).toEqual({ kind: "value", value: "3450" });
    expect(spokenAnswer(find(start, "kind:b2"), "আচ্ছা")).toEqual({ kind: "option", option: "cash" });
    expect(spokenAnswer(find(start, "delivery:b1"), "হুম")).toEqual({ kind: "none" }); // nothing proposed to agree with
  });
});

test("every sentence and option renders in both languages with no placeholder left", () => {
  const inputs = [
    inputOf(read({ doubts: [{ entry: "e6", field: "amount", options: ["২৪০"], note: null }] }), { parties: [{ id: "p1", kind: "supplier", name: "প্রাণ", key: "প্রান" }] }),
    inputOf(read({ blocks: [VISIT], entries: [PRAN_LINES[1]!, line("e3", "b1", "Now 100", "closing_balance", { amount: "100" })], date: "1/11/26" })),
  ];
  inputs[0] = { ...inputs[0]!, dues: new Map([["p1", 280_000]]) };
  // T3: the khata's due proposed, compared and matched, in a customer's account and a visit.
  const book = (party: string, kind: "customer" | "supplier", due: number, blockKind: string, entries: unknown[]) => ({
    ...inputOf(read({ blocks: [{ ...VISIT, kind: blockKind, party, person: null }], entries, date: "1/11/26" }), { parties: [{ id: "b", kind, name: party, key: normalizePartyName(party)! }] }),
    dues: new Map([["b", due]]),
  });
  const paid = line("e1", "b1", "দিলাম ৫০০", "supplier_payment", { amount: "৫০০" });
  const before = line("e2", "b1", "আগের ২৬০০", "opening_balance", { amount: "২৬০০" });
  inputs.push(
    book("করিম", "customer", 26_000, "customer_account", [line("e1", "b1", "জমা ২০০", "repayment", { amount: "২০০" })]),
    book("প্রাণ", "supplier", 0, "supplier_account", [paid]),
    book("ফ্রেশ", "supplier", 160_000, "supplier_visit", [before, paid]),
    book("ফ্রেশ", "supplier", 300_000, "supplier_visit", [before, paid]),
    book("ফ্রেশ", "supplier", 260_000, "supplier_visit", [before, paid]),
  );
  for (const input of inputs) {
    for (const q of buildQuestions(input).questions) {
      const sentences = [q.sentence, q.why?.sentence, ...q.options.flatMap((o) => [o.label, o.detail])].filter((s) => s != null);
      for (const i18n of [bn, en]) {
        for (const s of sentences) expect(sentenceText(i18n, s)).not.toMatch(/\{\d\}|undefined|NaN/);
      }
    }
  }
});
