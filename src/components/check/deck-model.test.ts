import { describe, expect, test } from "bun:test";
import {
  type Acceptances,
  acceptanceFor,
  addFields,
  addedLineValues,
  canAccept,
  cardStatus,
  checkReview,
  confirmEntries,
  deckOrder,
  editOf,
  isAccepted,
  linesLeft,
  nextWaiting,
  pageOutcome,
  restoreAcceptances,
  storedAcceptances,
  typedText,
} from "./deck-model";
import { edited, reviewOf, s04Lines } from "./deck-fixture.test-util";

const cashPage = () =>
  reviewOf("cash_sales", [
    { type: "cash_sale", item: "চিনি", quantityText: "২", rateText: "৫০", amountText: "১০০" },
    { type: "cash_sale", item: "লবণ", quantityText: "১", rateText: "৩০", amountText: "৩০" },
    { type: "subtotal", amountText: "১৩০" },
    { type: "cash_sale", item: "ডিম", amountText: "১২" },
  ]);

const accept = (review: ReturnType<typeof reviewOf>, ids: string[], kind: "ok" | "asWritten" = "ok"): Acceptances => {
  const { findings, entries } = checkReview(review);
  return Object.fromEntries(ids.map((id) => [id, acceptanceFor(entries.get(id)!, findings, kind)]));
};

describe("deck order", () => {
  test("problem lines come first, then page order", () => {
    expect(deckOrder(reviewOf("customer_credit", s04Lines()))).toEqual(["r1", "r6", "r2", "r3", "r4", "r5"]);
  });

  test("confirmed and rejected lines get no card", () => {
    const review = edited(edited(reviewOf("customer_credit", s04Lines("৮০০")), "r2", { status: "confirmed" }), "r5", { status: "rejected" });
    expect(deckOrder(review)).not.toContain("r2");
    expect(deckOrder(review)).not.toContain("r5");
  });

  test("lines that can't be accepted as they are count as problems", () => {
    const review = reviewOf("cash_sales", [
      { type: "cash_sale", item: "চিনি", amountText: "৯০" },
      { type: "unknown", amountText: "৫০" },
      { type: "cash_sale", item: "লবণ", amountText: "৩০", crossedOut: true },
      { type: "cash_sale", item: "তেল" },
    ]);
    expect(deckOrder(review)).toEqual(["r2", "r3", "r4", "r1"]);
    const { findings, entries } = checkReview(review);
    expect(canAccept(entries.get("r1")!, findings)).toBe(true);
    for (const id of ["r2", "r3", "r4"]) expect(canAccept(entries.get(id)!, findings)).toBe(false);
  });
});

describe("acceptance", () => {
  test("accepting a failed end records the problem shown; the line is done", () => {
    const review = reviewOf("customer_credit", s04Lines());
    const acc = accept(review, ["r1"], "asWritten");
    const { findings, entries } = checkReview(review);
    expect(acc.r1!.acks.findings).toHaveLength(1);
    expect(isAccepted(entries.get("r1"), findings, acc.r1)).toBe(true);
    expect(cardStatus(review.rows[0]!, entries.get("r1"), findings, acc.r1)).toBe("done");
    expect(cardStatus(review.rows[5]!, entries.get("r6"), findings, undefined)).toBe("look");
    expect(cardStatus(review.rows[4]!, entries.get("r5"), findings, undefined)).toBe("open");
  });

  test("an edit elsewhere that brings a new problem puts an accepted line back", () => {
    const review = cashPage();
    const acc = accept(review, ["r1", "r3", "r4"]);
    // লবণ now reads ৪০: its own product and the total it adds into fail; ডিম is outside both.
    const after = edited(review, "r2", { amountText: "৪০" });
    const { findings, entries } = checkReview(after);
    expect(isAccepted(entries.get("r3"), findings, acc.r3)).toBe(false);
    expect(isAccepted(entries.get("r1"), findings, acc.r1)).toBe(false);
    expect(isAccepted(entries.get("r4"), findings, acc.r4)).toBe(true);
  });

  test("on S04 every line is inside the balance, so breaking it takes every acceptance back", () => {
    const review = reviewOf("customer_credit", s04Lines("৮০০"));
    const acc = accept(review, ["r2", "r5"]);
    const { findings, entries } = checkReview(edited(review, "r5", { status: "rejected" }));
    expect(isAccepted(entries.get("r2"), findings, acc.r2)).toBe(false);
  });

  test("a fix that clears a problem keeps the other end accepted", () => {
    const review = reviewOf("customer_credit", s04Lines());
    const acc = accept(review, ["r6"], "asWritten");
    const after = edited(review, "r1", { amountText: "৮০০" });
    const { findings, entries } = checkReview(after);
    expect(isAccepted(entries.get("r6"), findings, acc.r6)).toBe(true);
  });
});

describe("moving through the deck", () => {
  test("the next waiting card wraps round; -1 when all are done", () => {
    expect(nextWaiting(["done", "look", "open"], 1)).toBe(2);
    expect(nextWaiting(["look", "done", "done"], 1)).toBe(0);
    expect(nextWaiting(["done", "removed", "done"], 0)).toBe(-1);
  });

  test("lines left and the confirm body count accepted drafts only", () => {
    const review = cashPage();
    const acc = accept(review, ["r1", "r2"]);
    expect(linesLeft(review, acc)).toBe(2);
    const body = confirmEntries(review, acc);
    expect(body.map((e) => e.id)).toEqual(["r1", "r2"]);
    expect(body[0]).toMatchObject({ expectedVersion: 1, acknowledgements: acc.r1!.acks });
    expect(linesLeft(edited(review, "r4", { status: "rejected" }), acc)).toBe(1);
  });
});

