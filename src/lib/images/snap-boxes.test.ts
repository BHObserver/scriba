import { describe, expect, test } from "bun:test";
import type { NormalizedEntry, NormalizedExtraction } from "@/lib/extraction/parse";
import { linesOf, snapReadingBoxes } from "./snap-boxes";

function entry(id: string, line: number, block: string | undefined, bbox: NormalizedEntry["bbox"]): NormalizedEntry {
  return {
    candidateId: id,
    line,
    values: { sourceText: id, type: "cash_sale", customer: null, item: null, quantityText: null, unit: null, rateText: null, amountText: "১০", balanceText: null, crossedOut: false, ...(block ? { block } : {}) },
    reviewFields: [],
    uncertaintyReason: null,
    bbox,
    numbers: { quantityMilli: null, ratePoisha: null, amountPoisha: 1000, balancePoisha: null },
  };
}

function reading(entries: NormalizedEntry[], titled: string[] = []): NormalizedExtraction {
  const blocks = [...new Set(entries.map((e) => e.values.block).filter((b): b is string => !!b))];
  return {
    schemaVersion: "scriba-extraction-3",
    promptVersion: "scriba-prompt-6",
    page: { dateText: null, dateIso: null, ledgerType: "mixed", accountName: null, legibility: "clear", openingBalancePoisha: null, closingBalancePoisha: null, writtenTotals: [] },
    entries,
    blocks: blocks.map((id) => ({ id, kind: "other", title: titled.includes(id) ? "প্রাণের সেলিম" : null, party: null, person: null, dateText: null, box: null })),
    warnings: [],
  };
}

const box = (y: number) => ({ x_min: 100, x_max: 800, y_min: y, y_max: y + 25 });

describe("snapping a reading's boxes (F2 fix 6)", () => {
  test("the first line of a titled block expects its heading above it; no other line does", () => {
    const r = reading([entry("e1", 1, "b1", box(100)), entry("e2", 2, "b2", box(150)), entry("e3", 3, "b2", box(200)), entry("e4", 4, "b3", box(250))], ["b2"]);
    expect(linesOf(r).map((l) => l.opensTitledBlock)).toEqual([false, true, false, false]);
    expect(linesOf(r).map((l) => l.block)).toEqual(["b1", "b2", "b2", "b3"]);
  });

  test("a photo that can't be read keeps the reading as it was, never fails", async () => {
    const r = reading([entry("e1", 1, "b1", box(100)), entry("e2", 2, "b1", box(150)), entry("e3", 3, "b1", box(200))]);
    expect(await snapReadingBoxes(new Uint8Array([1, 2, 3]), r)).toBe(r);
  });
});
