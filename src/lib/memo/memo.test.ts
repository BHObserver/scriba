/**
 * U4: reading a company memo (schema, request, parse, its own sums) and matching it to a page
 * (which visit, which goods line). No model calls: outputs are written by hand.
 */
import { describe, expect, test } from "bun:test";
import { buildExtractionRequest } from "@/lib/meta/transport";
import { blocksNamedOnMemo, nameScore, pairLines } from "./match";
import { memoLine, memoOf } from "./memo-fixture.test-util";
import { storedMemo } from "./parse";
import { MEMO_PROFILE } from "./prompt";
import { MEMO_FIELDS, MEMO_JSON_SCHEMA, MEMO_LINE_KEYS, MEMO_TOTAL_FIELDS, memoOutputSchema } from "./schema";

const line = memoLine;

describe("the memo schema and request", () => {
  test("the JSON Schema sent to Meta and the local zod schema have the same fields", () => {
    expect(Object.keys(MEMO_JSON_SCHEMA.properties.memo.properties).sort()).toEqual([...MEMO_FIELDS].sort());
    expect(Object.keys(memoOutputSchema.shape.memo.shape).sort()).toEqual([...MEMO_FIELDS].sort());
    expect(Object.keys(MEMO_JSON_SCHEMA.properties.lines.items.properties).sort()).toEqual([...MEMO_LINE_KEYS].sort());
    expect(Object.keys(memoOutputSchema.shape.lines.element.shape).sort()).toEqual([...MEMO_LINE_KEYS].sort());
    expect(Object.keys(MEMO_JSON_SCHEMA.properties.totals.properties).sort()).toEqual([...MEMO_TOTAL_FIELDS].sort());
    expect(Object.keys(memoOutputSchema.shape.totals.shape).sort()).toEqual([...MEMO_TOTAL_FIELDS].sort());
  });

  test("strict-mode requirements: every object closes additionalProperties and requires all keys", () => {
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      Object.values(n).forEach(visit);
    };
    visit(MEMO_JSON_SCHEMA);
  });

  test("a memo request carries the memo prompt and schema only, whatever else is passed", () => {
    const request = buildExtractionRequest(
      { modelId: "m", reasoningEffort: "low", maxOutputTokens: 100 },
      { imageBytes: new Uint8Array([1]), mimeType: "image/png", memo: true, layout: "scriba_khata", personal: { text: "notes", reference: null } },
    );
    expect(request.instructions).toBe(MEMO_PROFILE.instructions);
    expect(request.text.format.name).toBe("scriba_company_memo_v1");
    expect(request.input[0]!.content.map((c) => c.type)).toEqual(["input_text", "input_image"]);
    expect(request.input[0]!.content[0]).toEqual({ type: "input_text", text: "Transcribe this company memo." });
    expect(MEMO_PROFILE.instructions).toContain("Never write a price, amount or total that is not on the memo.");
  });
});

