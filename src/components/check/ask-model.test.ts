import { describe, expect, test } from "bun:test";
import type { NormalizedDoubt } from "@/lib/extraction/parse";
import { answerQuestion } from "@/lib/questions/answer";
import { buildQuestions, splitHereQuestion } from "@/lib/questions/engine";
import type { Answer, Question, QuestionInput } from "@/lib/questions/types";
import { normalizePartyName } from "@/lib/ledger/parties";
import type { BlockValues } from "@/lib/ledger/types";
import {
  acceptAnswered,
  acceptRest,
  acceptSeen,
  answeredLines,
  blockFigures,
  blockLines,
  blockRegion,
  deckItems,
  deckSet,
  isBlockReading,
  itemKey,
  numbersPatches,
  partFailures,
  questionsAhead,
  salesKind,
  seenNow,
  settledByNumbers,
} from "./ask-model";
import { type Line, reviewOf } from "./deck-fixture.test-util";
import { type Acceptances, type Review, checkReview, confirmEntries, isAccepted, linesLeft } from "./deck-model";
import { type LinePatch, localReviewApi } from "./review-api";

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
  const item = deckItems(review, buildQuestions(inputOf(review)), acc).find((i) => i.kind === "rest" && i.block === block);
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
    // The box round the lines, reaching 0.6 of a line (৫০ high here) further up and down (F2).
    expect(blockRegion(sales.rows)).toEqual({ x_min: 100, y_min: 70, x_max: 500, y_max: 240 });
  });

  test("block by block: questions, then the rest", () => {
    const review = pranPage();
    const set = buildQuestions(inputOf(review));
    const keys = deckItems(review, set, {}).map(itemKey);
    // The sales lines are typed, so b1 has nothing to ask: only its quick confirm.
    expect(keys[0]).toBe("rest:b1");
    expect(keys[1]).toBe("question:meaning:b2");
    // No stamp cards since F2: the page seal shows the parts.
    expect(keys.some((k) => k.startsWith("stamp:"))).toBe(false);
    // Lines a question is about never show again on the quick confirm.
    const rest = deckItems(review, set, {}).filter((i) => i.kind === "rest");
    expect(rest.flatMap((i) => (i.kind === "rest" ? i.ids : []))).toEqual(["r1", "r2"]);
  });

  test("accepted lines drop out", () => {
    const review = pranPage();
    const set = buildQuestions(inputOf(review));
    const acc = acceptRest(review, ["r1", "r2"], {});
    expect(deckItems(review, set, acc).map(itemKey)[0]).toBe("question:meaning:b2");
  });

  test("a part's picture reaches past its first and last line, but never halfway into another part's line", () => {
    const sales = blockLines(pranPage()).find((g) => g.block?.id === "b1")!.rows;
    const withBox = (id: string, box: { x_min: number; y_min: number; x_max: number; y_max: number }) => ({ ...sales[0]!, id, candidate: { ...sales[0]!.candidate!, bbox: box } });
    const below = withBox("x1", { x_min: 150, y_min: 230, x_max: 450, y_max: 270 });
    const beside = withBox("x2", { x_min: 600, y_min: 215, x_max: 900, y_max: 255 });
    // The line just below stops it halfway (210 → 230: at 220); one beside the part doesn't.
    expect(blockRegion(sales, [...sales, below, beside])).toEqual({ x_min: 100, y_min: 70, x_max: 500, y_max: 220 });
    // At the top of the page it stops at the edge.
    const top = sales.map((r) => ({ ...r, candidate: { ...r.candidate!, bbox: { ...r.candidate!.bbox!, y_min: r.candidate!.bbox!.y_min - 90, y_max: r.candidate!.bbox!.y_max - 90 } } }));
    expect(blockRegion(top)!.y_min).toBe(0);
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
    // T2: "are the lines after the first total Karim's too?" comes right after; "yes" keeps one part.
    expect(asked).toEqual(["meaning:b1", "split:b1", "opening:b1"]);
    // Only the "before" he gave (none, so ৳0) is accepted; the page's lines all come back to him.
    expect(Object.keys(acc)).toEqual(review.rows.filter((r) => r.id.startsWith("new-")).map((r) => r.id));
    expect(restOf(review, acc, "b1")).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r7"]);
  });

  test("a P1-shaped page: “a separate sale” makes two parts, each with its own quick confirm", () => {
    const meaning = answered(karimPage(), "meaning:b1", { option: "yes" });
    const { after, acc } = answered(meaning.after, "split:b1", { option: "apart" }, meaning.acc);
    expect(acc).toEqual({});
    const keys = deckItems(after, buildQuestions(inputOf(after)), acc).map(itemKey);
    expect(keys).toEqual(["question:opening:b1", "rest:b2"]);
    expect(restOf(after, acc, "b2")).toEqual(["r4", "r5", "r6", "r7"]);
    // Once Karim's "before" is answered, his own three lines come on his quick confirm.
    const opened = answered(after, "opening:b1", { option: "none" }, acc);
    expect(restOf(opened.after, opened.acc, "b1")).toEqual(["r1", "r2", "r3"]);
    // Karim owes ৳260 from this page; the separate sale is ৳250 of cash.
    const parts = blockLines(after);
    expect(blockFigures(parts[0]!.block, parts[0]!.rows)).toMatchObject({ kind: "account", known: 26000, now: 26000 });
    expect(blockFigures(parts[1]!.block, parts[1]!.rows)).toEqual({ kind: "total", total: 25000, lines: 4 });
    const all = acceptRest(after, ["r4", "r5", "r6", "r7"], acc);
    expect(restOf(after, all, "b2")).toEqual([]);
  });

  test("lines moved to a new part lose their acceptance; the ones left keep it", () => {
    const review = karimPage();
    const accepted = acceptRest(review, ["r1", "r2", "r3", "r4", "r5", "r6", "r7"], {});
    const q = splitHereQuestion({ page: review.page.values, rows: review.rows }, "r4")!;
    const choice = { option: "kind:day_sales" };
    const outcome = answerQuestion(inputOf(review), q.id, q.fp, choice, new Date("2026-11-03T10:00:00Z"));
    if (!outcome.ok) throw new Error(outcome.error);
    const after = { page: { ...review.page, values: outcome.after.page }, rows: outcome.after.rows };
    expect(answeredLines(review, after, q, choice)).toEqual([]);
    const acc = acceptAnswered(review, after, q, choice, accepted);
    expect(Object.keys(acc)).toEqual(["r1", "r2", "r3"]);
    expect(restOf(after, acc, "b2")).toEqual(["r4", "r5", "r6", "r7"]);
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

  test("the page's “before” or the khata's (T3): either answer accepts that line, as its card showed both figures", () => {
    const review = pranPage();
    const input = { ...inputOf(review), parties: [{ id: "s1", kind: "supplier" as const, name: "প্রাণ", key: normalizePartyName("প্রাণ")! }], dues: new Map([["s1", 160_000]]) };
    const q = buildQuestions(input).questions.find((x) => x.id === "book_differs:r3")!;
    for (const option of ["page", "book"]) {
      const out = answerQuestion(input, q.id, q.fp, { option }, new Date("2026-11-03T10:00:00Z"));
      if (!out.ok) throw new Error(out.error);
      const after = { page: { ...review.page, values: out.after.page }, rows: out.after.rows };
      expect(Object.keys(acceptAnswered(review, after, q, { option }, {}))).toEqual(["r3"]);
    }
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
    expect(deckItems(kept.after, buildQuestions(inputOf(kept.after)), kept.acc).map(itemKey)).toEqual(["rest:b1"]);
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
    // The goods have no price, so they can't be accepted: the page can't seal.
    expect(linesLeft(review, acceptRest(review, ["r1", "r2", "r3", "r4", "r5", "r6"], {}))).toBe(2);
    expect(deckItems(review, set, {}).some((i) => i.kind === "line" && (i.id === "r5" || i.id === "r6"))).toBe(false);
  });

  test("answering them now brings the later prices back, until put off again", () => {
    let review = pranPage();
    review = answer(review, "meaning:b2", { option: buildQuestions(inputOf(review)).questions.find((q) => q.id === "meaning:b2")!.proposed! });
    const delivery = buildQuestions(inputOf(review)).questions.find((q) => q.kind === "delivery")!;
    review = answer(review, delivery.id, { option: delivery.options.find((o) => o.later)!.id });
    const set = buildQuestions(inputOf(review));
    const acc = acceptRest(review, ["r1", "r2"], {});
    expect(deckItems(review, deckSet(set, false, []), acc).map(itemKey)).not.toContain(`question:${delivery.id}`);
    expect(deckItems(review, deckSet(set, true, []), acc).map(itemKey)).toContain(`question:${delivery.id}`);
    const again = deckSet(set, true, [delivery.id]);
    expect(deckItems(review, again, acc).map(itemKey)).not.toContain(`question:${delivery.id}`);
    expect(again.later.map((q) => q.id)).toEqual([delivery.id]);
  });
});

