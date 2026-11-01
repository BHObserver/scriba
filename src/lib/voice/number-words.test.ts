import { describe, expect, test } from "bun:test";
import { parseSpokenNumber, readSpokenNumbers } from "./number-words";

const one = (text: string) => parseSpokenNumber(text);

describe("Bangla number words", () => {
  test.each([
    ["শূন্য", "0"],
    ["এক", "1"],
    ["আট", "8"],
    ["দশ", "10"],
    ["উনিশ", "19"],
    ["ঊনিশ", "19"],
    ["বিশ", "20"],
    ["কুড়ি", "20"],
    ["পঁচিশ", "25"],
    ["পচিশ", "25"],
    ["ষাট", "60"],
    ["ঊননব্বই", "89"],
    ["উননব্বই", "89"],
    ["নিরানব্বই", "99"],
  ])("%s → %s", (text, value) => {
    expect(one(text)).toEqual({ kind: "one", value });
  });

  test("every standard word 0–99 reads as itself", () => {
    const words = "শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো ঊনিশ বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আটাশ ঊনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ ঊনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ ঊনপঞ্চাশ পঞ্চাশ একান্ন বাহান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন ঊনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি ঊনসত্তর সত্তর একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর ঊনআশি আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি আটাশি ঊননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই".split(" ");
    expect(words).toHaveLength(100);
    // Each word on its own, with a gap between, so no two can join.
    words.forEach((w, n) => expect(one(`${w} টাকা`)).toEqual({ kind: "one", value: String(n) }));
  });

  test("য় and ড় read the same whether the transcript composes them or not", () => {
    expect(one("ছয়")).toEqual({ kind: "one", value: "6" });
    expect(one("ছয়")).toEqual({ kind: "one", value: "6" });
    expect(one("আড়াইশো")).toEqual({ kind: "one", value: "250" });
    expect(one("আড়াইশো")).toEqual({ kind: "one", value: "250" });
  });
});

describe("hundreds, thousands, lakhs", () => {
  test.each([
    ["একশো আশি", "180"],
    ["এক শো আশি", "180"],
    ["একশ আশি", "180"],
    ["একশত আশি", "180"],
    ["একশ' আশি", "180"],
    ["আটশো", "800"],
    ["দুশো", "200"],
    ["দুইশো পঞ্চাশ", "250"],
    ["ছশো", "600"],
    ["বারোশো", "1200"],
    ["বারশো", "1200"],
    ["পনেরোশো পঞ্চাশ", "1550"],
    ["শো", "100"],
    ["হাজার", "1000"],
    ["এক হাজার", "1000"],
    ["দুই হাজার পাঁচশো পঞ্চাশ", "2550"],
    ["তিন হাজার দুইশো", "3200"],
    ["দুহাজার", "2000"],
    ["এক লাখ পঞ্চাশ হাজার", "150000"],
    ["দুই লক্ষ", "200000"],
    ["এক কোটি", "10000000"],
  ])("%s → %s", (text, value) => {
    expect(one(text)).toEqual({ kind: "one", value });
  });
});

describe("fractions: দেড়, আড়াই, সাড়ে, সোয়া, পৌনে", () => {
  test.each([
    ["দেড়", "1.5"],
    ["আড়াই", "2.5"],
    ["আধা", "0.5"],
    ["দেড়শো", "150"],
    ["দেড়শ", "150"],
    ["আড়াইশো", "250"],
    ["দেড় হাজার", "1500"],
    ["আড়াই হাজার", "2500"],
    ["সাড়ে তিন", "3.5"],
    ["সাড়ে তিনশো", "350"],
    ["সাড়ে বারোশো", "1250"],
    ["সাড়ে চার হাজার", "4500"],
    ["সোয়া দুই", "2.25"],
    ["সোয়া দুইশো", "225"],
    ["পৌনে পাঁচশো", "475"],
    ["পৌনে এক", "0.75"],
    ["সাড়ে তিন কেজি", "3.5"],
  ])("%s → %s", (text, value) => {
    expect(one(text)).toEqual({ kind: "one", value });
  });

  test("a modifier with nothing after it is not a number", () => {
    expect(one("সাড়ে")).toEqual({ kind: "none" });
    expect(one("সাড়ে দেড়")).toEqual({ kind: "none" });
  });
});

