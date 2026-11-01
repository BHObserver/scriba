import { describe, expect, test } from "bun:test";
import { makeI18n } from "@/lib/i18n/format";
import {
  afterText,
  balanceLabel,
  bnLocative,
  bnObjective,
  dateLabel,
  duesHref,
  duesTab,
  entryText,
  mergeOrder,
  mergeWhat,
  nameMatches,
  oldestText,
  quietText,
  reminderLines,
  reminderPhotoIds,
  whenLabel,
} from "./dues-model";

const bn = makeI18n("bn");
const en = makeI18n("en");
const TODAY = "2026-11-01";

describe("dates on the dues screens", () => {
  test("today and yesterday by name, other days by date", () => {
    expect(dateLabel(TODAY, TODAY, bn)).toBe("আজ");
    expect(dateLabel("2026-10-31", TODAY, bn)).toBe("গতকাল");
    expect(dateLabel("2026-10-19", TODAY, bn)).toBe("১৯ অক্টোবর");
    expect(dateLabel("2026-10-31", TODAY, en)).toBe("yesterday");
  });

  test("an older date carries how long ago it was", () => {
    expect(whenLabel("2026-10-19", TODAY, bn)).toBe("১৯ অক্টোবর, ১৩ দিন আগে");
    expect(whenLabel("2026-10-19", TODAY, en)).toMatch(/^19 Oct\w*, 13 days ago$/);
    expect(whenLabel(TODAY, TODAY, bn)).toBe("আজ");
  });

  test("a row without a risk says when money last came, or that it never did", () => {
    expect(quietText("customer", "2026-10-28", TODAY, bn)).toBe("শেষ জমা ২৮ অক্টোবর, ৪ দিন আগে");
    expect(quietText("supplier", "2026-10-31", TODAY, bn)).toBe("শেষ দেওয়া গতকাল");
    expect(quietText("customer", null, TODAY, bn)).toBe("এখনো কোনো জমা নেই");
    expect(quietText("supplier", null, TODAY, en)).toBe("Nothing paid yet");
  });
});

describe("Bangla name endings", () => {
  test("locative of a shop name", () => {
    expect(bnLocative("মায়ের দোয়া স্টোর")).toBe("মায়ের দোয়া স্টোরে");
    expect(bnLocative("মায়ের দোয়া")).toBe("মায়ের দোয়ায়");
    expect(bnLocative("রহিম বাড়ি")).toBe("রহিম বাড়িতে");
    expect(bnLocative("ভাই ভাই বিতান")).toBe("ভাই ভাই বিতানে");
    expect(bnLocative("Rahman Store")).toBe("Rahman Store-এ");
    expect(bnLocative("  হক স্টোর ")).toBe("হক স্টোরে");
  });

  test("objective of a name", () => {
    expect(bnObjective("আল-আমিন")).toBe("আল-আমিনকে");
    expect(bnObjective("মিনু দিদি")).toBe("মিনু দিদিকে");
    expect(bnObjective("Rafiq")).toBe("Rafiq-কে");
  });

  test("the ledger hero says who owes whom", () => {
    expect(balanceLabel("customer", "রহিম উদ্দিন", 124000, bn)).toBe("রহিম উদ্দিনের কাছে পাবেন");
    expect(balanceLabel("supplier", "আল-আমিন এন্টারপ্রাইজ", 500000, bn)).toBe("আল-আমিন এন্টারপ্রাইজকে দিতে হবে");
    expect(balanceLabel("customer", "রহিম উদ্দিন", 124000, en)).toBe("রহিম উদ্দিন owes you");
    expect(balanceLabel("customer", "করিম", -5000, bn)).toBe("করিম বেশি জমা দিয়েছেন");
  });

  test("the oldest unpaid credit names its day", () => {
    expect(oldestText("2026-10-19", 80000, TODAY, bn)).toBe("১৯ অক্টোবরের ৳৮০০");
    expect(oldestText("2026-10-31", 80000, TODAY, bn)).toBe("গতকালের ৳৮০০");
    expect(oldestText(TODAY, 80000, TODAY, bn)).toBe("আজকের ৳৮০০");
    expect(oldestText("2026-10-19", 80000, TODAY, en)).toMatch(/^৳800 from 19 Oct/);
  });

  test("a merge says where the lines go before he confirms", () => {
    expect(mergeWhat("রহিম", "রহিম উদ্দিন", bn)).toBe("রহিমের সব লাইন রহিম উদ্দিনের খাতায় যাবে।");
    expect(mergeWhat("রহিম", "রহিম উদ্দিন", en)).toBe("All lines under রহিম will move to রহিম উদ্দিন.");
  });
});

