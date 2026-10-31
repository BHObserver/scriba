import { describe, expect, test } from "bun:test";
import { makeI18n } from "@/lib/i18n/format";
import type { Risk } from "./accounts";
import { prepareBook } from "./book";
import type { DayPage } from "./note";
import { bookInput, makeRecords, type RecSpec, SAMPLE_TODAY, sampleShop } from "./testing";
import { bnPossessive, noteText, riskText } from "./text";
import { todayInsights } from "./today";
import type { BookInput } from "./types";

const bn = makeI18n("bn");
const en = makeI18n("en");
const checked = (documentId: string): DayPage => ({ documentId, checked: true, waitingLines: 0 });

function noteFor(input: BookInput, asOf: string, pages: DayPage[]) {
  return todayInsights(prepareBook(input), asOf, pages).note;
}

describe("todayInsights", () => {
  test("a new shop has nothing confirmed yet", () => {
    const today = todayInsights(prepareBook(bookInput([], { usualOpeningCashPoisha: 150_000 })), "2026-11-01", []);
    expect(today.isNewShop).toBe(true);
    expect(today.day.expectedCash.poisha).toBe(150_000);
    expect(today.note).toEqual([]);
  });

  test("the sample shop: the day, both dues lists and the note", () => {
    const today = todayInsights(prepareBook(sampleShop()), SAMPLE_TODAY, []);
    expect(today.isNewShop).toBe(false);
    expect(today.day.expectedCash.poisha).toBe(432_000);
    expect(today.customerDues.flagged).toBe(3);
    expect(today.supplierDues.parties).toHaveLength(3);
    expect(today.week.days).toHaveLength(7);
    expect(today.note).toHaveLength(3);
  });
});

describe("Scriba's note on D3's sample shop", () => {
  const pages = [checked("p1"), checked("p2"), checked("p3")];

  test("sales split, the riskiest due, the week, in Bangla", () => {
    const note = noteFor(sampleShop(), SAMPLE_TODAY, pages);
    expect(note.map((s) => s.kind)).toEqual(["sales", "due_risk", "week_trend"]);
    expect(note.map((s) => noteText(s, bn))).toEqual([
      "আজ বিক্রি ৳৬,২৯০, এর মধ্যে ৳১,৩৪০ বাকিতে।",
      "রহিম উদ্দিনের ৳৩,২৫০ বাকি, ৪৫ দিন কোনো জমা নেই।",
      "এই সাত দিনে বিক্রি আগের সাত দিনের চেয়ে ৳৮,১৭০ বেশি।",
    ]);
  });

  test("the same in English, the name as he wrote it", () => {
    const note = noteFor(sampleShop(), SAMPLE_TODAY, pages);
    expect(note.map((s) => noteText(s, en))).toEqual([
      "Sales today ৳6,290, ৳1,340 of it on credit.",
      "রহিম উদ্দিন owes ৳3,250. No payment in 45 days.",
      "Sales these 7 days are ৳8,170 more than the 7 days before.",
    ]);
  });

  test("an unchecked page comes first and pushes the week out", () => {
    const note = noteFor(sampleShop(), SAMPLE_TODAY, [...pages, { documentId: "p4", checked: false, waitingLines: 7 }]);
    expect(note.map((s) => s.kind)).toEqual(["pending_pages", "sales", "due_risk"]);
    expect(note[0]).toMatchObject({ pageNumbers: [4], waitingLines: 7, documentIds: ["p4"] });
    expect(noteText(note[0]!, bn)).toBe("পাতা ৪ এখনো দেখা হয়নি, তাই এর লাইন আজকের হিসাবে ধরা হয়নি।");
  });

  test("every number sentence names its records", () => {
    const note = noteFor(sampleShop(), SAMPLE_TODAY, pages);
    expect(note[0]!.recordIds).toHaveLength(16);
    expect(note[1]!.recordIds).toHaveLength(2);
    expect(note[2]!.recordIds.length).toBeGreaterThan(0);
  });
});