describe("a page reopened (T5)", () => {
  /** "Add to the khata" with every line accepted: the lines confirmed. */
  function confirmAll(review: Review): Review {
    const ids = review.rows.map((r) => r.id);
    const sent = new Set(confirmEntries(review, acceptRest(review, ids, {})).map((e) => e.id));
    expect(sent.size).toBe(ids.length);
    return { ...review, rows: review.rows.map((r) => (sent.has(r.id) ? { ...r, status: "confirmed" as const } : r)) };
  }

  async function reopen(review: Review): Promise<Review> {
    const res = await localReviewApi().reopen(review);
    if (!res.ok) throw new Error(res.reason);
    return res.review;
  }

  test("his answers stay: nothing is asked again, and every line comes on its part's quick confirm", async () => {
    let review = karimPage();
    for (let q = buildQuestions(inputOf(review)).questions[0]; q; q = buildQuestions(inputOf(review)).questions[0]) {
      review = answer(review, q.id, { option: q.proposed ?? q.options.find((o) => !o.later && !o.local)!.id });
    }
    const confirmed = confirmAll(review);
    expect(deckItems(confirmed, buildQuestions(inputOf(confirmed)), {}).map(itemKey)).toEqual([]);

    const reopened = await reopen(confirmed);
    expect(reopened.rows.every((r) => r.status === "draft")).toBe(true);
    // A new version on every line: acceptances kept for the old ones don't come back.
    expect(reopened.rows.map((r) => r.version)).toEqual(confirmed.rows.map((r) => r.version + 1));
    const set = buildQuestions(inputOf(reopened));
    expect(set).toEqual({ questions: [], later: [] });
    expect(deckItems(reopened, set, {}).map(itemKey)).toEqual(["rest:b1"]);
    expect(restOf(reopened, {}, "b1")).toEqual(reopened.rows.map((r) => r.id));
  });

  test("P1, confirmed before T2: reopened, Scriba asks the split it never asked, and Karim's part is ৳260", async () => {
    // Before T2 there was no split question: he said yes to Karim's account and "nothing before".
    let review = answer(karimPage(), "meaning:b1", { option: "yes" });
    review = answer(review, "opening:b1", { option: "none" });
    const reopened = await reopen(confirmAll(review));

    const set = buildQuestions(inputOf(reopened));
    expect(set.questions.map((q) => q.id)).toEqual(["split:b1"]);
    const apart = answered(reopened, "split:b1", { option: "apart" });
    expect(deckItems(apart.after, buildQuestions(inputOf(apart.after)), apart.acc).map(itemKey)).toEqual(["rest:b1", "rest:b2"]);
    const [karim, sale] = blockLines(apart.after);
    expect(blockFigures(karim!.block, karim!.rows)).toMatchObject({ kind: "account", before: 0, known: 26000, now: 26000 });
    expect(blockFigures(sale!.block, sale!.rows)).toEqual({ kind: "total", total: 25000, lines: 4 });
    expect(sale!.rows.filter((r) => r.values.type === "cash_sale").map((r) => r.values.item)).toEqual(["আটা", "লবণ", "ডিম"]);
  });

  test("the dev board's preview counts the lines in the khata, and a page with none can't be reopened", async () => {
    const api = localReviewApi({ closedDays: ["2026-11-01"] });
    const confirmed = confirmAll(karimPage());
    expect(await api.reopenPreview(confirmed)).toEqual({ canReopen: true, reason: null, records: 7, closedDays: ["2026-11-01"] });
    expect(await api.reopenPreview(karimPage())).toMatchObject({ canReopen: false, reason: "not_confirmed", records: 0 });
    expect(await api.reopen(karimPage())).toEqual({ ok: false, reason: "not_confirmed" });
  });
});