describe("page outcome", () => {
  const allConfirmed = (review: ReturnType<typeof reviewOf>) => ({ ...review, rows: review.rows.map((r) => ({ ...r, status: "confirmed" as const })) });

  test("a corrected page with every line in is sealed", () => {
    const review = allConfirmed(reviewOf("customer_credit", s04Lines("৮০০")));
    const outcome = pageOutcome(review, checkReview(review).findings);
    expect(outcome).toMatchObject({ sealed: true, confirmed: 6, checked: true });
  });

  test("a page kept as written with a failed balance is in, not sealed", () => {
    const review = allConfirmed(reviewOf("customer_credit", s04Lines()));
    const outcome = pageOutcome(review, checkReview(review).findings);
    expect(outcome.sealed).toBe(false);
    expect(outcome.fails.map((f) => f.ruleId)).toEqual(["balance_equation"]);
  });

  test("a page with nothing to check is never sealed", () => {
    const review = allConfirmed(reviewOf("cash_sales", [{ type: "cash_sale", item: "চিনি", amountText: "৯০" }]));
    expect(pageOutcome(review, checkReview(review).findings)).toMatchObject({ sealed: false, checked: false, fails: [] });
  });

  test("a line still waiting means not sealed", () => {
    const review = reviewOf("customer_credit", s04Lines("৮০০"));
    expect(pageOutcome(review, checkReview(review).findings).sealed).toBe(false);
  });
});

describe("edits", () => {
  test("the first changed number, from the reading to the value", () => {
    const review = edited(reviewOf("customer_credit", s04Lines()), "r1", { amountText: "৮০০" });
    expect(editOf(review.rows[0]!)).toEqual({ from: "৪০০", to: "৮০০" });
    expect(editOf(review.rows[1]!)).toBeNull();
  });

  test("typed numbers follow the reading's digits", () => {
    expect(typedText("800", "৪০০")).toBe("৮০০");
    expect(typedText("800", "400")).toBe("800");
    expect(typedText("800", null)).toBe("৮০০");
    expect(typedText("1.5", null)).toBe("১.৫");
    expect(typedText("2.", "৪০০")).toBe("২");
  });
});

describe("a line he adds himself", () => {
  const parts = { type: "credit_sale" as const, name: " করিম ", item: "চাল", qty: "3", rate: "60", amount: "180" };

  test("asks for what its kind needs", () => {
    expect(addFields("credit_sale")).toEqual({ name: true, item: true, qtyRate: true });
    expect(addFields("repayment")).toEqual({ name: true, item: false, qtyRate: false });
    expect(addFields("expense")).toEqual({ name: false, item: true, qtyRate: false });
    expect(addFields("closing_balance")).toEqual({ name: false, item: false, qtyRate: false });
  });

  test("keeps only those fields, written like the page", () => {
    expect(addedLineValues(parts, "৪০০")).toEqual({
      sourceText: "করিম চাল ৩ × ৬০ = ১৮০",
      type: "credit_sale",
      customer: "করিম",
      item: "চাল",
      quantityText: "৩",
      unit: null,
      rateText: "৬০",
      amountText: "১৮০",
      balanceText: null,
      crossedOut: false,
    });
    const paid = addedLineValues({ ...parts, type: "repayment", amount: "500" }, "400");
    expect(paid).toMatchObject({ sourceText: "করিম 500", customer: "করিম", item: null, quantityText: null, rateText: null, amountText: "500" });
    expect(addedLineValues({ ...parts, type: "subtotal", qty: "", amount: "" }, null)).toMatchObject({ sourceText: "", amountText: null });
  });

  test("checks like any other line", () => {
    const review = reviewOf("cash_sales", [{ type: "cash_sale", item: "চিনি", quantityText: "২", rateText: "৫০", amountText: "১০০" }]);
    const added = { ...review.rows[0]!, id: "r9", candidate: null, values: addedLineValues({ ...parts, type: "cash_sale", amount: "১৫০" }, null) };
    const { findings } = checkReview({ ...review, rows: [...review.rows, added] });
    expect(findings.some((f) => f.status === "fail" && f.entryIds.includes("r9"))).toBe(true);
  });
});

describe("acceptances kept across a reload", () => {
  test("come back only for draft lines at the same version", () => {
    const review = reviewOf("customer_credit", s04Lines());
    const { findings, entries } = checkReview(review);
    const acc: Acceptances = {
      r1: acceptanceFor(entries.get("r1")!, findings, "asWritten"),
      r2: acceptanceFor(entries.get("r2")!, findings, "ok"),
    };
    const stored = JSON.parse(JSON.stringify(storedAcceptances(review, acc)));
    expect(restoreAcceptances(review, stored)).toEqual(acc);

    const changed = edited(review, "r2", { amountText: "৯৯" });
    expect(Object.keys(restoreAcceptances(changed, stored))).toEqual(["r1"]);
  });

  test("ignore anything malformed", () => {
    const review = reviewOf("cash_sales", [{ type: "cash_sale", amountText: "১০" }]);
    expect(restoreAcceptances(review, null)).toEqual({});
    expect(restoreAcceptances(review, "x")).toEqual({});
    expect(restoreAcceptances(review, { r1: { version: 1, acceptance: { kind: "yes", acks: { findings: [], uncheckable: false } } } })).toEqual({});
    expect(restoreAcceptances(review, { r1: { version: 1, acceptance: { kind: "ok", acks: { findings: "x", uncheckable: false } } } })).toEqual({});
  });
});
