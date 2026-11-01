/**
 * U3: two-pass reading. The north-star page again: Pran's visit on the left, the day's sales on
 * the right. Pass 1 finds the two blocks; pass 2 reads each crop on its own grid; the merge must
 * give the same reading, checks and parties as one call would.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { BoundingBox } from "@/lib/ledger/types";
import { buildExtractionRequest } from "@/lib/meta/transport";
import { validateLedger } from "@/lib/validation/engine";
import { normalizeModelOutput, pageValuesOf } from "./parse";
import {
  BLOCK_PROFILE,
  BLOCKS_PROMPT_VERSION,
  DIGIT_RULES,
  LAYOUT_PROFILE,
  blockUserText,
  getExtractionProfile,
  isTwoPassVersion,
  withLayout,
  withTwoPass,
} from "./prompt";
import { LAYOUT_JSON_SCHEMA, type ModelLayout, type ModelOutputV3, SCHEMA_V3_VERSION, modelLayoutSchema } from "./schema";
import { type BlockCropper, MAX_RUN_CALLS, callsOfRun, mapBoxToPage, mergeBlockReadings, padRect, planCuts, readTwoPass } from "./two-pass";

const box = (x_min: number, y_min: number, x_max: number, y_max: number): BoundingBox => ({ x_min, y_min, x_max, y_max });

function line(id: string, text: string, type: string, o: Record<string, unknown> = {}) {
  return {
    id, line: Number(id.slice(1)), block: "b1", text, type, customer: null, item: null, qty: null, unit: null, rate: null,
    amount: null, balance: null, crossed_out: false, review: [] as never[], note: null, box: null as BoundingBox | null, ...o,
  } as ModelOutputV3["entries"][number];
}

const block = (kind: ModelLayout["blocks"][number]["kind"], o: Partial<ModelLayout["blocks"][number]> = {}) => ({
  id: "b1", kind, title: null, party: null, person: null, date_text: null, box: null, ...o,
});

const layout: ModelLayout = {
  page: { date_text: "1/11/26", ledger_type: "mixed", legibility: "clear" },
  blocks: [
    block("supplier_visit", { title: "Praan (Selim)", party: "Praan", person: "Selim", box: box(40, 80, 480, 600) }),
    block("day_sales", { id: "b2", title: "নগদ বিক্রি", box: box(520, 80, 960, 520) }),
  ],
  warnings: [],
};

const reading = (o: Partial<ModelOutputV3>): ModelOutputV3 => ({
  page: { date_text: null, ledger_type: "unknown", legibility: "clear" },
  blocks: [],
  entries: [],
  doubts: [],
  warnings: [],
  ...o,
});

// Each crop is read on its own grid: Pran's crop is the left half, the sales crop the right half.
const pranRect = box(0, 0, 500, 1000);
const salesRect = box(500, 0, 1000, 1000);
const pranReading = reading({
  blocks: [block("supplier_visit", { title: "Praan (Selim)", party: "Praan", person: "Selim" })],
  entries: [
    line("e1", "Before - 2800", "opening_balance", { amount: "2800", box: box(100, 150, 900, 200) }),
    line("e2", "Given - 1500", "supplier_payment", { amount: "1500", box: box(100, 220, 900, 270) }),
    line("e3", "Juice 1 Box", "credit_purchase", { item: "Juice", qty: "1", unit: "Box", box: box(100, 290, 900, 340) }),
    line("e4", "Buiscite 2 Box", "credit_purchase", { item: "Buiscite", qty: "2", unit: "Box", box: box(100, 360, 900, 410) }),
    line("e5", "Conacor - 1 Box", "credit_purchase", { item: "Conacor", qty: "1", unit: "Box", box: box(100, 430, 900, 480) }),
  ],
});
const salesReading = reading({
  page: { date_text: null, ledger_type: "cash_sales", legibility: "partly_unclear" },
  blocks: [block("day_sales", { title: null })],
  entries: [
    line("e1", "চাল ২ কেজি ১২০", "cash_sale", { item: "চাল", qty: "২", unit: "কেজি", amount: "১২০", box: box(100, 150, 900, 200), review: ["amount"] as never[] }),
    line("e2", "তেল ১ লিটার ১৮০", "cash_sale", { item: "তেল", qty: "১", unit: "লিটার", amount: "১৮০", box: box(100, 220, 900, 270) }),
  ],
  doubts: [{ entry: "e1", field: "amount", options: ["১২০", "১৯০"], note: null }],
  warnings: ["glare at the top"],
});

const cut = (i: 0 | 1, rect: BoundingBox, r: ModelOutputV3) => {
  const b = layout.blocks[i]!;
  return { block: { ...b, box: b.box! }, rect, reading: r };
};

describe("crop geometry", () => {
  test("a block is padded by 8% of its size, at least 25, and stays on the page", () => {
    expect(padRect(box(100, 100, 600, 300))).toEqual(box(60, 75, 640, 325));
    expect(padRect(box(0, 990, 1000, 1000))).toEqual(box(0, 965, 1000, 1000));
  });

  test("a box on the crop's grid maps to the page grid; unusable boxes don't map", () => {
    expect(mapBoxToPage(box(0, 0, 1000, 1000), box(200, 100, 600, 500))).toEqual(box(200, 100, 600, 500));
    expect(mapBoxToPage(box(500, 250, 750, 500), box(200, 100, 600, 500))).toEqual(box(400, 200, 500, 300));
    expect(mapBoxToPage(box(-3, 0, 1003, 10), box(0, 0, 1000, 1000))).toEqual(box(0, 0, 1000, 10));
    expect(mapBoxToPage(box(0, 0, 1200, 10), box(0, 0, 500, 500))).toBeNull();
    expect(mapBoxToPage(box(500, 0, 400, 10), box(0, 0, 500, 500))).toBeNull();
    expect(mapBoxToPage(null, box(0, 0, 500, 500))).toBeNull();
  });

  test("the layout is cut only when every block has a box and there are at most six", () => {
    const plan = planCuts(layout);
    expect(plan).toMatchObject({ ok: true });
    expect(plan.ok && plan.cuts.map((c) => c.rect)).toEqual([padRect(box(40, 80, 480, 600)), padRect(box(520, 80, 960, 520))]);
    expect(planCuts({ ...layout, blocks: [] })).toEqual({ ok: false, fallback: "no_blocks" });
    expect(planCuts({ ...layout, blocks: [layout.blocks[0]!, { ...layout.blocks[1]!, box: null }] })).toEqual({ ok: false, fallback: "box_missing" });
    expect(planCuts({ ...layout, blocks: [layout.blocks[0]!, { ...layout.blocks[1]!, box: box(0, 0, 5000, 10) }] })).toEqual({ ok: false, fallback: "box_missing" });
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...layout.blocks[1]!, id: `b${i + 1}`, box: box(0, i * 100, 1000, i * 100 + 90) }));
    expect(planCuts({ ...layout, blocks: seven })).toEqual({ ok: false, fallback: "too_many_blocks" });
  });
});

describe("merging the block readings", () => {
  const merged = mergeBlockReadings(layout, [cut(0, pranRect, pranReading), cut(1, salesRect, salesReading)]);

  test("blocks keep the layout's order and boxes; lines are numbered across blocks with page-grid boxes", () => {
    expect(merged.blocks.map((b) => [b.id, b.kind, b.party, b.person, b.box])).toEqual([
      ["b1", "supplier_visit", "Praan", "Selim", box(40, 80, 480, 600)],
      ["b2", "day_sales", null, null, box(520, 80, 960, 520)],
    ]);
    // The crop read no heading for the sales block, so the first look's heading stays.
    expect(merged.blocks[1]!.title).toBe("নগদ বিক্রি");
    expect(merged.entries.map((e) => [e.id, e.line, e.block])).toEqual([
      ["e1", 1, "b1"], ["e2", 2, "b1"], ["e3", 3, "b1"], ["e4", 4, "b1"], ["e5", 5, "b1"], ["e6", 6, "b2"], ["e7", 7, "b2"],
    ]);
    expect(merged.entries[0]!.box).toEqual(box(50, 150, 450, 200));
    expect(merged.entries[5]!.box).toEqual(box(550, 150, 950, 200));
  });

  test("doubts follow their line's new id; warnings say which block; the page is as legible as its worst part", () => {
    expect(merged.doubts).toEqual([{ entry: "e6", field: "amount", options: ["১২০", "১৯০"], note: null }]);
    expect(merged.warnings).toEqual(["b2: glare at the top"]);
    expect(merged.page).toEqual({ date_text: "1/11/26", ledger_type: "mixed", legibility: "partly_unclear" });
  });

  test("the merged reading gives the same checks and parties as one call: Pran owed 1,300 + goods, unverifiable", () => {
    const x = normalizeModelOutput(merged, { promptVersion: "scriba-prompt-6+2pass-1", schemaVersion: SCHEMA_V3_VERSION });
    expect(x.warnings).toEqual(["b2: glare at the top"]);
    expect(x.doubts).toEqual([{ entryId: "e6", field: "amount", options: ["১২০", "১৯০"], note: null }]);
    const findings = validateLedger({
      page: pageValuesOf(x),
      entries: x.entries.map((e) => ({ id: e.candidateId, line: e.line, values: e.values, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason, excluded: false })),
    });
    const pran = findings.find((f) => f.block === "b1" && f.ruleId === "balance_equation");
    expect(pran).toMatchObject({ status: "unverifiable", reason: "unpriced_goods" });
  });

  test("a line from a neighbouring block, caught in the padding, is left out; a stray line of its own is kept", () => {
    const padded = box(0, 0, 560, 1000); // reaches into the sales block (x ≥ 520)
    const withNeighbour = reading({
      blocks: [block("supplier_visit", { party: "Praan" })],
      entries: [
        line("e1", "Given - 1500", "supplier_payment", { amount: "1500", box: box(100, 220, 800, 270) }),
        line("e2", "চাল ২ কেজি ১২০", "cash_sale", { amount: "১২০", box: box(950, 150, 1000, 200) }), // centre x ≈ 546: the sales block
        line("e3", "পরে দেব ৫০", "unknown", { amount: "৫০", box: box(100, 900, 800, 950) }), // below every block: kept
      ],
      doubts: [{ entry: "e2", field: "amount", options: ["১২০", "১৯০"], note: null }],
    });
    const m = mergeBlockReadings(layout, [cut(0, padded, withNeighbour), cut(1, salesRect, salesReading)]);
    expect(m.entries.map((e) => e.text)).toEqual(["Given - 1500", "পরে দেব ৫০", "চাল ২ কেজি ১২০", "তেল ১ লিটার ১৮০"]);
    expect(m.doubts.map((d) => d.entry)).toEqual(["e3"]); // the left-out line's doubt goes with it
    expect(m.warnings[0]).toBe("b1: left out a line from another block at the edge of its crop (চাল ২ কেজি ১২০).");
  });

  test("a crop that plainly holds two blocks keeps both: the second is added after the layout's blocks", () => {
    const two = reading({
      blocks: [block("supplier_visit", { party: "Praan" }), block("expenses", { id: "b2", title: "খরচ", box: box(0, 600, 1000, 900) })],
      entries: [
        line("e1", "Given - 1500", "supplier_payment", { amount: "1500" }),
        line("e2", "চা ৩০", "expense", { amount: "৩০", block: "b2" }),
        line("e3", "Juice 1 Box", "credit_purchase", { item: "Juice", block: "b9" }), // names no block of the crop: its main block
      ],
    });
    const m = mergeBlockReadings(layout, [cut(0, pranRect, two), cut(1, salesRect, salesReading)]);
    expect(m.blocks.map((b) => [b.id, b.kind, b.title])).toEqual([["b1", "supplier_visit", "Praan (Selim)"], ["b2", "day_sales", "নগদ বিক্রি"], ["b3", "expenses", "খরচ"]]);
    expect(m.blocks[2]!.box).toEqual(box(0, 600, 500, 900));
    expect(m.entries.map((e) => [e.text, e.block])).toEqual([
      ["Given - 1500", "b1"], ["চা ৩০", "b3"], ["Juice 1 Box", "b1"], ["চাল ২ কেজি ১২০", "b2"], ["তেল ১ লিটার ১৮০", "b2"],
    ]);
  });
});

describe("readTwoPass", () => {
  const ok = (text: string) => ({
    ok: true as const,
    providerResponseId: "r",
    reportedModel: "muse-wonder-1.0",
    summary: { status: "completed", incompleteReason: null, outputText: text, refusal: null },
    usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100, reasoningTokens: 0, totalTokens: 1100 },
    elapsedMs: 1000,
  });

  test("maps each crop back by the rect actually cut, and says in the hint what the first look found", async () => {
    const hints: string[] = [];
    let n = 0;
    const result = await readTwoPass(
      {
        modelId: "muse-wonder-1.0",
        callModel: async (input) => {
          if (input.pass?.kind === "layout") return ok(JSON.stringify(layout));
          if (input.pass?.kind === "block") hints.push(input.pass.hint);
          return ok(JSON.stringify(n++ === 0 ? pranReading : salesReading));
        },
        // Pixel rounding moved the cut: the rects returned, not the ones asked for, place the boxes.
        cropBlocks: (async (_page, rects) => rects.map((_, i) => ({ image: { imageBytes: new Uint8Array([i]), mimeType: "image/jpeg" }, rect: i === 0 ? pranRect : salesRect }))) as BlockCropper,
      },
      { imageBytes: new Uint8Array([9]), mimeType: "image/jpeg" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hints).toEqual([
      'Transcribe this block. A first look at the whole page found: kind supplier_visit, heading "Praan (Selim)", party "Praan", person "Selim".',
      'Transcribe this block. A first look at the whole page found: kind day_sales, heading "নগদ বিক্রি".',
    ]);
    expect(result.extraction.entries[0]!.bbox).toEqual(box(50, 150, 450, 200));
    expect(result.extraction.reading).toEqual({ passes: 2, calls: 3, fallback: null, crops: [{ block: "b1", rect: pranRect }, { block: "b2", rect: salesRect }] });
    expect(result.extraction.promptVersion).toBe("scriba-prompt-6+2pass-1");
    // Layout first, then the blocks side by side: 1 s + 1 s.
    expect(result.elapsedMs).toBe(2000);
    expect(result.estimatedCostUsd).toBeCloseTo((3 * (1000 * 4 + 100 * 20)) / 1e6, 10);
  });

  test("a whole-page fallback says why in its warnings", async () => {
    const result = await readTwoPass(
      {
        modelId: "muse-wonder-1.0",
        callModel: async (input) => (input.pass ? ok(JSON.stringify({ ...layout, blocks: [] })) : ok(JSON.stringify(pranReading))),
        cropBlocks: async () => [],
      },
      { imageBytes: new Uint8Array([9]), mimeType: "image/jpeg" },
    );
    expect(result.ok && result.extraction.warnings).toEqual(["The layout step found no blocks, so the page was read whole."]);
    expect(result.ok && result.extraction.entries).toHaveLength(5);
  });
});

describe("counting calls", () => {
  test("a run counts one call, a two-pass run its own count, or the most it may have made when it left none", () => {
    expect(callsOfRun("scriba-prompt-4", null)).toBe(1);
    expect(callsOfRun("scriba-prompt-6+2pass-1", 3)).toBe(3);
    expect(callsOfRun("scriba-prompt-6+2pass-1", null)).toBe(MAX_RUN_CALLS);
    expect(callsOfRun("scriba-prompt-6+2pass-7", null)).toBe(7);
    expect(MAX_RUN_CALLS).toBe(7);
  });
});

describe("two-pass prompts", () => {
  afterEach(() => {
    delete process.env.SCRIBA_PROMPT_VERSION;
    delete process.env.SCRIBA_TWO_PASS;
  });

  test("the switch is off by default and applies to prompt 6 only", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    expect(withTwoPass(getExtractionProfile()).promptVersion).toBe(BLOCKS_PROMPT_VERSION);
    process.env.SCRIBA_TWO_PASS = "1";
    expect(withTwoPass(getExtractionProfile())).toMatchObject({ promptVersion: "scriba-prompt-6+2pass-1", schemaVersion: SCHEMA_V3_VERSION });
    expect(isTwoPassVersion(withTwoPass(getExtractionProfile()).promptVersion)).toBe(true);
    delete process.env.SCRIBA_PROMPT_VERSION;
    expect(withTwoPass(getExtractionProfile()).promptVersion).toBe("scriba-prompt-4");
    expect(withTwoPass(withLayout(getExtractionProfile(), "scriba_khata")).promptVersion).toBe("scriba-prompt-4+khata-1");
    expect(isTwoPassVersion("scriba-prompt-4+khata-1")).toBe(false);
  });

  test("pass 1 carries prompt 6's block rules and transcribes no lines; pass 2 carries prompt 6's rules word for word", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    const p6 = getExtractionProfile().instructions;
    const blockRules = p6.slice(p6.indexOf("Blocks:"), p6.indexOf("\n\nEntries:"));
    expect(LAYOUT_PROFILE.instructions).toContain(blockRules);
    expect(LAYOUT_PROFILE.instructions).toContain("Do not transcribe the lines");
    expect(LAYOUT_PROFILE.instructions).not.toContain("Entries:");
    expect(BLOCK_PROFILE.instructions).toContain(p6.slice(p6.indexOf("Transcribe only what is visibly written.")));
    expect(BLOCK_PROFILE.instructions).toContain(DIGIT_RULES);
    expect(BLOCK_PROFILE.instructions).toContain("Every box is on this image's own 0-1000 grid.");
    expect(BLOCK_PROFILE.schemaVersion).toBe(SCHEMA_V3_VERSION);
  });

  test("the layout schema is schema 3's page and blocks, strict, and agrees with zod", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(LAYOUT_JSON_SCHEMA.properties)).toEqual(["blocks", "page", "warnings"]);
    expect(keys(modelLayoutSchema.shape)).toEqual(keys(LAYOUT_JSON_SCHEMA.properties));
    expect(([...LAYOUT_JSON_SCHEMA.required] as string[]).sort()).toEqual(keys(LAYOUT_JSON_SCHEMA.properties));
    expect(LAYOUT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(modelLayoutSchema.safeParse(layout).success).toBe(true);
    expect(modelLayoutSchema.safeParse({ ...layout, entries: [] }).success).toBe(true); // extra keys are stripped, as in schema 3
  });

  test("the transport sends each step's prompt, schema and text, and never the writer's notes", () => {
    const config = { modelId: "m", reasoningEffort: "low" as const, maxOutputTokens: 100 };
    const image = { imageBytes: new Uint8Array([1]), mimeType: "image/png" };
    const personal = { text: "notes", reference: null };
    const first = buildExtractionRequest(config, { ...image, personal, pass: { kind: "layout" } });
    expect(first.instructions).toBe(LAYOUT_PROFILE.instructions);
    expect(first.text.format).toMatchObject({ name: "scriba_ledger_layout_v1", schema: LAYOUT_JSON_SCHEMA });
    expect(first.input[0]!.content).toEqual([{ type: "input_text", text: "Describe the layout of this ledger page." }, { type: "input_image", image_url: "data:image/png;base64,AQ==" }]);
    const hint = blockUserText({ kind: "day_sales", title: null, party: null, person: null });
    const second = buildExtractionRequest(config, { ...image, personal, pass: { kind: "block", hint } });
    expect(second.instructions).toBe(BLOCK_PROFILE.instructions);
    expect(second.text.format).toMatchObject({ name: "scriba_ledger_extraction_v3" });
    expect(second.input[0]!.content[0]).toEqual({ type: "input_text", text: "Transcribe this block. A first look at the whole page found: kind day_sales." });
  });
});
