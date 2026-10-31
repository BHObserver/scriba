import { describe, expect, test } from "bun:test";
import { makeI18n } from "@/lib/i18n/format";
import { checkReview } from "./deck-model";
import { edited, reviewOf, s04Lines } from "./deck-fixture.test-util";
import { lineSentences, pageSentence } from "./sentences";

const bn = makeI18n("bn");
const en = makeI18n("en");

function sentences(review: ReturnType<typeof reviewOf>, id: string, i18n = bn) {
  const { findings } = checkReview(review);
  return lineSentences(i18n, review.rows.find((r) => r.id === id)!, review.rows, findings);
}

describe("S04 as read (opening ৮০০ read as ৪০০)", () => {
  const review = reviewOf("customer_credit", s04Lines(), "করিম মিয়া");

  test("the opening line shows the failed equation and the value that would close it", () => {
    const { checks, hint } = sentences(review, "r1");
    expect(checks[0]).toEqual({ kind: "look", text: "৪০০ + ১৮০ + ১৪০ − ১০০ = ৬২০ হয়, কিন্তু শেষ বাকি লেখা ১,০২০।" });
    expect(hint).toBe("হিসাব মিলতে হলে এখানে ৮০০ হওয়া দরকার। ছবির সাথে মিলিয়ে দেখুন।");
  });

  test("the closing line would need the computed balance", () => {
    expect(sentences(review, "r6").hint).toBe("হিসাব মিলতে হলে এখানে ৬২০ হওয়া দরকার। ছবির সাথে মিলিয়ে দেখুন।");
  });

  test("a sale shows its multiplication; the total shows its sum", () => {
    expect(sentences(review, "r2").checks).toEqual([
      { kind: "info", text: bn.t("chk.bal.inFail") },
      { kind: "ok", text: "৩ × ৬০ = ১৮০, মিলেছে।" },
    ]);
    expect(sentences(review, "r4").checks).toEqual([{ kind: "ok", text: "১৮০ + ১৪০ = ৩২০, মিলেছে।" }]);
  });

  test("a repayment only inside the failed balance is never claimed as checked, and says why it waits", () => {
    expect(sentences(review, "r5").checks).toEqual([{ kind: "info", text: bn.t("chk.bal.inFail") }]);
  });

  test("English uses Latin digits and the same numbers", () => {
    expect(sentences(review, "r2", en).checks.at(-1)!.text).toBe("3 × 60 = 180. It adds up.");
  });

  test("the summary hero is the closing balance, flagged", () => {
    const hero = pageSentence(bn, review.rows, checkReview(review).findings);
    expect(hero).toMatchObject({ label: "closing", amount: 102000, kind: "look" });
  });
});

describe("after the fix", () => {
  const review = edited(reviewOf("customer_credit", s04Lines()), "r1", { amountText: "৮০০" });

  test("both ends say it adds up; the repayment is now covered", () => {
    expect(sentences(review, "r1").checks).toEqual([{ kind: "ok", text: "৮০০ + ১৮০ + ১৪০ − ১০০ = ১,০২০, মিলেছে।" }]);
    expect(sentences(review, "r5").checks).toEqual([{ kind: "ok", text: bn.t("chk.bal.out") }]);
    expect(pageSentence(bn, review.rows, checkReview(review).findings)?.kind).toBe("ok");
  });
});

describe("line problems", () => {
  test("a wrong product, with the khata-may-be-wrong hint", () => {
    const review = reviewOf("cash_sales", [{ type: "cash_sale", item: "ডিম", quantityText: "২", rateText: "৯৫", amountText: "১৮০" }]);
    const { checks, hint } = sentences(review, "r1");
    expect(checks[0]).toEqual({ kind: "look", text: "২ × ৯৫ = ১৯০ হয়, কিন্তু পড়া হয়েছে ১৮০।" });
    expect(hint).toBe(bn.t("chk.khataWrong"));
  });

  test("Scriba's doubt is one sentence with its own reason, and the product waits for it", () => {
    const review = reviewOf("customer_credit", [
      { type: "credit_sale", item: "চাল", quantityText: "৩", rateText: "৬০", amountText: "১৮০", review: ["qty", "amount"], reason: "৮ না ৪, পরিষ্কার না" },
    ]);
    const { checks } = sentences(review, "r1");
    expect(checks.filter((c) => c.text.startsWith("Scriba"))).toEqual([{ kind: "look", text: "Scriba নিশ্চিত না: ৮ না ৪, পরিষ্কার না" }]);
    expect(checks).toContainEqual({ kind: "info", text: bn.t("chk.qr.unsure") });
  });

  test("unknown kind, missing rate and an empty amount each say so", () => {
    const review = reviewOf("cash_sales", [
      { type: "unknown", amountText: "৫০" },
      { type: "cash_sale", item: "আলু", quantityText: "২", amountText: "৬০" },
      { type: "cash_sale", item: "তেল" },
    ]);
    expect(sentences(review, "r1").checks).toContainEqual({ kind: "look", text: bn.t("chk.type") });
    expect(sentences(review, "r2").checks).toContainEqual({ kind: "info", text: bn.t("chk.qr.noRate") });
    expect(sentences(review, "r3").checks).toContainEqual({ kind: "look", text: bn.t("chk.noAmount") });
  });
});
