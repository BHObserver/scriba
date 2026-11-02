/**
 * U4: the questions when the company's memo was photographed with the page. The north-star
 * visit (Praan (Selim), Before 2800, Given 1500, Juice 1 Box, Buiscite 2 Box, Conacor 1 Box)
 * with Pran's challan: Mango Juice 1 Ctn ৳480, Potato Biscuit 2 Ctn ৳720, Chanachur 1 Ctn ৳500,
 * total ৳1,700. The memo proposes; he confirms; code checks every sum.
 */
import { describe, expect, test } from "bun:test";
import { type NormalizedExtraction, pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { BLOCKS_PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_V3_VERSION } from "@/lib/extraction/schema";
import { makeI18n } from "@/lib/i18n/format";
import type { MemoForPage } from "@/lib/memo/match";
import { type FixtureLine, PRAN_MEMO_LINES, memoLine, memoOf } from "@/lib/memo/memo-fixture.test-util";
import { decideApproval } from "@/lib/review/approval";
import { type ReviewRow, toValidationInput } from "@/lib/review/state";
import { validateLedger } from "@/lib/validation/engine";
import { answerQuestion } from "./answer";
import { buildQuestions } from "./engine";
import { sentenceText } from "./text";
import type { Answer, Question, QuestionInput } from "./types";

const V3 = { promptVersion: BLOCKS_PROMPT_VERSION, schemaVersion: SCHEMA_V3_VERSION };
const NOW = new Date("2026-11-02T10:00:00Z");
const en = makeI18n("en");
const bn = makeI18n("bn");

function line(id: string, block: string, text: string, type: string, o: Record<string, unknown> = {}) {
  return {
    id, line: Number(id.slice(1)), block, text, type,
    customer: null, item: null, qty: null, unit: null, rate: null, amount: null, balance: null,
    crossed_out: false, review: [], note: null, box: null,
    ...o,
  };
}

const VISIT = { id: "b1", kind: "supplier_visit", title: "Praan (Selim)", party: "Praan", person: "Selim", date_text: null, box: null };
const VISIT_LINES = [
  line("e1", "b1", "Before - 2800", "opening_balance", { amount: "2800" }),
  line("e2", "b1", "Given - 1500", "supplier_payment", { amount: "1500" }),
  line("e3", "b1", "Juice 1 Box", "credit_purchase", { item: "Juice", qty: "1", unit: "Box" }),
  line("e4", "b1", "Buiscite 2 Box", "credit_purchase", { item: "Buiscite", qty: "2", unit: "Box" }),
  line("e5", "b1", "Conacor - 1 Box", "credit_purchase", { item: "Conacor", qty: "1", unit: "Box" }),
];

function read(entries: unknown[] = VISIT_LINES): NormalizedExtraction {
  const output = { page: { date_text: "1/11/2026", ledger_type: "mixed", legibility: "clear" }, blocks: [VISIT], entries, doubts: [], warnings: [] };
  const r = parseModelResponse({ status: "completed", incompleteReason: null, outputText: JSON.stringify(output), refusal: null }, V3);
  if (!r.ok) throw new Error(`${r.kind}: ${r.detail}`);
  return r.extraction;
}

const memo = (o: Parameters<typeof memoOf>[0] = {}, runId = "memo-run"): MemoForPage => ({ documentId: "memo-doc", runId, memo: memoOf(o) });

function inputOf(memos: MemoForPage[], entries?: unknown[]): QuestionInput {
  const x = read(entries);
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
  return { page: pageValuesOf(x), rows, doubts: [], parties: [], capturedOn: "2026-11-01", memos };
}

function find(input: QuestionInput, id: string): Question {
  const set = buildQuestions(input);
  const q = [...set.questions, ...set.later].find((x) => x.id === id);
  if (!q) throw new Error(`no question ${id}; have ${set.questions.map((x) => x.id).join(", ")}`);
  return q;
}

function answer(input: QuestionInput, id: string, a: Answer): QuestionInput {
  const q = find(input, id);
  const out = answerQuestion(input, id, q.fp, a, NOW);
  if (!out.ok) throw new Error(`answer to ${id} refused: ${out.error}`);
  return { ...input, page: out.after.page, rows: out.after.rows };
}

const ids = (input: QuestionInput) => buildQuestions(input).questions.map((q) => q.id);
const row = (input: QuestionInput, id: string) => input.rows.find((r) => r.id === id)!;
const findings = (input: QuestionInput) => validateLedger(toValidationInput({ page: { values: input.page, version: 1, reviewStartedAt: null }, rows: input.rows }));

describe("Pran's memo with the Pran page", () => {
  const start = inputOf([memo()]);

  test("without a memo, nothing changes", () => {
    const plain = inputOf([]);
    expect(ids(plain)).toEqual(["meaning:b1", "delivery:b1"]);
    expect(find(plain, "delivery:b1").proposed).toBeNull();
    expect(find(plain, "delivery:b1").fp).toBe(find(inputOf([memo({ lines: [] })]), "delivery:b1").fp);
  });

  test("the memo names the visit, so it isn't asked about; the three prices are one card with one button", () => {
    expect(ids(start)).toEqual(["meaning:b1", "delivery:b1"]);
    const q = find(start, "delivery:b1");
    expect(q.proposed).toBe("memo");
    expect(q.options.map((o) => o.id)).toEqual(["memo", "each", "later"]);
    expect(sentenceText(en, q.sentence)).toBe("Praan's memo prices the 3 goods at ৳1,700 in all. Use the memo's prices?");
    expect(sentenceText(bn, q.sentence)).toBe("Praan-এর মেমোতে ৩টা মালের দাম সব মিলিয়ে ৳১,৭০০। মেমোর দামগুলোই ধরব?");
    expect(sentenceText(en, q.options[0]!.detail!)).toBe("৳480 + ৳720 + ৳500");
    expect(sentenceText(bn, q.options[0]!.detail!)).toBe("৳৪৮০ + ৳৭২০ + ৳৫০০");
    expect(q.why).toEqual({ sentence: { key: "q.memo.sums" }, verified: true });
    expect(q.memo).toEqual({ document: "memo-doc", run: "memo-run", lines: ["m1", "m2", "m3"] });
  });

  test("one tap prices each line from the memo, and the visit's due can be worked out", () => {
    const s = answer(start, "delivery:b1", { option: "memo" });
    expect(["r3", "r4", "r5"].map((id) => [row(s, id).values.amountText, row(s, id).values.rateText])).toEqual([
      ["480", "480"],
      ["720", "360"],
      ["500", "500"],
    ]);
    expect(ids(s)).toEqual(["meaning:b1"]);
    expect(findings(s).some((f) => f.reason === "unpriced_goods")).toBe(false);
    expect(findings(s).filter((f) => f.ruleId === "qty_x_rate" && f.status === "fail")).toEqual([]);
    expect(s.page.answers?.find((a) => a.q === "delivery:b1")?.a).toBe("memo");

    const done = answer(s, "meaning:b1", { option: "yes" });
    expect(ids(done)).toEqual([]);
    const input = toValidationInput({ page: { values: done.page, version: 1, reviewStartedAt: null }, rows: done.rows });
    const all = validateLedger(input);
    for (const e of input.entries) expect(decideApproval(e, all, { findings: [], uncheckable: true })).toEqual({ ok: true });
  });

  test("when the memo prints the due, code checks the page comes to the same with its prices", () => {
    const q = find(inputOf([memo({ totals: { previous_due: "2,800", paid: "1,500", due: "3,000" } })]), "delivery:b1");
    expect(sentenceText(en, q.why!.sentence)).toBe("With these prices you owe them ৳3,000, the same due as on the memo.");
    expect(sentenceText(bn, q.why!.sentence)).toBe("এই দামে তাদের কাছে দেনা হয় ৳৩,০০০, মেমোর বাকির সাথে মেলে।");
    expect(q.why!.verified).toBe(true);
    // A due that the page doesn't come to is no reason; the memo's own sums still are.
    expect(find(inputOf([memo({ totals: { due: "3,100" } })]), "delivery:b1").why).toEqual({ sentence: { key: "q.memo.sums" }, verified: true });
    // After a discount, the one delivery line is what counts.
    const off = find(inputOf([memo({ totals: { subtotal: "1,700", discount: "50", total: "1,650", due: "2,950" } })]), "delivery:b1");
    expect(off.why).toEqual({ sentence: { key: "q.memo.due", args: [{ money: 295000 }] }, verified: true });
    // One good: its price question checks the same way.
    const one = inputOf([memo({ lines: PRAN_MEMO_LINES.slice(0, 1), totals: { total: "480", due: "1,780" } })], VISIT_LINES.slice(0, 3));
    expect(find(one, "price:r3").why).toEqual({ sentence: { key: "q.memo.due", args: [{ money: 178000 }] }, verified: true });
  });

  test("the visit's “before” and payment, when the memo prints the same, are ticked", () => {
    const q = find(inputOf([memo({ totals: { previous_due: "2,800.00", paid: "1500" } })]), "meaning:b1");
    expect(sentenceText(en, q.why!.sentence)).toBe("The memo shows the same: ৳2,800 before and ৳1,500 paid.");
    expect(q.why!.verified).toBe(true);
    expect(find(start, "meaning:b1").why).toBeNull();
  });

  test("a “before” the memo prints differently is a question, and the visit isn't ticked", () => {
    const s = inputOf([memo({ totals: { previous_due: "2,300" } })]);
    expect(find(s, "meaning:b1").why).toBeNull();
    const q = find(s, "memo_differs:r1");
    expect(sentenceText(en, q.sentence)).toBe("Your page says you owed ৳2,800 before; the memo says ৳2,300. Which is right?");
    expect(q.options.map((o) => sentenceText(en, o.label))).toEqual(["৳2,800, as on the page", "৳2,300, as on the memo"]);
    expect(q.proposed).toBeNull();
    expect(row(answer(s, "memo_differs:r1", { option: "memo" }), "r1").values.amountText).toBe("2300");
    expect(ids(answer(s, "memo_differs:r1", { option: "page" }))).not.toContain("memo_differs:r1");
  });

  test("a re-read memo asks again: an answer to the old reading is refused", () => {
    const q = find(start, "delivery:b1");
    const reread = { ...start, memos: [memo({}, "memo-run-2")] };
    expect(answerQuestion(reread, q.id, q.fp, { option: "memo" }, NOW)).toEqual({ ok: false, error: "stale" });
  });
});

describe("a memo that doesn't name the visit", () => {
  const start = inputOf([memo({ company: "Akij Food", person: null })]);

  test("is asked about before the prices, and proposes nothing until he says", () => {
    expect(ids(start)).toEqual(["meaning:b1", "memo:memo-doc", "delivery:b1"]);
    const q = find(start, "memo:memo-doc");
    expect(sentenceText(en, q.sentence)).toBe("Is this memo from “Akij Food” the one Selim (Praan) left?");
    expect(sentenceText(bn, q.sentence)).toBe("“Akij Food”-এর এই মেমোটা কি Selim (Praan)-এর রেখে যাওয়া?");
    expect(sentenceText(en, q.why!.sentence)).toBe("The memo's company, “Akij Food”, isn't named on your page.");
    expect(q.options.map((o) => o.id)).toEqual(["block:b1", "no", "later"]);
    expect(q.proposed).toBeNull();
    expect(find(start, "delivery:b1").proposed).toBeNull();
  });

  test("“yes, it's theirs” links it; “no” leaves the plain question", () => {
    const yes = answer(start, "memo:memo-doc", { option: "block:b1" });
    expect(ids(yes)).toEqual(["meaning:b1", "delivery:b1"]);
    expect(find(yes, "delivery:b1").proposed).toBe("memo");
    const no = answer(start, "memo:memo-doc", { option: "no" });
    expect(ids(no)).toEqual(["meaning:b1", "delivery:b1"]);
    expect(find(no, "delivery:b1").proposed).toBeNull();
  });

  test("with no company name read, it says so", () => {
    const q = find(inputOf([memo({ company: null, person: null })]), "memo:memo-doc");
    expect(sentenceText(en, q.sentence)).toBe("Is this memo the one Selim (Praan) left?");
    expect(sentenceText(en, q.why!.sentence)).toBe("Scriba couldn't read a company's name on the memo.");
  });
});

describe("what the memo can and can't price", () => {
  test("some of the goods: price each one, with the memo's price where it has one", () => {
    const s = inputOf([memo({ lines: PRAN_MEMO_LINES.slice(0, 2), totals: { total: "1,200" } })]);
    const delivery = find(s, "delivery:b1");
    expect(delivery.proposed).toBeNull();
    expect(sentenceText(en, delivery.why!.sentence)).toBe("The memo has prices for 2 of them. Price each one to use them.");
    const each = answer(s, "delivery:b1", { option: "each" });
    expect(ids(each)).toEqual(["meaning:b1", "price:r3", "price:r4", "price:r5"]);
    const juice = find(each, "price:r3");
    expect(juice.proposed).toBe("memo:m1");
    expect(sentenceText(en, juice.sentence)).toBe("“Juice 1 Box”: the memo prices it at ৳480. Use that?");
    expect(sentenceText(en, juice.options[0]!.label)).toBe("Yes, ৳480 from the memo");
    expect(sentenceText(en, juice.why!.sentence)).toBe("From the memo: “Mango Juice 250ml 1 Ctn 480 480”.");
    expect(juice.why!.verified).toBe(true);
    const conacor = find(each, "price:r5");
    expect(conacor.proposed).toBeNull();
    expect(conacor.options.map((o) => o.id)).toEqual(["later"]);
    expect(row(answer(each, "price:r3", { option: "memo:m1" }), "r3").values.amountText).toBe("480");
  });

  test("after a discount, the memo's total is proposed for the whole delivery", () => {
    const s = inputOf([memo({ totals: { subtotal: "1,700", discount: "50", total: "1,650" } })]);
    const q = find(s, "delivery:b1");
    expect(q.proposed).toBe("memo_total");
    expect(sentenceText(en, q.sentence)).toBe("Praan's memo comes to ৳1,650 for these 3 goods, after ৳50 off. Use ৳1,650 for them?");
    const after = answer(s, "delivery:b1", { option: "memo_total" });
    const added = after.rows.find((r) => r.id.startsWith("new-"))!;
    expect(added.values).toMatchObject({ amountText: "1650", type: "credit_purchase", item: "Juice, Buiscite, Conacor", block: "b1" });
    expect(["r3", "r4", "r5"].map((id) => row(after, id).status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(ids(after)).toEqual(["meaning:b1"]);
  });

  test("a memo whose lines don't add up to its total proposes nothing, and says why", () => {
    const s = inputOf([memo({ totals: { total: "1,650" } })]);
    const q = find(s, "delivery:b1");
    expect(q.proposed).toBeNull();
    expect(sentenceText(en, q.why!.sentence)).toBe("The memo's lines add up to ৳1,700, but its total says ৳1,650.");
    const juice = find(answer(s, "delivery:b1", { option: "each" }), "price:r3");
    expect(juice.proposed).toBeNull();
    expect(juice.options.map((o) => o.id)).toEqual(["memo:m1", "later"]);
    expect(sentenceText(en, juice.options[0]!.label)).toBe("“Mango Juice 250ml” · ৳480");
  });

  test("two memo lines the goods may be: both offered, neither proposed, neither asked about as extra", () => {
    const lines = [memoLine("m1", "Potato Biscuit", "2", "Ctn", "360", "720"), memoLine("m2", "Lexus Biscuit", "1", "Ctn", "300", "300")];
    const entries = [...VISIT_LINES.slice(0, 2), line("e3", "b1", "Buiscite 3 Box", "credit_purchase", { item: "Buiscite", qty: "3", unit: "Box" })];
    const s = inputOf([memo({ lines, totals: { total: "1,020" } })], entries);
    expect(ids(s)).toEqual(["meaning:b1", "price:r3"]);
    const q = find(s, "price:r3");
    expect(q.proposed).toBeNull();
    expect(q.options.map((o) => sentenceText(en, o.label))).toEqual(["“Potato Biscuit” · ৳720", "“Lexus Biscuit” · ৳300", "Later"]);
    expect(sentenceText(en, q.why!.sentence)).toBe("One of these memo lines may be it. Pick one, or say the price.");
    expect(row(answer(s, "price:r3", { option: "memo:m2" }), "r3").values).toMatchObject({ amountText: "300", rateText: null });
  });

  test("a price the model was unsure of is offered, never proposed", () => {
    const lines: FixtureLine[] = [{ ...PRAN_MEMO_LINES[0]!, review: ["amount"] }, ...PRAN_MEMO_LINES.slice(1)];
    const s = answer(inputOf([memo({ lines })]), "delivery:b1", { option: "each" });
    expect(find(s, "price:r3").proposed).toBeNull();
    expect(sentenceText(en, find(s, "price:r3").why!.sentence)).toBe("Check this price on the memo: Scriba couldn't confirm it.");
    expect(find(s, "price:r4").proposed).toBe("memo:m2");
  });
});

describe("the memo and the page disagree", () => {
  test("goods on the memo that aren't on the page: add, or leave out", () => {
    const litchi = memoLine("m4", "Litchi Drink", "1", "Ctn", "400", "400");
    const s = inputOf([memo({ lines: [...PRAN_MEMO_LINES, litchi], totals: { total: "2,100" } })]);
    expect(ids(s)).toEqual(["meaning:b1", "delivery:b1", "memo_extra:memo-doc:m4"]);
    expect(find(s, "delivery:b1").proposed).toBe("memo");
    const q = find(s, "memo_extra:memo-doc:m4");
    expect(sentenceText(en, q.sentence)).toBe("The memo also lists “Litchi Drink 1 Ctn 400 400” for ৳400. It isn't on your page. Add it to the visit?");
    expect(q.proposed).toBeNull();
    const added = answer(s, "memo_extra:memo-doc:m4", { option: "add" });
    expect(added.rows.find((r) => r.id.startsWith("new-"))!.values).toMatchObject({ item: "Litchi Drink", quantityText: "1", rateText: "400", amountText: "400", type: "credit_purchase", block: "b1" });
    expect(ids(added)).toEqual(["meaning:b1", "delivery:b1"]);
    expect(ids(answer(s, "memo_extra:memo-doc:m4", { option: "skip" }))).toEqual(["meaning:b1", "delivery:b1"]);
  });

  test("several such goods are one question, added in the memo's order", () => {
    const extra = [memoLine("m4", "Litchi Drink", "1", "Ctn", "400", "400"), memoLine("m5", "Chips", "1", "Ctn", "300", "300")];
    const s = inputOf([memo({ lines: [...PRAN_MEMO_LINES, ...extra], totals: { total: "2,400" } })]);
    const q = find(s, "memo_extras:memo-doc");
    expect(sentenceText(en, q.sentence)).toBe("The memo lists 2 more goods that aren't on your page, ৳700 in all. Add them to the visit?");
    expect(q.options.map((o) => o.id)).toEqual(["all", "each", "none", "later"]);
    const all = answer(s, "memo_extras:memo-doc", { option: "all" });
    expect([...all.rows].sort((a, b) => a.lineOrder - b.lineOrder).slice(-2).map((r) => r.values.item)).toEqual(["Litchi Drink", "Chips"]);
    expect(ids(answer(s, "memo_extras:memo-doc", { option: "each" }))).toEqual(["meaning:b1", "delivery:b1", "memo_extra:memo-doc:m4", "memo_extra:memo-doc:m5"]);
  });

  test("a price written on the page that the memo gives differently", () => {
    const entries = [...VISIT_LINES.slice(0, 2), line("e3", "b1", "Juice 1 Box 450", "credit_purchase", { item: "Juice", qty: "1", unit: "Box", amount: "450" })];
    const s = inputOf([memo({ lines: PRAN_MEMO_LINES.slice(0, 1), totals: { total: "480" } })], entries);
    const q = find(s, "memo_differs:r3");
    expect(sentenceText(en, q.sentence)).toBe("“Juice 1 Box 450”: the page says ৳450, the memo says ৳480. Which is right?");
    expect(sentenceText(bn, q.sentence)).toBe("“Juice ১ Box ৪৫০” — পাতায় ৳৪৫০, মেমোতে ৳৪৮০। কোনটা ঠিক?");
    expect(row(answer(s, "memo_differs:r3", { option: "memo" }), "r3").values.amountText).toBe("480");
    expect(ids(answer(s, "memo_differs:r3", { option: "page" }))).not.toContain("memo_differs:r3");
  });

  test("a delivery priced as one total doesn't ask about the memo's other goods", () => {
    const litchi = memoLine("m4", "Litchi Drink", "1", "Ctn", "400", "400");
    const s = inputOf([memo({ lines: [...PRAN_MEMO_LINES, litchi], totals: { total: "2,100" } })]);
    expect(ids(answer(s, "delivery:b1", { value: "2100" }))).toEqual(["meaning:b1"]);
  });
});
