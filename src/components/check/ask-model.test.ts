import { describe, expect, test } from "bun:test";
import type { NormalizedDoubt } from "@/lib/extraction/parse";
import { answerQuestion } from "@/lib/questions/answer";
import { buildQuestions } from "@/lib/questions/engine";
import type { Answer, Question, QuestionInput } from "@/lib/questions/types";
import type { BlockValues } from "@/lib/ledger/types";
import { acceptAnswered, acceptRest, answeredLines, blockDone, blockFigures, blockLines, blockRegion, deckItems, deckSet, isBlockReading, itemKey } from "./ask-model";
import { type Line, reviewOf } from "./deck-fixture.test-util";
import { type Acceptances, type Review, checkReview, isAccepted } from "./deck-model";

const BLOCKS: BlockValues[] = [
  { id: "b1", kind: "day_sales", title: null, party: null, person: null, dateText: null },
  { id: "b2", kind: "supplier_visit", title: "প্রাণের সেলিম", party: "প্রাণ", person: "সেলিম", dateText: null },
];

/** A dated page of lines in blocks: `blockOf[i]` is line i's block. */
function pageOf(lines: Line[], blockOf: readonly string[], blocks: BlockValues[]): Review {
  const base = reviewOf("mixed", lines);
  // The fixture keeps only the line fields it knows; the block goes on each line here.
  const rows = base.rows.map((r, i) => {
    const values = { ...r.values, block: blockOf[i] };
    return { ...r, values, candidate: r.candidate && { ...r.candidate, values } };
  });
  return { rows, page: { ...base.page, values: { ...base.page.values, dateText: "১/১১/২৬", blocks } } };
}

/** The north-star page: two cash sales, then Pran's visit with two cartons and no prices. */
const pranPage = (): Review =>
  pageOf(
    [
      { type: "cash_sale", item: "চাল", amountText: "১৪০", box: { x_min: 100, y_min: 100, x_max: 500, y_max: 150 } },
      { type: "cash_sale", item: "চিনি", amountText: "৯০", box: { x_min: 120, y_min: 160, x_max: 480, y_max: 210 } },
      { type: "opening_balance", sourceText: "আগের ২৮০০", amountText: "২৮০০" },
      { type: "supplier_payment", sourceText: "দিলাম ১৫০০", amountText: "১৫০০" },
      { type: "credit_purchase", sourceText: "জুস ১ কার্টন", item: "জুস", quantityText: "১", unit: "কার্টন" },
      { type: "credit_purchase", sourceText: "বিস্কুট ২ কার্টন", item: "বিস্কুট", quantityText: "২", unit: "কার্টন" },
    ],
    ["b1", "b1", "b2", "b2", "b2", "b2"],
    BLOCKS,
  );

/**
 * Shaped like the five-page test's first page (written for the test, not his data): Karim's
 * account with its subtotal, then a separate sale just below with its own, which the reading put
 * in Karim's part. Each subtotal checks, so the part "adds up".
 */
const karimPage = (): Review =>
  pageOf(
    [
      { type: "credit_sale", sourceText: "চাল ১৬০", item: "চাল", amountText: "১৬০" },
      { type: "credit_sale", sourceText: "ডাল ১০০", item: "ডাল", amountText: "১০০" },
      { type: "subtotal", sourceText: "মোট ২৬০", amountText: "২৬০" },
      { type: "credit_sale", sourceText: "আটা ১২০", item: "আটা", amountText: "১২০" },
      { type: "credit_sale", sourceText: "লবণ ৩০", item: "লবণ", amountText: "৩০" },
      { type: "credit_sale", sourceText: "ডিম ১০০", item: "ডিম", amountText: "১০০" },
      { type: "subtotal", sourceText: "মোট ২৫০", amountText: "২৫০" },
    ],
    ["b1", "b1", "b1", "b1", "b1", "b1", "b1"],
    [{ id: "b1", kind: "customer_account", title: "করিম বাকি", party: "করিম", person: null, dateText: null }],
  );

const inputOf = (review: Review, doubts: NormalizedDoubt[] = []): QuestionInput => ({ page: review.page.values, rows: review.rows, doubts, parties: [], capturedOn: "2026-11-01" });

function questionOf(review: Review, id: string, doubts: NormalizedDoubt[] = []): Question {
  const set = buildQuestions(inputOf(review, doubts));
  return [...set.questions, ...set.later].find((x) => x.id === id)!;
}

function answer(review: Review, id: string, choice: Answer, doubts: NormalizedDoubt[] = []): Review {
  const q = questionOf(review, id, doubts);
  const outcome = answerQuestion(inputOf(review, doubts), q.id, q.fp, choice, new Date("2026-11-02T10:00:00Z"));
  if (!outcome.ok) throw new Error(outcome.error);
  return { page: { ...review.page, values: outcome.after.page }, rows: outcome.after.rows };
}

/** One answer as the deck takes it: the review after it, and the acceptances with the lines it accepts. */
function answered(review: Review, id: string, choice: Answer, acceptances: Acceptances = {}, doubts: NormalizedDoubt[] = []) {
  const q = questionOf(review, id, doubts);
  const after = answer(review, id, choice, doubts);
  return { after, acc: acceptAnswered(review, after, q, choice, acceptances) };
}