describe("Scriba's note, other days", () => {
  const input = (specs: RecSpec[]) => bookInput(makeRecords(specs));

  test("a new shop with nothing confirmed says nothing", () => {
    expect(noteFor(input([]), "2026-11-01", [])).toEqual([]);
  });

  test("a page waiting on a new shop's first day", () => {
    const note = noteFor(input([]), "2026-11-01", [
      { documentId: "a", checked: false, waitingLines: 4 },
      { documentId: "b", checked: false, waitingLines: 3 },
    ]);
    expect(note.map((s) => noteText(s, bn))).toEqual(["২টি পাতা এখনো দেখা হয়নি, তাই সেগুলোর লাইন আজকের হিসাবে ধরা হয়নি।"]);
    expect(noteText(note[0]!, en)).toBe("2 pages aren't checked yet, so their lines aren't in today's figures.");
  });

  test("a day with lines but no sales", () => {
    const note = noteFor(input([{ date: "2026-11-01", type: "expense", taka: 150 }]), "2026-11-01", [checked("doc-2026-11-01")]);
    expect(note.map((s) => noteText(s, bn))).toEqual(["আজকের খাতায় এখনো কোনো বিক্রি নেই।"]);
  });

  test("all sales in cash, and a week down", () => {
    const note = noteFor(
      input([
        { date: "2026-10-19", type: "cash_sale", taka: 5000 },
        { date: "2026-11-01", type: "cash_sale", taka: 1200 },
      ]),
      "2026-11-01",
      [checked("doc-2026-11-01")],
    );
    expect(note.map((s) => noteText(s, bn))).toEqual([
      "আজ বিক্রি ৳১,২০০, সবটাই নগদে।",
      "এই সাত দিনে বিক্রি আগের সাত দিনের চেয়ে ৳৩,৮০০ কম।",
    ]);
    expect(noteText(note[0]!, en)).toBe("Sales today ৳1,200, all of it in cash.");
  });

  test("the same sales as the week before", () => {
    const note = noteFor(
      input([
        { date: "2026-10-19", type: "cash_sale", taka: 700 },
        { date: "2026-10-26", type: "cash_sale", taka: 700 },
      ]),
      "2026-11-01",
      [],
    );
    expect(note.map((s) => noteText(s, en))).toEqual(["Sales these 7 days match the 7 days before."]);
  });
});

describe("bnPossessive", () => {
  test.each([
    ["করিম", "করিমের"],
    ["রহিম উদ্দিন", "রহিম উদ্দিনের"],
    ["আল-আমিন এন্টারপ্রাইজ", "আল-আমিন এন্টারপ্রাইজের"],
    ["মিনু দিদি", "মিনু দিদির"],
    ["সুমাইয়া আপা", "সুমাইয়া আপার"],
    ["বাবু", "বাবুর"],
    ["রহিম ভাই", "রহিম ভাইয়ের"],
    ["খাঁ", "খাঁর"],
    ["শরৎ", "শরতের"],
    ["Rahim", "Rahim-এর"],
    ["রহিম ২", "রহিম ২-এর"],
  ])("%s → %s", (name, expected) => {
    expect(bnPossessive(name).normalize("NFC")).toBe(expected.normalize("NFC"));
  });
});

describe("riskText", () => {
  const noPayment: Risk = { code: "no_payment", rank: 3, days: 24, recordIds: [] };
  const growing: Risk = { code: "growing", rank: 2, weeks: 3, recordIds: [] };
  const big: Risk = { code: "big_credit", rank: 1, amountPoisha: 150_000, usualPoisha: 30_000, recordIds: [] };

  test("customers", () => {
    expect([noPayment, growing, big].map((r) => riskText(r, "customer", bn))).toEqual([
      "২৪ দিন কোনো জমা নেই",
      "৩ সপ্তাহ ধরে বাকি বাড়ছে",
      "একবারে ৳১,৫০০ বাকি, সাধারণত ৳৩০০",
    ]);
    expect(riskText(big, "customer", en)).toBe("৳1,500 on credit at once, usually ৳300");
  });

  test("suppliers", () => {
    expect(riskText(noPayment, "supplier", bn)).toBe("২৪ দিন কিছু দেওয়া হয়নি");
    expect(riskText(growing, "supplier", en)).toBe("What you owe is up 3 weeks running");
    expect(riskText(big, "supplier", bn)).toBe("একবারে ৳১,৫০০-এর মাল বাকিতে, সাধারণত ৳৩০০");
  });
});
