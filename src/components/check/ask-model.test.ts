import { describe, expect, test } from "bun:test";
import { answerQuestion } from "@/lib/questions/answer";
import { buildQuestions } from "@/lib/questions/engine";
import type { QuestionInput } from "@/lib/questions/types";
import type { BlockValues } from "@/lib/ledger/types";
import { acceptAnswered, acceptRest, blockDone, blockFigures, blockLines, blockRegion, deckItems, isBlockReading, itemKey } from "./ask-model";
import { reviewOf } from "./deck-fixture.test-util";
import type { Review } from "./deck-model";

const BLOCKS: BlockValues[] = [
  { id: "b1", kind: "day_sales", title: null, party: null, person: null, dateText: null },
  { id: "b2", kind: "supplier_visit", title: "প্রাণের সেলিম", party: "প্রাণ", person: "সেলিম", dateText: null },
];

/** The north-star page: two cash sales, then Pran's visit with two cartons and no prices. */
function pranPage(): Review {
  const base = reviewOf("mixed", [
    { type: "cash_sale", item: "চাল", amountText: "১৪০", box: { x_min: 100, y_min: 100, x_max: 500, y_max: 150 } },
    { type: "cash_sale", item: "চিনি", amountText: "৯০", box: { x_min: 120, y_min: 160, x_max: 480, y_max: 210 } },
    { type: "opening_balance", sourceText: "আগের ২৮০০", amountText: "২৮০০" },
    { type: "supplier_payment", sourceText: "দিলাম ১৫০০", amountText: "১৫০০" },
    { type: "credit_purchase", sourceText: "জুস ১ কার্টন", item: "জুস", quantityText: "১", unit: "কার্টন" },
    { type: "credit_purchase", sourceText: "বিস্কুট ২ কার্টন", item: "বিস্কুট", quantityText: "২", unit: "কার্টন" },
  ]);
  // The fixture keeps only the line fields it knows; the block goes on each line here.
  const blockOf = ["b1", "b1", "b2", "b2", "b2", "b2"];
  const rows = base.rows.map((r, i) => {
    const values = { ...r.values, block: blockOf[i] };
    return { ...r, values, candidate: r.candidate && { ...r.candidate, values } };
  });
  return { rows, page: { ...base.page, values: { ...base.page.values, dateText: "১/১১/২৬", blocks: BLOCKS } } };
}

const inputOf = (review: Review): QuestionInput => ({ page: review.page.values, rows: review.rows, doubts: [], parties: [], capturedOn: "2026-11-01" });

function answer(review: Review, id: string, choice: { option: string } | { value: string }): Review {
  const set = buildQuestions(inputOf(review));
  const q = [...set.questions, ...set.later].find((x) => x.id === id)!;
  const outcome = answerQuestion(inputOf(review), q.id, q.fp, choice, new Date("2026-11-02T10:00:00Z"));
  if (!outcome.ok) throw new Error(outcome.error);
  return { page: { ...review.page, values: outcome.after.page }, rows: outcome.after.rows };
}

describe("ask deck", () => {
  test("only readings with blocks get the ask deck", () => {
    expect(isBlockReading(pranPage().page.values)).toBe(true);
    expect(isBlockReading(reviewOf("cash_sales", [{ type: "cash_sale", amountText: "১০" }]).page.values)).toBe(false);
  });

  test("Pran's visit: owed before, paid, two gaps, never a zero", () => {
    const review = pranPage();
    const visit = blockLines(review).find((g) => g.block?.id === "b2")!;
    expect(blockFigures(visit.block, visit.rows)).toEqual({
      kind: "account",
      party: "supplier",
      before: 280000,
      paid: 150000,
      goods: [
        { id: "r5", amount: null },
        { id: "r6", amount: null },
      ],
      known: 130000,
      now: null,
    });
    const sales = blockLines(review).find((g) => g.block?.id === "b1")!;
    expect(blockFigures(sales.block, sales.rows)).toEqual({ kind: "total", total: 23000, lines: 2 });
    expect(blockRegion(sales.rows)).toEqual({ x_min: 100, y_min: 100, x_max: 500, y_max: 210 });
  });

  test("block by block: questions, then the rest, then the stamp", () => {
    const review = pranPage();
    const set = buildQuestions(inputOf(review));
    const keys = deckItems(review, set, {}, new Set()).map(itemKey);
    // The sales lines are typed, so b1 has nothing to ask: a quick confirm and its stamp.
    expect(keys.slice(0, 2)).toEqual(["rest:b1", "stamp:b1"]);
    expect(keys).toContain("question:meaning:b2");
    expect(keys.at(-1)).toBe("stamp:b2");
    // Lines a question is about never show again on the quick confirm.
    const rest = deckItems(review, set, {}, new Set()).filter((i) => i.kind === "rest");
    expect(rest.flatMap((i) => (i.kind === "rest" ? i.ids : []))).toEqual(["r1", "r2"]);
  });

  test("a seen stamp and confirmed lines drop out", () => {
    const review = pranPage();
    const set = buildQuestions(inputOf(review));
    const acc = acceptRest(review, ["r1", "r2"], {});
    expect(deckItems(review, set, acc, new Set(["stamp:b1"])).map(itemKey)[0]).toBe("question:meaning:b2");
    expect(blockDone(review, set, acc, "b1")).toBe(true);
    expect(blockDone(review, set, acc, "b2")).toBe(false);
  });

  test("yes to the visit accepts its money lines, not the goods with no price", () => {
    const before = pranPage();
    const meaning = buildQuestions(inputOf(before)).questions.find((q) => q.id === "meaning:b2")!;
    const after = answer(before, "meaning:b2", { option: meaning.proposed! });
    const acc = acceptAnswered(after, meaning, {});
    expect(Object.keys(acc).sort()).toEqual(["r3", "r4"]);
    expect(acc.r3!.acks.uncheckable).toBe(true);
  });

  test("prices left for later keep the block open", () => {
    let review = pranPage();
    review = answer(review, "meaning:b2", { option: buildQuestions(inputOf(review)).questions.find((q) => q.id === "meaning:b2")!.proposed! });
    const delivery = buildQuestions(inputOf(review)).questions.find((q) => q.kind === "delivery")!;
    review = answer(review, delivery.id, { option: delivery.options.find((o) => o.later)!.id });
    const set = buildQuestions(inputOf(review));
    expect(set.later.map((q) => q.id)).toEqual([delivery.id]);
    expect(blockDone(review, set, acceptRest(review, ["r3", "r4"], {}), "b2")).toBe(false);
    expect(deckItems(review, set, {}, new Set()).some((i) => i.kind === "line" && (i.id === "r5" || i.id === "r6"))).toBe(false);
  });
});
