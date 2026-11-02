/**
 * U4: the ask deck's side of the company memo. The north-star visit (Praan (Selim), Before 2800,
 * Given 1500, Juice 1 Box, Buiscite 2 Box, Conacor 1 Box) with Pran's challan (৳480 + ৳720 + ৳500,
 * due ৳3,000): what the price slots start with, what "Save the prices" sends, and which part of
 * the memo a card shows.
 */
import { describe, expect, test } from "bun:test";
import { pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { BLOCKS_PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_V3_VERSION } from "@/lib/extraction/schema";
import type { MemoForPage } from "@/lib/memo/match";
import { memoOf as memoReading } from "@/lib/memo/memo-fixture.test-util";
import { answerQuestion } from "@/lib/questions/answer";
import { buildQuestions } from "@/lib/questions/engine";
import type { Answer, Question, QuestionInput } from "@/lib/questions/types";
import type { ReviewRow } from "@/lib/review/state";
import { type MemoView, memoOf, memoRegion, memoView, pricesWhy, proposedPrices } from "./ask-memo";
import { draftPoisha, slotAnswer, slotOption, slotText } from "./ask-model";

const NOW = new Date("2026-11-02T10:00:00Z");
const DUE = { previous_due: "2,800", paid: "1,500", due: "3,000" };

function line(id: string, text: string, type: string, o: Record<string, unknown> = {}) {
  return { id, line: Number(id.slice(1)), block: "b1", text, type, customer: null, item: null, qty: null, unit: null, rate: null, amount: null, balance: null, crossed_out: false, review: [], note: null, box: null, ...o };
}

const VISIT = { id: "b1", kind: "supplier_visit", title: "Praan (Selim)", party: "Praan", person: "Selim", date_text: null, box: null };
const LINES = [
  line("e1", "Before - 2800", "opening_balance", { amount: "2800" }),
  line("e2", "Given - 1500", "supplier_payment", { amount: "1500" }),
  line("e3", "Juice 1 Box", "credit_purchase", { item: "Juice", qty: "1", unit: "Box" }),
  line("e4", "Buiscite 2 Box", "credit_purchase", { item: "Buiscite", qty: "2", unit: "Box" }),
  line("e5", "Conacor - 1 Box", "credit_purchase", { item: "Conacor", qty: "1", unit: "Box" }),
];

const boxed = (memo: ReturnType<typeof memoReading>) => ({
  ...memo,
  lines: memo.lines.map((l, i) => ({ ...l, box: { x_min: 60, y_min: 400 + i * 60, x_max: 940, y_max: 440 + i * 60 } })),
});
const memo = (totals = DUE): MemoForPage => ({ documentId: "memo-doc", runId: "memo-run", memo: boxed(memoReading({ totals })) });
const PHOTO = { src: "/memo.jpg", width: 1200, height: 1600, turns: 0 as const };

function inputOf(memos: MemoForPage[]): QuestionInput {
  const output = { page: { date_text: "1/11/2026", ledger_type: "mixed", legibility: "clear" }, blocks: [VISIT], entries: LINES, doubts: [], warnings: [] };
  const r = parseModelResponse({ status: "completed", incompleteReason: null, outputText: JSON.stringify(output), refusal: null }, { promptVersion: BLOCKS_PROMPT_VERSION, schemaVersion: SCHEMA_V3_VERSION });
  if (!r.ok) throw new Error(r.detail);
  const rows: ReviewRow[] = r.extraction.entries.map((e, i) => ({
    id: `r${i + 1}`,
    extractedEntryId: `x${i + 1}`,
    lineOrder: e.line,
    values: e.values,
    reviewFields: [...e.reviewFields],
    status: "draft",
    version: 1,
    candidate: { candidateId: e.candidateId, values: e.values, bbox: e.bbox, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason },
  }));
  return { page: pageValuesOf(r.extraction), rows, doubts: [], parties: [], capturedOn: "2026-11-01", memos };
}

const find = (input: QuestionInput, id: string): Question => buildQuestions(input).questions.find((q) => q.id === id)!;

function answer(input: QuestionInput, q: Question, a: Answer): QuestionInput {
  const out = answerQuestion(input, q.id, q.fp, a, NOW);
  if (!out.ok) throw new Error(`answer to ${q.id} refused: ${out.error}`);
  return { ...input, page: out.after.page, rows: out.after.rows };
}

/** "I'll price each one": the delivery card gives way to one price question per item. */
function priced(memos: MemoForPage[]) {
  const start = inputOf(memos);
  const each = answer(start, find(start, "delivery:b1"), { option: "each" });
  const qs = buildQuestions(each).questions.filter((q) => q.kind === "price");
  return { input: each, qs };
}

describe("price slots with the company's memo", () => {
  const { input, qs } = priced([memo()]);
  const [juice, biscuit, chanachur] = qs as [Question, Question, Question];

  test("each slot starts with the memo's price; without a memo it starts empty", () => {
    expect(qs.map((q) => draftPoisha(slotText(q, {})))).toEqual([48000, 72000, 50000]);
    expect(qs.map((q) => slotOption(q, slotText(q, {}))?.id)).toEqual(["memo:m1", "memo:m2", "memo:m3"]);
    const plain = priced([]).qs;
    expect(plain.map((q) => slotText(q, {}))).toEqual([undefined, undefined, undefined]);
  });

  test("a typed price wins; typing the memo's own price is the memo's price again", () => {
    expect(slotText(biscuit, { r4: "৭০০" })).toBe("৭০০");
    expect(slotOption(biscuit, "৭০০")).toBeNull();
    expect(slotOption(biscuit, "৭২০")?.id).toBe("memo:m2");
  });

  test("a slot left at the memo's price sends the memo's option, a retyped one its value", () => {
    expect(slotAnswer(juice, slotText(juice, {}), "২৮০০")).toEqual({ option: "memo:m1" });
    expect(slotAnswer(biscuit, "700", "২৮০০")).toEqual({ value: "৭০০" });
    expect(slotAnswer(biscuit, "700", "2800")).toEqual({ value: "700" });
    expect(slotAnswer(chanachur, undefined, null)).toBeNull();
  });

  test("saved in order, the memo's option prices the line with its rate and records where it came from", () => {
    let s = input;
    for (const id of ["price:r3", "price:r4", "price:r5"]) {
      const q = buildQuestions(s).questions.find((x) => x.id === id)!;
      s = answer(s, q, slotAnswer(q, slotText(q, { r4: "700" }), "2800")!);
    }
    const values = (id: string) => s.rows.find((r) => r.id === id)!.values;
    expect([values("r3").amountText, values("r3").rateText]).toEqual(["480", "480"]);
    expect([values("r4").amountText, values("r4").rateText]).toEqual(["700", null]);
    expect(s.page.answers?.filter((a) => a.q.startsWith("price:")).map((a) => a.a)).toEqual(["memo:m1", "value", "memo:m3"]);
  });

  test("the card's reason: ticked when the slots come to the memo's due, else the memo's sums", () => {
    const view = memoView(memo(), PHOTO);
    expect(pricesWhy(qs, view, 300000)).toEqual({ sentence: { key: "q.memo.due", args: [{ money: 300000 }] }, verified: true });
    expect(pricesWhy(qs, view, 298000)).toEqual({ sentence: { key: "q.memo.sums" }, verified: true });
    expect(pricesWhy(qs, view, null)).toEqual({ sentence: { key: "q.memo.sums" }, verified: true });
    expect(pricesWhy(qs, { ...view, agrees: null }, null)).toBeNull();
    expect(pricesWhy([juice], view, 300000)).toBe(juice.why);
    const plain = priced([]).qs;
    expect(pricesWhy(plain, null, null)).toBe(plain[0]!.why);
  });
});

describe("the memo beside a card", () => {
  const view: MemoView = memoView(memo(), PHOTO);

  test("a question finds its memo by document", () => {
    const q = find(inputOf([memo()]), "delivery:b1");
    expect(memoOf(q, [view])).toBe(view);
    expect(memoOf(q, [])).toBeNull();
    expect(memoOf(find(inputOf([]), "delivery:b1"), [view])).toBeNull();
  });

  test("the delivery card shows the memo's price beside each of the goods", () => {
    const q = find(inputOf([memo()]), "delivery:b1");
    expect([...proposedPrices(q)]).toEqual([
      ["r3", "480"],
      ["r4", "720"],
      ["r5", "500"],
    ]);
    expect(proposedPrices(find(inputOf([]), "delivery:b1")).size).toBe(0);
  });

  test("the strip is cut round the lines named, or shows the letterhead", () => {
    expect(memoRegion(view, ["m1", "m3"])).toEqual({ x_min: 60, y_min: 400, x_max: 940, y_max: 560 });
    expect(memoRegion(view, [])).toEqual({ x_min: 0, y_min: 0, x_max: 1000, y_max: 300 });
    const high = { ...view, lines: [{ id: "m1", box: { x_min: 0, y_min: 180, x_max: 1000, y_max: 220 } }] };
    expect(memoRegion(high, [])).toEqual({ x_min: 0, y_min: 0, x_max: 1000, y_max: 180 });
    expect(memoRegion({ ...view, lines: [{ id: "m1", box: null }] }, ["m1"])).toEqual({ x_min: 0, y_min: 0, x_max: 1000, y_max: 300 });
  });
});