describe("taka, poisha and decimals", () => {
  test.each([
    ["একশো আশি টাকা", "180"],
    ["আশি টাকা পঞ্চাশ পয়সা", "80.5"],
    ["বারো টাকা পাঁচ পয়সা", "12.05"],
    ["পঞ্চাশ পয়সা", "0.5"],
    ["তিন দশমিক পাঁচ", "3.5"],
    ["তিন পয়েন্ট দুই পাঁচ", "3.25"],
    ["তিন দশমিক পঁচিশ", "3.25"],
    ["দুই পয়েন্ট ৭৫", "2.75"],
    ["একশো আশি টাকা।", "180"],
    ["আশিটাকা", "80"],
  ])("%s → %s", (text, value) => {
    expect(one(text)).toEqual({ kind: "one", value });
  });

  test("too many decimals, or a point after a fraction, places nothing", () => {
    expect(one("তিন দশমিক এক দুই তিন চার")).toEqual({ kind: "none" });
    expect(one("দেড় দশমিক পাঁচ")).toEqual({ kind: "none" });
  });

  test("a number after taka that is not poisha is a second number", () => {
    expect(one("দুই টাকা তিন")).toEqual({ kind: "many", values: ["2", "3"] });
  });
});

describe("digits in the transcript", () => {
  test.each([
    ["১৮০", "180"],
    ["180", "180"],
    ["১,২০০", "1200"],
    ["1,20,000", "120000"],
    ["৩.৫", "3.5"],
    ["৳১৮০", "180"],
    ["১৮০/-", "180"],
    ["১৮০ টাকা", "180"],
    ["১৮০টাকা", "180"],
    ["৩টা", "3"],
    ["৩ হাজার ২০০", "3200"],
    ["২ শো", "200"],
    ["২শো", "200"],
    ["১.৫ হাজার", "1500"],
    ["সাড়ে ৩", "3.5"],
  ])("%s → %s", (text, value) => {
    expect(one(text)).toEqual({ kind: "one", value });
  });

  test("digits one by one join", () => {
    expect(one("১ ৮ ০")).toEqual({ kind: "one", value: "180" });
  });
});

describe("counters and filler words", () => {
  test.each([
    ["তিনটা", "3"],
    ["দুটো", "2"],
    ["একটি", "1"],
    ["তিনটে", "3"],
    ["চারখানা", "4"],
    ["দাম হবে একশো আশি টাকা", "180"],
    ["এখানে আটশো হবে", "800"],
  ])("%s → %s", (text, value) => {
    expect(one(text)).toEqual({ kind: "one", value });
  });

  test("বার alone means 'times', not twelve", () => {
    expect(one("দুই বার")).toEqual({ kind: "one", value: "2" });
  });
});

describe("digits said one by one", () => {
  test("adjacent digit words join into one number", () => {
    expect(one("এক আট শূন্য")).toEqual({ kind: "one", value: "180" });
    expect(one("শূন্য পাঁচ")).toEqual({ kind: "one", value: "5" });
    expect(one("one eight zero")).toEqual({ kind: "one", value: "180" });
  });

  test("punctuation or a word between digits keeps them apart", () => {
    expect(one("তিন, চার")).toEqual({ kind: "many", values: ["3", "4"] });
    expect(one("তিন কেজি চার")).toEqual({ kind: "many", values: ["3", "4"] });
  });

  test("a digit next to a bigger number does not join", () => {
    expect(one("তিন ষাট")).toEqual({ kind: "many", values: ["3", "60"] });
  });
});

describe("several numbers or none", () => {
  test("a whole line read aloud gives every number; the person picks", () => {
    expect(one("তিন কেজি ষাট টাকা একশো আশি")).toEqual({ kind: "many", values: ["3", "60", "180"] });
  });

  test("two scales that don't descend are two numbers", () => {
    expect(readSpokenNumbers("দুই হাজার তিন হাজার")).toEqual(["2000", "3000"]);
    expect(readSpokenNumbers("এক হাজার ২০০০")).toEqual(["1000", "2000"]);
  });

  test("the same number said twice is one number", () => {
    expect(one("একশো আশি, একশো আশি")).toEqual({ kind: "one", value: "180" });
  });

  test("no number at all", () => {
    expect(one("")).toEqual({ kind: "none" });
    expect(one("ঠিক আছে")).toEqual({ kind: "none" });
    expect(one("কটা")).toEqual({ kind: "none" });
  });

  test("absurdly large numbers are dropped, not wrapped", () => {
    expect(one("৯৯৯৯৯৯৯৯৯৯৯৯ কোটি")).toEqual({ kind: "none" });
  });
});

describe("English (the English screen)", () => {
  test.each([
    ["one hundred eighty", "180"],
    ["one hundred and eighty", "180"],
    ["a hundred", "100"],
    ["twenty five", "25"],
    ["twenty-five", "25"],
    ["one thousand two hundred fifty", "1250"],
    ["two thousand and five", "2005"],
    ["three point five", "3.5"],
    ["180 taka", "180"],
    ["Eight Hundred", "800"],
  ])("%s → %s", (text, value) => {
    expect(one(text)).toEqual({ kind: "one", value });
  });

  test("'one fifty' is two numbers, not a guess at 150", () => {
    expect(one("one fifty")).toEqual({ kind: "many", values: ["1", "50"] });
  });

  test("'and' between plain numbers separates them", () => {
    expect(one("three and four")).toEqual({ kind: "many", values: ["3", "4"] });
  });
});