describe("the numbers first (F2, 4 Nov)", () => {
  /** "All the numbers are right" as the dev board's API saves it: each line's patch applied in memory. */
  async function saveNumbers(review: Review): Promise<Review> {
    const api = localReviewApi();
    const rows = await Promise.all(
      review.rows.map(async (r) => {
        const patch: LinePatch | undefined = numbersPatches(review).find((p) => p.id === r.id)?.patch;
        if (!patch) return r;
        const res = await api.saveLine(r, patch);
        if (!res.ok) throw new Error(res.reason);
        return { ...r, ...res.line };
      }),
    );
    return { ...review, rows };
  }

  /** The numbers screen said right, then the deck: what is asked, and what is accepted on the way. */
  async function afterNumbers(review: Review) {
    const saved = await saveNumbers(review);
    const set = buildQuestions(inputOf(saved));
    const seen = seenNow(saved);
    return { review: saved, set, seen, acc: acceptSeen(saved, set, seen, {}) };
  }

  /** His P1 shape: two parts of the day's sales, kinds not written, one figure Scriba doubted. */
  const salesPage = (): Review => {
    const page = pageOf(
      [
        { type: "unknown", sourceText: "চাল ১৪০", item: "চাল", amountText: "১৪০" },
        { type: "unknown", sourceText: "ডাল ৯০", item: "ডাল", amountText: "৯০" },
        { type: "subtotal", sourceText: "মোট ২৩০", amountText: "২৩০" },
        { type: "unknown", sourceText: "তেল ১৭০", item: "তেল", amountText: "১৭০" },
        { type: "unknown", sourceText: "চিনি ১৩০", item: "চিনি", amountText: "১৩০" },
        { type: "subtotal", sourceText: "মোট ৩০০", amountText: "৩০০" },
      ],
      ["b1", "b1", "b1", "b2", "b2", "b2"],
      [
        { id: "b1", kind: "day_sales", title: null, party: null, person: null, dateText: null },
        { id: "b2", kind: "day_sales", title: null, party: null, person: null, dateText: null },
      ],
    );
    return { ...page, rows: page.rows.map((r) => (r.id === "r5" ? { ...r, reviewFields: ["amount" as const] } : r)) };
  };

  test("the day's sales are cash unless বাকি is written: the tag says so, and nothing asks", async () => {
    const before = salesPage();
    const [b1] = blockLines(before);
    expect(salesKind(b1!.block, b1!.rows)).toBe("cash");
    // Before the numbers, the old "are these all cash?" question per part, and the doubted ১৩০.
    const asked = buildQuestions(inputOf(before)).questions;
    expect(asked.map((q) => q.id)).toEqual(["kind:b1", "kind:b2", "doubt:r5:amount"]);
    expect(asked.every(settledByNumbers)).toBe(true);

    const patches = numbersPatches(before);
    expect(patches.map((p) => p.id)).toEqual(["r1", "r2", "r4", "r5"]);
    expect(patches.find((p) => p.id === "r5")!.patch).toMatchObject({ values: { type: "cash_sale" }, markChecked: ["amount"] });

    const { review, set, acc } = await afterNumbers(before);
    expect(review.rows.filter((r) => r.values.item).every((r) => r.values.type === "cash_sale")).toBe(true);
    expect(set).toEqual({ questions: [], later: [] });
    // Every line is accepted: the deck has nothing left and the page goes to its seal.
    expect(deckItems(review, set, acc)).toEqual([]);
    expect(linesLeft(review, acc)).toBe(0);
  });

  test("“then N questions” leaves out the lines' kinds while “what is this part?” is open (V01's shape)", () => {
    const page = pageOf(
      [
        { type: "unknown", item: "চাল", amountText: "১৪০" },
        { type: "unknown", item: "ডাল", amountText: "১২০" },
        { type: "unknown", item: "তেল", amountText: "১৭০" },
      ],
      ["b1", "b1", "b1"],
      [{ id: "b1", kind: "other", title: null, party: null, person: null, dateText: null }],
    );
    const set = buildQuestions(inputOf(page));
    expect(set.questions.map((q) => q.kind)).toEqual(["meaning", "direction", "direction", "direction"]);
    expect(questionsAhead(set)).toBe(1);
    // "The day's sales": the lines are cash, and nothing more is asked.
    const sales = answer(page, "meaning:b1", { option: "kind:day_sales" });
    expect(sales.rows.map((r) => r.values.type)).toEqual(["cash_sale", "cash_sale", "cash_sale"]);
    expect(buildQuestions(inputOf(sales)).questions).toEqual([]);
  });

  test("a sale marked বাকি on the sheet stays on credit, and the tag says both", () => {
    const review = salesPage();
    const rows = review.rows.map((r) => (r.id === "r4" ? { ...r, values: { ...r.values, type: "credit_sale" as const, customer: "করিম" } } : r));
    const marked = { ...review, rows };
    const [, b2] = blockLines(marked);
    expect(salesKind(b2!.block, b2!.rows)).toBe("mixed");
    expect(numbersPatches(marked).map((p) => p.id)).not.toContain("r4");
  });

  test("Pran's page after the numbers: the deck only asks, and the lines settle as it goes", async () => {
    const { review, set, seen, acc } = await afterNumbers(pranPage());
    // The cash sales were seen and need nothing else; the visit's lines wait for its questions.
    expect(Object.keys(acc).sort()).toEqual(["r1", "r2"]);
    const keys = deckItems(review, set, acc).map(itemKey);
    expect(keys[0]).toBe("question:meaning:b2");
    expect(keys.some((k) => k.startsWith("rest:") || k.startsWith("stamp:"))).toBe(false);

    // "Yes, Selim came": the "before" and "paid" he saw are accepted; the goods wait for prices.
    const q = questionOf(review, "meaning:b2");
    const after = answer(review, q.id, { option: "yes" });
    const next = acceptSeen(after, buildQuestions(inputOf(after)), seen, acceptAnswered(review, after, q, { option: "yes" }, acc));
    expect(Object.keys(next).sort()).toEqual(["r1", "r2", "r3", "r4"]);
    expect(restOf(after, next, "b2")).toEqual([]);
  });

  test("a figure an answer changes comes back on the quick confirm; keeping it as written does not", async () => {
    const page = pageOf(
      [
        { type: "cash_sale", item: "চাল", amountText: "১৪০" },
        { type: "cash_sale", item: "চিনি", amountText: "৯০" },
        { type: "subtotal", amountText: "২৪০" },
      ],
      ["b1", "b1", "b1"],
      [BLOCKS[0]!],
    );
    const { review, set, seen, acc } = await afterNumbers(page);
    // The total doesn't come out: the sum's lines wait for its question.
    expect(acc).toEqual({});
    expect(partFailures(checkReview(review).findings, review.rows).map((f) => f.ruleId)).toEqual(["written_total"]);
    const q = set.questions.find((x) => x.kind === "unbalanced")!;

    const kept = answer(review, q.id, { option: "keep" });
    const keptAcc = acceptSeen(kept, buildQuestions(inputOf(kept)), seen, acceptAnswered(review, kept, q, { option: "keep" }, acc));
    expect(deckItems(kept, buildQuestions(inputOf(kept)), keptAcc)).toEqual([]);

    const used = answer(review, q.id, { option: "use" });
    const usedAcc = acceptSeen(used, buildQuestions(inputOf(used)), seen, acceptAnswered(review, used, q, { option: "use" }, acc));
    // "Use ৳230" changed the total, and that answer accepts it.
    expect(Object.keys(usedAcc).sort()).toEqual(["r1", "r2", "r3"]);
  });

  test("a question put off for later keeps its lines out of the khata", async () => {
    let review = answer(karimPage(), "meaning:b1", { option: "yes" });
    review = answer(review, "split:b1", { option: "yes" });
    const opening = questionOf(review, "opening:b1");
    review = answer(review, opening.id, { option: opening.options.find((o) => o.later)!.id });
    const set = buildQuestions(inputOf(review));
    expect(set.later.map((q) => q.id)).toEqual(["opening:b1"]);
    expect(acceptSeen(review, set, seenNow(review), {})).toEqual({});
  });

  test("a line moved to another part comes on its quick confirm (T2)", async () => {
    const { review, seen } = await afterNumbers(karimPage());
    const meaning = answer(review, "meaning:b1", { option: "yes" });
    const apart = answer(meaning, "split:b1", { option: "apart" });
    const acc = acceptSeen(apart, buildQuestions(inputOf(apart)), seen, {});
    expect(restOf(apart, acc, "b2")).toEqual(["r4", "r5", "r6", "r7"]);
  });
});