describe("a memo's reading and its own sums", () => {
  test("figures are read by code, and the lines are checked against the total", () => {
    const m = memoOf();
    expect(m.company).toBe("PRAN Agro Ltd.");
    expect(m.lines.map((l) => [l.quantityMilli, l.ratePoisha, l.amountPoisha, l.multiplies])).toEqual([
      [1000, 48000, 48000, true],
      [2000, 36000, 72000, true],
      [1000, 50000, 50000, true],
    ]);
    expect(m.totals.total).toEqual({ text: "1,700.00", poisha: 170000 });
    expect(m.check).toEqual({ linesSum: 170000, total: 170000, agrees: true });
    expect(storedMemo(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(storedMemo({ schemaVersion: "scriba-extraction-3" })).toBeNull();
  });

  test("a discount explains a smaller total; a total that nothing explains disagrees", () => {
    expect(memoOf({ totals: { subtotal: "1,700", discount: "-50", total: "1,650" } }).check).toEqual({ linesSum: 170000, total: 165000, agrees: true });
    expect(memoOf({ totals: { discount: "(50)", total: "1650" } }).check).toEqual({ linesSum: 170000, total: 165000, agrees: true });
    expect(memoOf({ totals: { total: "1,650" } }).check).toEqual({ linesSum: 170000, total: 165000, agrees: false });
    // A subtotal that isn't the lines' sum means a figure was misread, whatever the total says.
    expect(memoOf({ totals: { subtotal: "1,750", discount: "50", total: "1,700" } }).check.agrees).toBe(false);
  });

  test("a percentage discount leaves the total unchecked; no total at all leaves the lines' sum", () => {
    expect(memoOf({ totals: { discount: "2%", total: "1,666" } }).check).toEqual({ linesSum: 170000, total: 166600, agrees: null });
    expect(memoOf({ totals: { total: null } }).check).toEqual({ linesSum: 170000, total: 170000, agrees: null });
  });

  test("crossed-out rows don't count; a row that doesn't multiply out is marked; unreadable amounts are warned about", () => {
    const m = memoOf({
      lines: [
        line("m1", "Mango Juice", "1", "Ctn", "480", "480"),
        line("m2", "Litchi", "1", "Ctn", "400", "400", { crossed_out: true }),
        line("m3", "Biscuit", "2", "Ctn", "360", "702"),
        line("m3", "Chanachur", "1", "Ctn", "500", "5O0"),
      ],
      totals: { total: null },
    });
    expect(m.lines.map((l) => l.id)).toEqual(["m1", "m2", "m3", "m5"]);
    expect(m.lines[2]!.multiplies).toBe(false);
    expect(m.lines[3]!.amountPoisha).toBeNull();
    expect(m.check.linesSum).toBeNull();
    expect(m.warnings).toContain('m5: the amount "5O0" doesn\'t read as a number.');
  });

  test("Bangla digits, taka signs and rounding to the taka", () => {
    const m = memoOf({ lines: [line("m1", "জুস", "৩", "কার্টুন", "১৫৩.৩৩", "৪৬০"), line("m2", "চানাচুর", "1", "Ctn", null, "Tk 500")], totals: { total: "৳৯৬০" } });
    expect(m.lines.map((l) => [l.amountPoisha, l.multiplies])).toEqual([[46000, true], [50000, null]]);
    expect(m.check).toEqual({ linesSum: 96000, total: 96000, agrees: true });
  });
});

describe("matching a memo to the page", () => {
  test("names meet across scripts and spellings", () => {
    expect(nameScore("Praan", "PRAN Agro Ltd.")).toBe(2);
    expect(nameScore("প্রাণ", "PRAN-RFL Group")).toBe(2);
    expect(nameScore("ফ্রেশ", "Fresh (Meghna Group)")).toBe(2);
    expect(nameScore("Fresh", "ACI Limited")).toBe(0);
    const pran = new Set(["pran"]);
    expect(nameScore("Juice", "PRAN Mango Juice 250ml", pran)).toBe(2);
    expect(nameScore("জুস", "Mango Juice", pran)).toBe(1);
    expect(nameScore("Buiscite", "PRAN Potato Biscuit 40g", pran)).toBe(1);
    expect(nameScore("বিস্কুট", "Potato Biscuits", pran)).toBe(1);
    expect(nameScore("Conacor", "PRAN Chanachur 300g", pran)).toBe(1);
    expect(nameScore("চানাচুর", "Chanachur", pran)).toBe(2);
    expect(nameScore("Juice", "Chanachur", pran)).toBe(0);
    // Pack words and sizes say nothing about the product.
    expect(nameScore("Box", "Biscuit 1 Box")).toBe(0);
  });

  test("a memo belongs to the visit whose company or rep it names", () => {
    const visits = [
      { block: "b1", party: "প্রাণ", person: "সেলিম" },
      { block: "b3", party: "ফ্রেশ", person: "কামাল" },
    ];
    expect(blocksNamedOnMemo(memoOf(), visits)).toEqual(["b1"]);
    expect(blocksNamedOnMemo(memoOf({ company: null, person: "Kamal" }), visits)).toEqual(["b3"]);
    expect(blocksNamedOnMemo(memoOf({ company: "Akij Food", person: null }), visits)).toEqual([]);
  });

  test("the Pran page's goods each find their memo line", () => {
    const goods = [
      { id: "r3", item: "Juice", quantityMilli: 1000 },
      { id: "r4", item: "Buiscite", quantityMilli: 2000 },
      { id: "r5", item: "Conacor", quantityMilli: 1000 },
    ];
    expect(pairLines(goods, memoOf())).toEqual({
      pairs: [
        { goods: "r3", line: "m1", sure: true },
        { goods: "r4", line: "m2", sure: true },
        { goods: "r5", line: "m3", sure: true },
      ],
      unmatched: [],
    });
  });

  test("two biscuits on the memo: the quantity decides, or both are offered", () => {
    const lines = [line("m1", "Potato Biscuit", "2", "Ctn", "360", "720"), line("m2", "Lexus Biscuit", "1", "Ctn", "300", "300")];
    expect(pairLines([{ id: "r1", item: "বিস্কুট", quantityMilli: 2000 }], memoOf({ lines })).pairs).toEqual([{ goods: "r1", line: "m1", sure: true }]);
    expect(pairLines([{ id: "r1", item: "বিস্কুট", quantityMilli: 3000 }], memoOf({ lines }))).toEqual({
      pairs: [
        { goods: "r1", line: "m1", sure: false },
        { goods: "r1", line: "m2", sure: false },
      ],
      unmatched: [],
    });
  });

  test("a name that matches nothing is never guessed, unless it is the last one left with the same quantity", () => {
    const goods = [
      { id: "r1", item: "Juice", quantityMilli: 1000 },
      { id: "r2", item: "Frooto", quantityMilli: 2000 },
    ];
    const lines = [line("m1", "Mango Juice", "1", "Ctn", "480", "480"), line("m2", "Litchi Drink", "2", "Ctn", "400", "800"), line("m3", "Chips", "1", "Ctn", "300", "300")];
    expect(pairLines(goods, memoOf({ lines }))).toEqual({ pairs: [{ goods: "r1", line: "m1", sure: true }], unmatched: ["m2", "m3"] });
    expect(pairLines(goods, memoOf({ lines: lines.slice(0, 2) }))).toEqual({
      pairs: [
        { goods: "r1", line: "m1", sure: true },
        { goods: "r2", line: "m2", sure: true },
      ],
      unmatched: [],
    });
  });
});