/** The lines on a block's quick confirm. */
function restOf(review: Review, acc: Acceptances, block: string): string[] {
  const item = deckItems(review, buildQuestions(inputOf(review)), acc, new Set()).find((i) => i.kind === "rest" && i.block === block);
  return item?.kind === "rest" ? item.ids : [];
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

  test("yes to the visit settles what it is, not its lines: they come on the quick confirm", () => {
    const { after, acc } = answered(pranPage(), "meaning:b2", { option: "yes" });
    expect(acc).toEqual({});
    // The goods wait for their prices; "before" and "paid" are shown again, each one tappable.
    expect(restOf(after, acc, "b2")).toEqual(["r3", "r4"]);
    const all = acceptRest(after, ["r3", "r4"], acc);
    expect(Object.keys(all).sort()).toEqual(["r3", "r4"]);
    expect(all.r3!.acks.uncheckable).toBe(true);
  });

  test("the meaning card can open the part's lines, to fix a figure there and then", () => {
    const q = questionOf(pranPage(), "meaning:b2");
    expect(q.options.find((o) => o.id === "line")?.local).toBe(true);
    expect(q.entries).toEqual(["r3", "r4", "r5", "r6"]);
  });

  test("a P1-shaped page: yes to Karim's account leaves all 7 of its lines for the quick confirm", () => {
    let review = karimPage();
    let acc: Acceptances = {};
    const asked: string[] = [];
    for (let q = buildQuestions(inputOf(review)).questions[0]; q && asked.length < 10; q = buildQuestions(inputOf(review)).questions[0]) {
      asked.push(q.id);
      ({ after: review, acc } = answered(review, q.id, { option: q.proposed ?? q.options.find((o) => !o.later && !o.local)!.id }, acc));
    }
    expect(asked).toEqual(["meaning:b1", "opening:b1"]);
    // Only the "before" he gave (none, so ৳0) is accepted; the page's lines all come back to him.
    expect(Object.keys(acc)).toEqual(review.rows.filter((r) => r.id.startsWith("new-")).map((r) => r.id));
    expect(restOf(review, acc, "b1")).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7"]);
  });

  test("a doubt answer still accepts its line", () => {
    const doubts: NormalizedDoubt[] = [{ entryId: "e2", field: "amount", options: ["১৬০", "১৩০"], note: null }];
    const page = pranPage();
    const review = { ...page, rows: page.rows.map((r) => (r.id === "r2" ? { ...r, values: { ...r.values, amountText: "১৬০" }, reviewFields: ["amount" as const] } : r)) };
    const pick = questionOf(review, "doubt:r2:amount", doubts).options.find((o) => o.value === "১৩০")!;
    const { after, acc } = answered(review, "doubt:r2:amount", { option: pick.id }, {}, doubts);
    expect(after.rows.find((r) => r.id === "r2")!.values.amountText).toBe("১৩০");
    expect(Object.keys(acc)).toEqual(["r2"]);
  });

  test("a sum that doesn't come out: code's figure accepts that line; keeping it as written accepts none", () => {
    const review = pageOf(
      [
        { type: "cash_sale", item: "চাল", amountText: "১৪০" },
        { type: "cash_sale", item: "চিনি", amountText: "৯০" },
        { type: "subtotal", amountText: "২৪০" },
      ],
      ["b1", "b1", "b1"],
      [BLOCKS[0]!],
    );
    const q = buildQuestions(inputOf(review)).questions.find((x) => x.kind === "unbalanced")!;
    expect(q.options.map((o) => o.id)).toEqual(["use", "keep", "look"]);

    const used = answered(review, q.id, { option: "use" });
    expect(Object.keys(used.acc)).toEqual(["r3"]);
    expect(restOf(used.after, used.acc, "b1")).toEqual(["r1", "r2"]);

    // Kept as written: the total isn't a card of its own again; it waits on the quick confirm.
    const kept = answered(review, q.id, { option: "keep" });
    expect(kept.acc).toEqual({});
    expect(deckItems(kept.after, buildQuestions(inputOf(kept.after)), kept.acc, new Set()).map(itemKey)).toEqual(["rest:b1", "stamp:b1"]);
    const all = acceptRest(kept.after, ["r1", "r2", "r3"], kept.acc);
    const { findings, entries } = checkReview(kept.after);
    expect(["r1", "r2", "r3"].every((id) => isAccepted(entries.get(id), findings, all[id]))).toBe(true);
  });

  test("a 'before' he gives is accepted, not the lines it is about; 'later' accepts nothing", () => {
    const review = karimPage();
    const opening = questionOf(review, "opening:b1");
    const typed = answer(review, opening.id, { value: "৫০" });
    expect(answeredLines(review, typed, opening, { value: "৫০" })).toEqual(["new-1"]);
    const later = { option: opening.options.find((o) => o.later)!.id };
    expect(answeredLines(review, answer(review, opening.id, later), opening, later)).toEqual([]);
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

  test("answering them now brings the later prices back, until put off again", () => {
    let review = pranPage();
    review = answer(review, "meaning:b2", { option: buildQuestions(inputOf(review)).questions.find((q) => q.id === "meaning:b2")!.proposed! });
    const delivery = buildQuestions(inputOf(review)).questions.find((q) => q.kind === "delivery")!;
    review = answer(review, delivery.id, { option: delivery.options.find((o) => o.later)!.id });
    const set = buildQuestions(inputOf(review));
    const acc = acceptRest(review, ["r1", "r2"], {});
    const seen = new Set(["stamp:b1"]);
    expect(deckItems(review, deckSet(set, false, []), acc, seen).map(itemKey)).not.toContain(`question:${delivery.id}`);
    expect(deckItems(review, deckSet(set, true, []), acc, seen).map(itemKey)).toContain(`question:${delivery.id}`);
    const again = deckSet(set, true, [delivery.id]);
    expect(deckItems(review, again, acc, seen).map(itemKey)).not.toContain(`question:${delivery.id}`);
    expect(again.later.map((q) => q.id)).toEqual([delivery.id]);
  });
});
