import { describe, expect, test } from "bun:test";
import {
  type LearningSample,
  type NumberTexts,
  buildWriterProfile,
  correctedFields,
  describeLine,
  digitSwaps,
  personalHints,
} from "./profile";

const none: NumberTexts = { quantityText: null, rateText: null, amountText: null, balanceText: null };

/** A confirmed line; `read` overrides what the model read (defaults to exactly what was confirmed). */
function line(
  id: string,
  doc: string,
  at: string,
  confirmed: Partial<NumberTexts> & { item?: string },
  read: Partial<NumberTexts> | null = {},
  hasCrop = true,
): LearningSample {
  const c = { ...none, ...confirmed };
  return {
    recordId: id,
    documentId: doc,
    confirmedAt: `2026-10-${at}T10:00:00Z`,
    read: read === null ? null : { quantityText: c.quantityText, rateText: c.rateText, amountText: c.amountText, balanceText: c.balanceText, ...read },
    confirmed: { ...c, item: confirmed.item ?? null, unit: null },
    hasCrop,
  };
}

describe("digitSwaps", () => {
  test("a digit read as another, by value, whatever the script", () => {
    expect(digitSwaps("১৪০", "১৮০")).toEqual([{ written: 8, read: 4 }]);
    expect(digitSwaps("140", "১৮০")).toEqual([{ written: 8, read: 4 }]);
    expect(digitSwaps("৩", "৬")).toEqual([{ written: 6, read: 3 }]);
    expect(digitSwaps("১,২৪০", "১২৮০")).toEqual([{ written: 8, read: 4 }]);
  });

  test("the same value in another script, or with other separators, is no misread", () => {
    expect(digitSwaps("180", "১৮০")).toEqual([]);
    expect(digitSwaps("১২০০", "১,২০০")).toEqual([]);
  });

  test("a dropped digit or a different number says nothing about shapes", () => {
    expect(digitSwaps("১৮", "১৮০")).toEqual([]);
    expect(digitSwaps("২৪০", "১৮০")).toEqual([]);
    expect(digitSwaps("৩", "১৮০")).toEqual([]);
    expect(digitSwaps(null, "১৮০")).toEqual([]);
    expect(digitSwaps("১৮০", null)).toEqual([]);
  });

  test("two swaps in a four-digit number still count", () => {
    expect(digitSwaps("১৪৯০", "১৮৭০")).toEqual([
      { written: 8, read: 4 },
      { written: 7, read: 9 },
    ]);
  });
});

describe("correctedFields", () => {
  test("only number fields he changed on a line the model read", () => {
    expect(correctedFields(line("a", "p", "20", { quantityText: "৩", rateText: "৬০", amountText: "১৮০" }, { amountText: "১৪০" }))).toEqual(["amountText"]);
    expect(correctedFields(line("a", "p", "20", { amountText: "১৮০" }, { amountText: "180" }))).toEqual([]);
    expect(correctedFields(line("a", "p", "20", { quantityText: "৩", amountText: "১৮০" }, { quantityText: null }))).toEqual(["quantityText"]);
    expect(correctedFields(line("a", "p", "20", { amountText: "১৮০" }, null))).toEqual([]);
  });
});

describe("buildWriterProfile", () => {
  const samples = [
    line("r1", "p1", "20", { item: "চাল", quantityText: "৩", rateText: "৬০", amountText: "১৮০" }, { amountText: "১৪০" }),
    line("r2", "p2", "22", { item: "ডাল", amountText: "৮৫০" }, { amountText: "৪৫০" }),
    line("r3", "p3", "24", { item: "তেল", quantityText: "২", rateText: "১৮০", amountText: "৩৬০" }, { rateText: "১৪০", amountText: "৩৩০" }),
    line("r4", "p3", "24", { item: "চিনি", amountText: "১৯০" }),
    line("r5", "p4", "25", { item: "লবণ", amountText: "৬০" }),
    line("r6", "p5", "26", { amountText: "৭৫" }, null),
  ];

  test("counts each misread digit, most frequent first, with its lines newest first", () => {
    const p = buildWriterProfile(samples);
    expect(p.confusions.map((c) => [c.written, c.read, c.count])).toEqual([
      [8, 4, 3],
      [6, 3, 1],
    ]);
    expect(p.confusions[0]!.recordIds).toEqual(["r3", "r2", "r1"]);
    expect(p.learnedFrom).toBe(4);
  });

  test("corrected numbers are counted over the latest pages only", () => {
    expect(buildWriterProfile(samples).corrected).toEqual({ numbers: 4, pages: 5 });
    // The two newest pages: p5 (a line he added) and p4 (nothing changed).
    expect(buildWriterProfile(samples, { recentPages: 2 }).corrected).toEqual({ numbers: 0, pages: 2 });
    expect(buildWriterProfile(samples, { recentPages: 3 }).corrected).toEqual({ numbers: 2, pages: 3 });
  });

  test("a page being read again never learns from itself", () => {
    const p = buildWriterProfile(samples, { excludeDocumentId: "p3" });
    expect(p.confusions.map((c) => [c.written, c.read, c.count])).toEqual([[8, 4, 2]]);
    expect(p.references.every((r) => r.documentId !== "p3")).toBe(true);
  });

  test("references: misread lines first, then lines with a hard digit, one per page, photos only", () => {
    const p = buildWriterProfile([...samples, line("r7", "p6", "27", { amountText: "৮০" }, {}, false)]);
    expect(p.references.map((r) => r.recordId)).toEqual(["r3", "r2", "r1", "r5"]);
    expect(p.references[0]!.text).toBe("item তেল · qty ২ · rate ১৮০ · amount ৩৬০");
    expect(buildWriterProfile(samples, { maxReferences: 2 }).references.map((r) => r.recordId)).toEqual(["r3", "r2"]);
  });

  test("references fill up from the same page when there are too few pages", () => {
    const two = [line("a", "p1", "20", { amountText: "১০" }), line("b", "p1", "21", { amountText: "২০" })];
    expect(buildWriterProfile(two).references.map((r) => r.recordId)).toEqual(["b", "a"]);
  });

  test("empty data, and a shop that never corrected anything", () => {
    expect(buildWriterProfile([])).toEqual({ confusions: [], corrected: { numbers: 0, pages: 0 }, learnedFrom: 0, references: [] });
    const clean = buildWriterProfile([line("a", "p1", "20", { amountText: "১০" }, {}, false)]);
    expect(clean.confusions).toEqual([]);
    expect(clean.references).toEqual([]);
  });
});