describe("merging two spellings", () => {
  const targets = [{ name: "করিম মিয়া" }, { name: "মোঃ রহিম" }, { name: "শাহানা বেগম" }, { name: "রহিম উদ্দিন" }];

  test("the same first name comes first, the rest keep their order", () => {
    expect(mergeOrder("রহিম ভাই", targets).map((t) => t.name)).toEqual(["মোঃ রহিম", "রহিম উদ্দিন", "করিম মিয়া", "শাহানা বেগম"]);
    expect(mergeOrder("জসিম", targets).map((t) => t.name)).toEqual(targets.map((t) => t.name));
  });

  test("a shared family-name ending isn't a match", () => {
    expect(mergeOrder("নাসির উদ্দিন", targets).map((t) => t.name)).toEqual(targets.map((t) => t.name));
  });

  test("the search finds spelling variants", () => {
    expect(nameMatches("করীম", "করিম মিয়া")).toBe(true);
    expect(nameMatches("শাহানা", "করিম মিয়া")).toBe(false);
    expect(nameMatches("  ", "করিম মিয়া")).toBe(true);
  });
});

describe("the ledger timeline", () => {
  const rice = { item: "চাল", quantityText: "2", unit: "কেজি", rateText: "60", type: "credit_sale" as const };

  test("a line is the verb and what was written, without the party's name", () => {
    expect(entryText("customer", "up", rice, bn)).toBe("বাকিতে নিলেন · চাল · ২ কেজি × ৬০");
    expect(entryText("customer", "down", { item: "জমা", quantityText: null, unit: null, rateText: null, type: "repayment" }, bn)).toBe("জমা দিলেন");
    expect(entryText("supplier", "up", null, en)).toBe("Stock on credit");
    expect(entryText("customer", "start", null, bn)).toBe("আগের বাকি");
  });

  test("the balance after a line, settled or paid ahead", () => {
    expect(afterText("customer", 124000, bn)).toBe("এরপর বাকি ৳১,২৪০");
    expect(afterText("supplier", 0, bn)).toBe("এরপর কোনো দেনা নেই");
    expect(afterText("customer", -5000, en)).toBe("Then ৳50 paid ahead");
  });
});

describe("the reminder", () => {
  const base = { name: "রহিম ভাই", shopName: "মায়ের দোয়া স্টোর", balancePoisha: 124000, lastPaymentDate: "2026-10-19", withPhoto: true };

  test("greeting, what is due where, the last payment, the ask and the signature", () => {
    expect(reminderLines(base, bn)).toEqual([
      "রহিম ভাই, কেমন আছেন?",
      "মায়ের দোয়া স্টোরে আপনার ৳১,২৪০ বাকি আছে। শেষ জমা দিয়েছিলেন ১৯ অক্টোবর।",
      "খাতার লাইনের ছবি সাথে দিলাম। সুবিধামতো দিয়ে গেলে খুশি হব।",
      "— মায়ের দোয়া স্টোর",
    ]);
  });

  test("no photo, no payment yet, no shop name: it says only what is true", () => {
    const lines = reminderLines({ ...base, shopName: "  ", lastPaymentDate: null, withPhoto: false }, bn);
    expect(lines).toEqual(["রহিম ভাই, কেমন আছেন?", "আমার দোকানে আপনার ৳১,২৪০ বাকি আছে।", "সুবিধামতো দিয়ে গেলে খুশি হব।"]);
  });

  test("English keeps the shop's own name", () => {
    expect(reminderLines(base, en)[1]).toMatch(/^You have ৳1,240 due at মায়ের দোয়া স্টোর\. Your last payment was on 19 Oct/);
  });

  test("the picture takes the newest unpaid lines that have a photo, at most 8", () => {
    const unpaid = Array.from({ length: 12 }, (_, i) => `r${i}`);
    expect(reminderPhotoIds(unpaid, new Set(["r1", "r3"]))).toEqual(["r1", "r3"]);
    expect(reminderPhotoIds(unpaid, new Set(unpaid))).toEqual(unpaid.slice(4));
    expect(reminderPhotoIds(unpaid, new Set())).toEqual([]);
  });
});

describe("the dues tabs", () => {
  test("payables only when asked for", () => {
    expect(duesTab("supplier")).toBe("supplier");
    expect(duesTab(undefined)).toBe("customer");
    expect(duesTab(["supplier"])).toBe("customer");
    expect(duesHref("supplier")).toBe("/parties?tab=supplier");
    expect(duesHref("customer")).toBe("/parties");
  });
});
