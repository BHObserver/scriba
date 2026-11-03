import { describe, expect, test } from "bun:test";
import { type GroundTruth, groundTruthSchema } from "./ground-truth";
import { type TruthBlock, expectedPart, looseKey, partRatios, scorePart } from "./spoken-part";

// Hand-written, shaped like a real page (no real data in tests).
const truth: GroundTruth = groundTruthSchema.parse({
  format: "scriba-ground-truth-1",
  sample_id: "X1",
  split: "development",
  writer: "test",
  page: { ledger_type: "mixed" },
  entries: [
    { line: 1, type: "credit_sale", customer: "রহিম", item: "চাল", quantity: "2", unit: "কেজি", amount: "140" },
    { line: 2, type: "credit_sale", item: "লবণ", quantity: "1", unit: "কেজি", amount: "40" },
    { line: 3, type: "subtotal", amount: "180" },
    { line: 4, type: "opening_balance", amount: "2800" },
    { line: 5, type: "supplier_payment", amount: "1500" },
    { line: 6, type: "credit_purchase", item: "জুস", quantity: "1", unit: "কার্টুন" },
  ],
});
const account: TruthBlock = { id: "b1", kind: "customer_account", party: "রহিম", lines: [1, 2, 3] };
const visit: TruthBlock = { id: "b2", kind: "supplier_visit", party: "সুরমা", person: "জসিম", lines: [4, 5, 6] };

describe("expectedPart", () => {
  test("figures in page order with their roles, names before items, the markers the part calls for", () => {
    const e = expectedPart(truth, account);
    expect(e.figures).toEqual([
      { line: 1, role: "qty", value: "2" },
      { line: 1, role: "amount", value: "140" },
      { line: 2, role: "qty", value: "1" },
      { line: 2, role: "amount", value: "40" },
      { line: 3, role: "total", value: "180" },
    ]);
    expect(e.words).toEqual([
      { role: "name", word: "রহিম" },
      { role: "item", word: "চাল" },
      { role: "item", word: "লবণ" },
    ]);
    expect(e.markers.sort()).toEqual(["credit", "total"]);
  });

  test("a visit expects the visit, the old due and the payment; unpriced goods carry only their count", () => {
    const e = expectedPart(truth, visit);
    expect(e.figures).toEqual([
      { line: 4, role: "before", value: "2800" },
      { line: 5, role: "paid", value: "1500" },
      { line: 6, role: "qty", value: "1" },
    ]);
    expect(e.words.map((w) => w.word)).toEqual(["সুরমা", "জসিম", "জুস"]);
    expect(e.markers.sort()).toEqual(["before", "paid", "visit"]);
  });
});

describe("scorePart", () => {
  test("a clean reading: every figure, word and marker", () => {
    const s = scorePart(expectedPart(truth, account), "রহিম বাকি, চাল দুই কেজি একশো চল্লিশ, লবণ এক কেজি চল্লিশ টাকা, মোট একশো আশি");
    expect(s.heard).toEqual(["2", "140", "1", "40", "180"]);
    expect(s.figures.every((f) => f.heard)).toBe(true);
    expect(s.extra).toEqual([]);
    expect(s.words.map((w) => w.found)).toEqual(["exact", "exact", "exact"]);
    expect(s.said.sort()).toEqual(["credit", "total"]);
    expect(s.unsaid).toEqual([]);
  });

  test("a misheard total is a miss and an extra", () => {
    const s = scorePart(expectedPart(truth, account), "রহিম, চাল দুই কেজি একশো চল্লিশ, লবণ এক কেজি চল্লিশ, মোট একশো নব্বই");
    expect(s.figures.find((f) => f.role === "total")?.heard).toBe(false);
    expect(s.extra).toEqual(["190"]);
    expect(partRatios(s).money).toEqual({ numerator: 2, denominator: 3 });
    expect(s.unsaid).toEqual(["credit"]);
  });

  test("counts left unsaid cost only the counts", () => {
    const r = partRatios(scorePart(expectedPart(truth, account), "চাল একশো চল্লিশ, লবণ চল্লিশ, মোট একশো আশি"));
    expect(r.money).toEqual({ numerator: 3, denominator: 3 });
    expect(r.qty).toEqual({ numerator: 0, denominator: 2 });
    expect(r.words).toEqual({ numerator: 2, denominator: 3 });
  });

  test("figures said out of order pair only in order", () => {
    // He says the total first: 180 then 140 and 40; order keeps 140 and 40, and 180 counts as extra.
    const s = scorePart(expectedPart(truth, account), "মোট একশো আশি, চাল একশো চল্লিশ, লবণ চল্লিশ");
    expect(s.figures.filter((f) => f.role !== "qty").map((f) => f.heard)).toEqual([true, true, false]);
    expect(s.extra).toEqual(["180"]);
  });

  test("digits in the transcript read the same", () => {
    const s = scorePart(expectedPart(truth, account), "রহিম বাকি চাল ২ কেজি ১৪০ টাকা লবণ ১ কেজি ৪০ টাকা মোট ১৮০");
    expect(s.figures.every((f) => f.heard)).toBe(true);
  });

  test("a spelling the transcript chose differently is near, not missed", () => {
    const s = scorePart(expectedPart(truth, account), "রহীম বাকি চাল দুই কেজি একশো চল্লিশ লবন এক কেজি চল্লিশ");
    expect(s.words.map((w) => [w.word, w.found])).toEqual([
      ["রহিম", "near"],
      ["চাল", "exact"],
      ["লবণ", "near"],
    ]);
  });

  test("a long word one letter off is near; a short one is a different word", () => {
    const visitOf = (party: string) => expectedPart(truth, { ...visit, party });
    expect(scorePart(visitOf("বিস্কুটওয়ালা"), "বিস্কিটওয়ালার জসীম আসছিল").words.map((w) => w.found)).toEqual(["near", "near", null]);
    // চাল and ডাল are one letter apart and different goods.
    const other = scorePart(expectedPart(truth, account), "করিম, ডাল একশো চল্লিশ, তেল চল্লিশ");
    expect(other.words.map((w) => w.found)).toEqual([null, null, null]);
  });

  test("a visit: the possessive keeps the name, fused hundreds read, markers by their stem", () => {
    const s = scorePart(expectedPart(truth, visit), "সুরমার জসিম আসছিল, আগের দুই হাজার আটশো, পনেরোশো টাকা দিলাম, জুস এক কার্টুন");
    expect(s.figures.every((f) => f.heard)).toBe(true);
    expect(s.words.every((w) => w.found === "exact")).toBe(true);
    expect(s.said.sort()).toEqual(["before", "paid", "visit"]);
  });
});

describe("looseKey", () => {
  test("drops chandrabindu and nukta, and folds letters transcripts swap", () => {
    expect(looseKey("পেঁয়াজ")).toBe(looseKey("পেয়াজ"));
    expect(looseKey("লবণ")).toBe(looseKey("লবন"));
    expect(looseKey("শোধ")).toBe(looseKey("সোধ"));
  });
});