describe("personalHints", () => {
  test("only repeated misreads reach the prompt, and the key follows what is sent", () => {
    const p = buildWriterProfile(
      [
        line("r1", "p1", "20", { amountText: "১৮০" }, { amountText: "১৪০" }),
        line("r2", "p2", "21", { amountText: "৮৫" }, { amountText: "৪৫" }),
        line("r3", "p3", "22", { amountText: "৬০" }, { amountText: "৩০" }),
      ],
      { maxReferences: 0 },
    );
    const hints = personalHints(p)!;
    expect(hints.confusions.map((c) => [c.written, c.read])).toEqual([[8, 4]]);
    expect(hints.key).toMatch(/^[0-9a-f]{16}$/);
    expect(personalHints({ ...p })!.key).toBe(hints.key);
    expect(personalHints({ ...p, confusions: [{ ...p.confusions[0]!, count: 3 }] })!.key).not.toBe(hints.key);
  });

  test("nothing worth sending yet: no hints", () => {
    expect(personalHints(buildWriterProfile([]))).toBeNull();
    expect(personalHints(buildWriterProfile([line("r1", "p1", "20", { amountText: "১৮০" }, { amountText: "১৪০" }, false)]))).toBeNull();
  });

  test("a line is described from its confirmed fields, never its free text", () => {
    expect(describeLine({ item: "চাল", unit: "কেজি", quantityText: "৩", rateText: "৬০", amountText: "১৮০", balanceText: null })).toBe(
      "item চাল · qty ৩ কেজি · rate ৬০ · amount ১৮০",
    );
  });
});

describe("the sample shop", () => {
  test("teaches a few honest-looking misreads, each one a line the checks would catch", async () => {
    const { demoShop } = await import("@/lib/shop/demo");
    const { validateLedger } = await import("@/lib/validation/engine");
    const shop = demoShop(new Date("2026-11-01T12:00:00Z"));
    const texts = (v: { quantityText: string | null; rateText: string | null; amountText: string | null; balanceText: string | null }) => ({
      quantityText: v.quantityText, rateText: v.rateText, amountText: v.amountText, balanceText: v.balanceText,
    });
    const samples: LearningSample[] = shop.pages.flatMap((p) =>
      p.lines.map((l, i) => ({
        recordId: `${p.key}-${i}`, documentId: p.key, confirmedAt: p.capturedAt, hasCrop: false,
        read: texts(p.readAs?.[i] ?? l), confirmed: { ...texts(l), item: l.item, unit: l.unit },
      })),
    );
    const profile = buildWriterProfile(samples);
    expect(profile.confusions.map((c) => [c.written, c.read, c.count])).toEqual([[8, 4, 4], [6, 3, 2], [1, 9, 1]]);
    expect(profile.corrected.numbers).toBeGreaterThan(0);
    for (const p of shop.pages) {
      for (const [i, read] of Object.entries(p.readAs ?? {})) {
        const findings = validateLedger({
          page: p.page,
          entries: [{ id: "e1", line: 1, values: read, reviewFields: [], uncertaintyReason: null, excluded: false }],
        });
        expect(findings.some((f) => f.status === "fail" && f.entryIds.includes("e1"))).toBe(true);
        expect(p.lines[Number(i)]!.amountText).not.toBe(read.amountText);
      }
    }
  });
});
