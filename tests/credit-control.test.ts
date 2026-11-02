/**
 * Credit-control guarantees. No test here talks to Meta: the model is a counting
 * mock, and the repository is the in-memory double that mirrors the database
 * constraints.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { type AnalyzeSettings, analyzeDocument } from "@/lib/extraction/pipeline";
import type { BlockCropper } from "@/lib/extraction/two-pass";
import type { BoundingBox } from "@/lib/ledger/types";
import type { ModelCallInput, ModelCallResult, ModelCallSuccess, ModelCaller } from "@/lib/meta/transport";
import { MemoryStore } from "./helpers/memory-repo";
import { makePng } from "./helpers/image-fixtures";

const settings: AnalyzeSettings = {
  modelId: "muse-spark-1.3",
  extractionsPerHour: 30,
  extractionsPerDay: 150,
  stalePendingMs: 6 * 60 * 1000,
};

const validOutput = JSON.stringify({
  page: { date_text: null, ledger_type: "customer_credit", account_name: null, legibility: "clear" },
  entries: [
    { id: "e1", line: 1, text: "আগের বাকি ৮০০", type: "opening_balance", customer: null, item: null, qty: null, unit: null, rate: null, amount: "৮০০", balance: null, crossed_out: false, review: [], note: null, box: null },
    { id: "e2", line: 2, text: "চাল ৩ কেজি ৬০ = ১৮০", type: "credit_sale", customer: null, item: "চাল", qty: "৩", unit: "কেজি", rate: "৬০", amount: "১৮০", balance: null, crossed_out: false, review: [], note: null, box: null },
    { id: "e3", line: 3, text: "ডাল ১ কেজি ১৪০ = ১৪০", type: "credit_sale", customer: null, item: "ডাল", qty: "১", unit: "কেজি", rate: "১৪০", amount: "১৪০", balance: null, crossed_out: false, review: [], note: null, box: null },
    { id: "e4", line: 4, text: "মোট ৩১০", type: "subtotal", customer: null, item: null, qty: null, unit: null, rate: null, amount: "৩১০", balance: null, crossed_out: false, review: [], note: null, box: null },
  ],
  warnings: [],
});

function countingModel(responses: Array<ModelCallResult | (() => Promise<ModelCallResult>)>) {
  const calls: number[] = [];
  const caller: ModelCaller = async () => {
    calls.push(Date.now());
    const next = responses.shift() ?? success();
    return typeof next === "function" ? next() : next;
  };
  return { caller, calls };
}

function success(text = validOutput): ModelCallSuccess {
  return {
    ok: true,
    providerResponseId: "resp_1",
    reportedModel: "muse-spark-1.3",
    summary: { status: "completed", incompleteReason: null, outputText: text, refusal: null },
    usage: { inputTokens: 1500, cachedInputTokens: 0, outputTokens: 600, reasoningTokens: 120, totalTokens: 2100 },
    elapsedMs: 3200,
  };
}

let store: MemoryStore;
let docId: string;
beforeEach(() => {
  store = new MemoryStore();
  docId = store.addDocument("user-a", makePng(64, 64)).id;
});

const req = (requestId: string, mode: "use_cache" | "fresh" = "use_cache") => ({ documentId: docId, requestId, mode });

describe("credit control", () => {
  test("first analysis makes exactly one call and records usage and cost", async () => {
    const m = countingModel([success()]);
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    expect(out.kind).toBe("completed");
    expect(m.calls).toHaveLength(1);
    const run = store.runs[0]!;
    expect(run.success?.usage?.outputTokens).toBe(600);
    expect(run.success?.estimatedCostUsd).toBeCloseTo((1500 * 1.25 + 600 * 4.25) / 1e6, 10);
    // The wrong subtotal is flagged at extraction time and kept as written.
    const total = run.success!.findings.find((f) => f.ruleId === "written_total")!;
    expect(total.status).toBe("fail");
    expect(run.success!.extraction.entries[3]!.values.amountText).toBe("৩১০");
  });

  test("a successful cached result is reused with zero calls", async () => {
    const m = countingModel([success()]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    await analyzeDocument(deps, settings, req("r1"));
    const again = await analyzeDocument(deps, settings, req("r2"));
    expect(again.kind).toBe("cached");
    expect(m.calls).toHaveLength(1);
    expect(store.cacheHits).toHaveLength(1);
  });

  test("double-clicking Analyze (same request id, concurrent) makes one call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const m = countingModel([async () => (await gate, success())]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    const first = analyzeDocument(deps, settings, req("same"));
    const second = analyzeDocument(deps, settings, req("same"));
    release();
    const results = await Promise.all([first, second]);
    expect(m.calls).toHaveLength(1);
    expect(results.map((r) => r.kind).sort()).toEqual(["completed", "duplicate_request"]);
  });

  test("two tabs (different request ids, concurrent) still make one call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const m = countingModel([async () => (await gate, success())]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    const a = analyzeDocument(deps, settings, req("tab-1"));
    const b = analyzeDocument(deps, settings, req("tab-2"));
    release();
    const results = await Promise.all([a, b]);
    expect(m.calls).toHaveLength(1);
    expect(results.map((r) => r.kind).sort()).toEqual(["completed", "in_progress"]);
  });

  test("a failed request is not retried automatically; an explicit retry is a new run", async () => {
    const m = countingModel([
      { ok: false, category: "server_error", httpStatus: 503, message: "busy", uncertain: false, elapsedMs: 10 },
      success(),
    ]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    const first = await analyzeDocument(deps, settings, req("r1"));
    expect(first.kind).toBe("model_failed");
    expect(m.calls).toHaveLength(1);
    expect(store.runs[0]!.status).toBe("failed");

    // Re-sending the same request id does not trigger another call.
    expect((await analyzeDocument(deps, settings, req("r1"))).kind).toBe("duplicate_request");
    expect(m.calls).toHaveLength(1);

    // Only a deliberate new click (new request id) sends again.
    expect((await analyzeDocument(deps, settings, req("r2"))).kind).toBe("completed");
    expect(m.calls).toHaveLength(2);
    expect(store.runs).toHaveLength(2);
  });

  test("a timeout is recorded as uncertain, not as failed or succeeded", async () => {
    const m = countingModel([{ ok: false, category: "timeout", httpStatus: null, message: "slow", uncertain: true, elapsedMs: 240000 }]);
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    expect(out).toMatchObject({ kind: "model_failed", uncertain: true });
    expect(store.runs[0]!.status).toBe("uncertain");
  });

  test("explicit fresh reanalysis records a new run and preserves the previous one", async () => {
    const m = countingModel([success(), success()]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    await analyzeDocument(deps, settings, req("r1"));
    const fresh = await analyzeDocument(deps, settings, req("r2", "fresh"));
    expect(fresh.kind).toBe("completed");
    expect(m.calls).toHaveLength(2);
    expect(store.runs.map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
    expect(store.runs[1]!.isFreshRequest).toBe(true);
  });

  test("truncated output is preserved as incomplete and never marked successful", async () => {
    const m = countingModel([
      { ...success(validOutput.slice(0, 200)), summary: { status: "incomplete", incompleteReason: "max_output_tokens", outputText: validOutput.slice(0, 200), refusal: null } },
    ]);
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    expect(out.kind).toBe("unusable_output");
    expect(store.runs[0]!.status).toBe("incomplete");
    expect(store.runs[0]!.failure?.rawOutputText).toBe(validOutput.slice(0, 200));
    expect(store.runs[0]!.failure?.usage?.outputTokens).toBe(600);
  });

  test("a checksum mismatch stops the request before any call", async () => {
    store.objects.set(store.documents.get(docId)!.storagePath, makePng(65, 64));
    const m = countingModel([success()]);
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    expect(out.kind).toBe("integrity_error");
    expect(m.calls).toHaveLength(0);
  });

  test("a turned photo sends the prepared copy and never reuses the unturned result", async () => {
    const sent: Uint8Array[] = [];
    const callModel: ModelCaller = async (input) => (sent.push(input.imageBytes), success());
    const turned = makePng(64, 65);
    const prepared: string[] = [];
    const deps = {
      repo: store.repoFor("user-a"),
      callModel,
      now: () => new Date(),
      prepareImage: async (_bytes: Uint8Array, mimeType: string, mode: string) => (prepared.push(mode), { imageBytes: turned, mimeType }),
    };
    await analyzeDocument(deps, settings, req("r1"));
    const out = await analyzeDocument(deps, settings, { ...req("r2"), processingMode: "rotate_90" });
    expect(out.kind).toBe("completed");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(turned);
    expect(prepared).toEqual(["baseline_original", "rotate_90"]);
    expect(store.runs.map((r) => r.processingMode)).toEqual(["baseline_original", "rotate_90"]);
    expect(store.runs[0]!.cacheKey).not.toBe(store.runs[1]!.cacheKey);
  });

  test("a personal reading (prompt 5) sends his notes, is recorded as such and never shares a cache entry", async () => {
    const inputs: Parameters<ModelCaller>[0][] = [];
    const callModel: ModelCaller = async (input) => (inputs.push(input), success());
    const reference = { imageBytes: makePng(8, 8), mimeType: "image/png" };
    const asked: string[] = [];
    const personalize = async (doc: { id: string }) => (asked.push(doc.id), { key: "k1", text: "notes", reference });
    const plain = { repo: store.repoFor("user-a"), callModel, now: () => new Date() };

    await analyzeDocument(plain, settings, req("r1"));
    const out = await analyzeDocument({ ...plain, personalize }, settings, req("r2"));
    expect(out.kind).toBe("completed");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.personal).toBeUndefined();
    expect(inputs[1]!.personal).toEqual({ text: "notes", reference });
    expect(asked).toEqual([docId]);
    expect(store.runs.map((r) => r.promptVersion)).toEqual(["scriba-prompt-4", "scriba-prompt-5"]);
    expect(store.runs[0]!.cacheKey).not.toBe(store.runs[1]!.cacheKey);

    // The same notes again: the personal result is reused; changed notes mean a new key.
    expect((await analyzeDocument({ ...plain, personalize }, settings, req("r3"))).kind).toBe("cached");
    const changed = async () => ({ key: "k2", text: "more notes", reference: null });
    expect((await analyzeDocument({ ...plain, personalize: changed }, settings, req("r4"))).kind).toBe("completed");
    expect(inputs).toHaveLength(3);
  });

  test("notes that can't be built, or a base prompt other than 4, mean a plain reading", async () => {
    const inputs: Parameters<ModelCaller>[0][] = [];
    const callModel: ModelCaller = async (input) => (inputs.push(input), success());
    const broken = async () => {
      throw new Error("db down");
    };
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel, now: () => new Date(), personalize: broken }, settings, req("r1"));
    expect(out.kind).toBe("completed");
    expect(inputs[0]!.personal).toBeUndefined();
    expect(store.runs[0]!.promptVersion).toBe("scriba-prompt-4");

    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-3";
    try {
      let asked = 0;
      const personalize = async () => (asked++, { key: "k", text: "notes", reference: null });
      await analyzeDocument({ repo: store.repoFor("user-a"), callModel, now: () => new Date(), personalize }, settings, req("r2", "fresh"));
      expect(asked).toBe(0);
      expect(inputs[1]!.personal).toBeUndefined();
      expect(store.runs[1]!.promptVersion).toBe("scriba-prompt-3");
    } finally {
      delete process.env.SCRIBA_PROMPT_VERSION;
    }
  });

  test("a khata page is read with its layout, recorded as such, never shares a cache entry, and a re-read keeps it", async () => {
    const inputs: Parameters<ModelCaller>[0][] = [];
    const callModel: ModelCaller = async (input) => (inputs.push(input), success());
    const deps = { repo: store.repoFor("user-a"), callModel, now: () => new Date() };

    expect((await analyzeDocument(deps, settings, { ...req("r1"), layout: "scriba_khata" })).kind).toBe("completed");
    expect(inputs[0]!.layout).toBe("scriba_khata");
    expect(store.runs[0]!.promptVersion).toBe("scriba-prompt-4+khata-1");
    expect(store.runs[0]!.success!.extraction.promptVersion).toBe("scriba-prompt-4+khata-1");

    // No layout given ("check again", the details page): the page keeps the layout it was read with.
    expect((await analyzeDocument(deps, settings, req("r2"))).kind).toBe("cached");

    // He says it isn't a khata page: a plain reading under its own key.
    expect((await analyzeDocument(deps, settings, { ...req("r3"), layout: "free" })).kind).toBe("completed");
    expect(inputs[1]!.layout).toBeUndefined();
    expect(store.runs[1]!.promptVersion).toBe("scriba-prompt-4");
    expect(store.runs[1]!.cacheKey).not.toBe(store.runs[0]!.cacheKey);

    // A fresh re-read follows the latest run, which is plain now.
    await analyzeDocument(deps, settings, req("r4", "fresh"));
    expect(store.runs[2]!.promptVersion).toBe("scriba-prompt-4");

    // With his notes switched on, both ride together.
    const personalize = async () => ({ key: "k1", text: "notes", reference: null });
    await analyzeDocument({ ...deps, personalize }, settings, { ...req("r5"), layout: "scriba_khata" });
    expect(store.runs[3]!.promptVersion).toBe("scriba-prompt-5+khata-1");
    expect(inputs[3]).toMatchObject({ layout: "scriba_khata", personal: { text: "notes", reference: null } });
  });

  test("a photo that cannot be turned stops the request before any call", async () => {
    const m = countingModel([success()]);
    const out = await analyzeDocument(
      { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, // no preparer: original only
      settings,
      { ...req("r1"), processingMode: "rotate_180" },
    );
    expect(out.kind).toBe("integrity_error");
    expect(m.calls).toHaveLength(0);
    expect(store.runs[0]!.failure?.errorCategory).toBe("preparation");
  });

  test("rate limits apply before any call", async () => {
    const m = countingModel([]);
    const out = await analyzeDocument(
      { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() },
      { ...settings, extractionsPerHour: 0 },
      req("r1"),
    );
    expect(out.kind).toBe("rate_limited");
    expect(m.calls).toHaveLength(0);
  });

  test("a stale pending run is marked uncertain and needs a deliberate retry", async () => {
    const repo = store.repoFor("user-a");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const m = countingModel([async () => (await gate, success())]);
    void analyzeDocument({ repo, callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    await new Promise((r) => setTimeout(r, 5));
    const later = () => new Date(Date.now() + 7 * 60 * 1000);
    const out = await analyzeDocument({ repo, callModel: m.caller, now: later }, settings, req("r2"));
    expect(out.kind).toBe("previous_uncertain");
    expect(m.calls).toHaveLength(1);
    release();
  });

  test("a database failure after Meta answers is never reported as success", async () => {
    store.failNextComplete = true;
    const m = countingModel([success()]);
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    expect(out.kind).toBe("persistence_error");
    expect(store.runs[0]!.status).toBe("failed");
  });

  test("another user can neither analyze nor reuse user A's document or cache", async () => {
    const m = countingModel([success()]);
    await analyzeDocument({ repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    const out = await analyzeDocument({ repo: store.repoFor("user-b"), callModel: m.caller, now: () => new Date() }, settings, req("r2"));
    expect(out.kind).toBe("not_found");
    expect(m.calls).toHaveLength(1);
  });
});

describe("two-pass reading (U3): one run is at most 1 + 6 calls, each logged and counted", () => {
  const box = (x_min: number, y_min: number, x_max: number, y_max: number): BoundingBox => ({ x_min, y_min, x_max, y_max });
  const page = { date_text: null, ledger_type: "mixed", legibility: "clear" };
  const layout = (boxes: Array<BoundingBox | null>) =>
    JSON.stringify({
      page,
      blocks: boxes.map((b, i) => ({
        id: `b${i + 1}`,
        kind: i === 0 ? "day_sales" : "supplier_visit",
        title: null,
        party: i === 0 ? null : "Praan",
        person: null,
        date_text: null,
        box: b,
      })),
      warnings: [],
    });
  const entry = (id: string, text: string, type: string, amount: string, block = "b1") => ({
    id, line: Number(id.slice(1)), text, type, customer: null, item: null, qty: null, unit: null, rate: null, amount, balance: null,
    crossed_out: false, review: [], note: null, box: box(50, 100, 950, 300), block,
  });
  const blockReading = (kind: string, entries: unknown[]) =>
    JSON.stringify({
      page,
      blocks: [{ id: "b1", kind, title: null, party: kind === "supplier_visit" ? "Praan" : null, person: null, date_text: null, box: null }],
      entries,
      doubts: [],
      warnings: [],
    });
  const salesBlock = blockReading("day_sales", [entry("e1", "চাল ১৪০", "cash_sale", "১৪০")]);
  const visitBlock = blockReading("supplier_visit", [entry("e1", "Before - 2800", "opening_balance", "2800"), entry("e2", "Given - 1500", "supplier_payment", "1500")]);
  const wholePage = salesBlock;
  const twoBlocks = layout([box(0, 0, 500, 400), box(0, 500, 1000, 900)]);

  /** Answers by the step it is asked for; `blockAnswers` in call order, then readings of the two blocks above. */
  function twoPassModel(layoutText: string, blockAnswers: ModelCallResult[] = []) {
    const inputs: ModelCallInput[] = [];
    let blocks = 0;
    const caller: ModelCaller = async (input) => {
      inputs.push(input);
      if (input.pass?.kind === "layout") return success(layoutText);
      if (input.pass?.kind === "block") return blockAnswers.shift() ?? success(blocks++ === 0 ? salesBlock : visitBlock);
      return success(wholePage);
    };
    return { caller, inputs };
  }

  const cropped: BoundingBox[][] = [];
  const cropBytes = makePng(8, 8);
  const cropBlocks: BlockCropper = async (_page, rects) => (cropped.push(rects), rects.map((rect) => ({ image: { imageBytes: cropBytes, mimeType: "image/png" }, rect })));
  const depsFor = (caller: ModelCaller) => ({ repo: store.repoFor("user-a"), callModel: caller, now: () => new Date(), cropBlocks });

  beforeEach(() => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    process.env.SCRIBA_TWO_PASS = "1";
    cropped.length = 0;
  });
  afterEach(() => {
    delete process.env.SCRIBA_PROMPT_VERSION;
    delete process.env.SCRIBA_TWO_PASS;
  });

  test("one layout call, then one call per block; usage and cost are the sum and every call is kept", async () => {
    const m = twoPassModel(twoBlocks);
    const out = await analyzeDocument(depsFor(m.caller), settings, req("r1"));
    expect(out.kind).toBe("completed");
    expect(m.inputs.map((i) => i.pass?.kind)).toEqual(["layout", "block", "block"]);
    // Each block call sends its crop, with what the first look found as a hint.
    expect(m.inputs[1]!.imageBytes).toBe(cropBytes);
    expect(m.inputs[2]!.pass).toMatchObject({ kind: "block", hint: expect.stringContaining("supplier_visit") });
    expect(cropped).toHaveLength(1);

    const run = store.runs[0]!;
    expect(run.promptVersion).toBe("scriba-prompt-6+2pass-1");
    expect(run.schemaVersion).toBe("scriba-extraction-3");
    expect(run.success!.usage!.inputTokens).toBe(3 * 1500);
    expect(run.success!.estimatedCostUsd).toBeCloseTo((3 * (1500 * 1.25 + 600 * 4.25)) / 1e6, 10);
    expect(run.success!.extraction.reading).toMatchObject({ passes: 2, calls: 3, fallback: null });
    expect(run.success!.extraction.blocks!.map((b) => b.kind)).toEqual(["day_sales", "supplier_visit"]);
    expect(run.success!.extraction.entries.map((e) => [e.candidateId, e.values.block])).toEqual([["e1", "b1"], ["e2", "b2"], ["e3", "b2"]]);
    const raw = JSON.parse(run.success!.rawOutputText) as { calls: Array<{ pass: string; outputText: string | null }> };
    expect(raw.calls.map((c) => c.pass)).toEqual(["layout", "block", "block"]);
    expect(raw.calls[2]!.outputText).toBe(visitBlock);
  });

  test.each([
    ["more than six blocks", layout(Array.from({ length: 7 }, (_, i) => box(0, i * 140, 1000, i * 140 + 120))), "too_many_blocks"],
    ["a block without a box", layout([box(0, 0, 500, 400), null]), "box_missing"],
    ["no blocks", layout([]), "no_blocks"],
  ])("%s: the page is read in one whole-page call instead (2 calls)", async (_name, layoutText, fallback) => {
    const m = twoPassModel(layoutText);
    expect((await analyzeDocument(depsFor(m.caller), settings, req("r1"))).kind).toBe("completed");
    expect(m.inputs.map((i) => i.pass?.kind)).toEqual(["layout", undefined]);
    expect(cropped).toHaveLength(0);
    const run = store.runs[0]!;
    expect(run.success!.extraction.reading).toMatchObject({ calls: 2, fallback });
    expect(run.success!.usage!.inputTokens).toBe(2 * 1500);
  });

  test("a failed block call fails the run; nothing is retried and every spent call is recorded", async () => {
    const busy: ModelCallResult = { ok: false, category: "server_error", httpStatus: 503, message: "busy", uncertain: false, elapsedMs: 10 };
    const m = twoPassModel(twoBlocks, [success(salesBlock), busy]);
    const deps = depsFor(m.caller);
    const out = await analyzeDocument(deps, settings, req("r1"));
    expect(out).toMatchObject({ kind: "model_failed", category: "server_error", uncertain: false });
    expect(m.inputs).toHaveLength(3);
    const run = store.runs[0]!;
    expect(run.status).toBe("failed");
    expect(run.failure!.usage!.inputTokens).toBe(2 * 1500);
    expect(run.failure!.estimatedCostUsd).toBeCloseTo((2 * (1500 * 1.25 + 600 * 4.25)) / 1e6, 10);
    const raw = JSON.parse(run.failure!.rawOutputText!) as { calls: Array<{ pass: string; error?: string }> };
    expect(raw.calls.map((c) => [c.pass, c.error ?? null])).toEqual([["layout", null], ["block", null], ["block", "server_error"]]);

    expect((await analyzeDocument(deps, settings, req("r1"))).kind).toBe("duplicate_request");
    expect(m.inputs).toHaveLength(3);
  });

  test("a block call that may have been processed makes the run uncertain", async () => {
    const slow: ModelCallResult = { ok: false, category: "timeout", httpStatus: null, message: "slow", uncertain: true, elapsedMs: 240000 };
    const m = twoPassModel(twoBlocks, [slow]);
    expect(await analyzeDocument(depsFor(m.caller), settings, req("r1"))).toMatchObject({ kind: "model_failed", uncertain: true });
    expect(store.runs[0]!.status).toBe("uncertain");
  });

  test("an unusable block reading fails the run as invalid output", async () => {
    const m = twoPassModel(twoBlocks, [success(salesBlock), success("{not json")]);
    expect((await analyzeDocument(depsFor(m.caller), settings, req("r1"))).kind).toBe("unusable_output");
    expect(store.runs[0]!.status).toBe("invalid_output");
    expect(store.runs[0]!.failure!.usage!.inputTokens).toBe(3 * 1500);
  });

  test("a failed or unusable layout stops before any block is cut or read", async () => {
    const down = twoPassModel(twoBlocks);
    const failing: ModelCaller = async (input) => (down.inputs.push(input), { ok: false, category: "rate_limited", httpStatus: 429, message: "slow down", uncertain: false, elapsedMs: 5 });
    expect((await analyzeDocument(depsFor(failing), settings, req("r1"))).kind).toBe("model_failed");
    expect(down.inputs).toHaveLength(1);

    const garbled = twoPassModel("{\"page\":");
    expect((await analyzeDocument(depsFor(garbled.caller), settings, req("r2"))).kind).toBe("unusable_output");
    expect(garbled.inputs).toHaveLength(1);
    expect(store.runs[1]!.status).toBe("invalid_output");
    expect(cropped).toHaveLength(0);
  });

  test("a crop that fails stops the run after the layout call, which is recorded", async () => {
    const m = twoPassModel(twoBlocks);
    const broken: BlockCropper = async () => {
      throw new Error("bad image");
    };
    const out = await analyzeDocument({ ...depsFor(m.caller), cropBlocks: broken }, settings, req("r1"));
    expect(out.kind).toBe("integrity_error");
    expect(m.inputs).toHaveLength(1);
    expect(store.runs[0]!.failure).toMatchObject({ errorCategory: "preparation", usage: { inputTokens: 1500 } });
  });

  test("without a way to cut blocks, nothing is sent", async () => {
    const m = twoPassModel(twoBlocks);
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() }, settings, req("r1"));
    expect(out.kind).toBe("integrity_error");
    expect(m.inputs).toHaveLength(0);
    expect(store.runs[0]!.failure?.errorCategory).toBe("preparation");
  });

  test("rate limits count model calls, and a two-pass run needs room for all 7 it may make", async () => {
    const m = twoPassModel(twoBlocks);
    const deps = depsFor(m.caller);
    expect((await analyzeDocument(deps, { ...settings, extractionsPerHour: 6 }, req("r0"))).kind).toBe("rate_limited");
    expect(m.inputs).toHaveLength(0);

    const ten = { ...settings, extractionsPerHour: 10 };
    expect((await analyzeDocument(deps, ten, req("r1"))).kind).toBe("completed"); // 3 calls
    expect((await analyzeDocument(deps, ten, req("r2", "fresh"))).kind).toBe("completed"); // 3 + 7 ≤ 10
    expect((await analyzeDocument(deps, ten, req("r3", "fresh"))).kind).toBe("rate_limited"); // 6 + 7 > 10
    expect(m.inputs).toHaveLength(6);
  });

  test("a two-pass result is reused with zero calls and never shares a cache entry with a single-pass one", async () => {
    const m = twoPassModel(twoBlocks);
    const deps = depsFor(m.caller);
    await analyzeDocument(deps, settings, req("r1"));
    expect((await analyzeDocument(deps, settings, req("r2"))).kind).toBe("cached");
    expect(m.inputs).toHaveLength(3);

    delete process.env.SCRIBA_TWO_PASS;
    expect((await analyzeDocument(deps, settings, req("r3"))).kind).toBe("completed");
    expect(m.inputs.map((i) => i.pass?.kind)).toEqual(["layout", "block", "block", undefined]);
    expect(store.runs[1]!.promptVersion).toBe("scriba-prompt-6");
    expect(store.runs[1]!.cacheKey).not.toBe(store.runs[0]!.cacheKey);
  });

  test("the switch only applies to prompt 6", async () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-4";
    const m = countingModel([success()]);
    expect((await analyzeDocument(depsFor(m.caller), settings, req("r1"))).kind).toBe("completed");
    expect(m.calls).toHaveLength(1);
    expect(store.runs[0]!.promptVersion).toBe("scriba-prompt-4");
  });
});

describe("company memo (U4): read once, like a page, and never reviewed as one", () => {
  const memoOutput = JSON.stringify({
    memo: { company: "PRAN Agro Ltd.", person: "Selim", number: "CH-2041", date_text: "01/11/2026", legibility: "clear" },
    lines: [
      { id: "m1", text: "Mango Juice 250ml 1 Ctn 480 480", item: "Mango Juice 250ml", qty: "1", unit: "Ctn", rate: "480", amount: "480", crossed_out: false, review: [], box: null },
      { id: "m2", text: "Potato Biscuit 2 Ctn 360 720", item: "Potato Biscuit", qty: "2", unit: "Ctn", rate: "360", amount: "720", crossed_out: false, review: [], box: null },
    ],
    totals: { subtotal: null, discount: null, total: "1,200.00", previous_due: null, paid: null, due: null },
    warnings: [],
  });
  let memoId: string;
  beforeEach(() => {
    memoId = store.addDocument("user-a", makePng(32, 48), "memo-1", "memo").id;
  });
  const memoReq = (requestId: string, mode: "use_cache" | "fresh" = "use_cache") => ({ documentId: memoId, requestId, mode });

  test("one call with the memo prompt; the reading and what it spent are kept on the run", async () => {
    const inputs: Parameters<ModelCaller>[0][] = [];
    const callModel: ModelCaller = async (input) => (inputs.push(input), success(memoOutput));
    const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel, now: () => new Date() }, settings, memoReq("r1"));
    expect(out.kind).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.memo).toBe(true);
    const run = store.runs[0]!;
    expect([run.promptVersion, run.schemaVersion]).toEqual(["scriba-memo-1", "scriba-memo-1"]);
    expect(run.success).toBeUndefined();
    expect(run.memo!.memo.lines.map((l) => l.amountPoisha)).toEqual([48000, 72000]);
    expect(run.memo!.memo.check).toEqual({ linesSum: 120000, total: 120000, agrees: true });
    expect(run.memo!.usage?.outputTokens).toBe(600);
    expect(run.memo!.estimatedCostUsd).toBeGreaterThan(0);
  });

  test("never with his notes, a khata layout or two passes", async () => {
    const inputs: Parameters<ModelCaller>[0][] = [];
    const callModel: ModelCaller = async (input) => (inputs.push(input), success(memoOutput));
    let asked = 0;
    const personalize = async () => (asked++, { key: "k", text: "notes", reference: null });
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    process.env.SCRIBA_TWO_PASS = "1";
    try {
      const cropBlocks: BlockCropper = async () => [];
      const out = await analyzeDocument({ repo: store.repoFor("user-a"), callModel, now: () => new Date(), personalize, cropBlocks }, settings, {
        ...memoReq("r1"),
        layout: "scriba_khata",
      });
      expect(out.kind).toBe("completed");
    } finally {
      delete process.env.SCRIBA_PROMPT_VERSION;
      delete process.env.SCRIBA_TWO_PASS;
    }
    expect(asked).toBe(0);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ memo: true });
    expect(inputs[0]!.personal).toBeUndefined();
    expect(inputs[0]!.layout).toBeUndefined();
    expect(inputs[0]!.pass).toBeUndefined();
    expect(store.runs[0]!.promptVersion).toBe("scriba-memo-1");
  });

  test("a read memo is reused with zero calls; a deliberate re-read is a new run", async () => {
    const m = countingModel([success(memoOutput), success(memoOutput)]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    await analyzeDocument(deps, settings, memoReq("r1"));
    expect((await analyzeDocument(deps, settings, memoReq("r2"))).kind).toBe("cached");
    expect(m.calls).toHaveLength(1);
    expect((await analyzeDocument(deps, settings, memoReq("r3", "fresh"))).kind).toBe("completed");
    expect(m.calls).toHaveLength(2);
  });

  test("a memo read counts against the limits like a page", async () => {
    const m = countingModel([success(), success(memoOutput)]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    await analyzeDocument(deps, { ...settings, extractionsPerHour: 2 }, req("r1"));
    expect((await analyzeDocument(deps, { ...settings, extractionsPerHour: 2 }, memoReq("r2"))).kind).toBe("completed");
    expect((await analyzeDocument(deps, { ...settings, extractionsPerHour: 2 }, memoReq("r3", "fresh"))).kind).toBe("rate_limited");
    expect(m.calls).toHaveLength(2);
  });

  test("a page answer to the memo prompt, or a truncated one, fails the run and keeps what it spent", async () => {
    const m = countingModel([success(), { ...success(memoOutput), summary: { status: "incomplete", incompleteReason: "max_output_tokens", outputText: "{", refusal: null } }]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    expect((await analyzeDocument(deps, settings, memoReq("r1"))).kind).toBe("unusable_output");
    expect(store.runs[0]!.status).toBe("invalid_output");
    expect(store.runs[0]!.failure?.usage?.outputTokens).toBe(600);
    expect((await analyzeDocument(deps, settings, memoReq("r2"))).kind).toBe("unusable_output");
    expect(store.runs[1]!.status).toBe("incomplete");
    expect(m.calls).toHaveLength(2);
  });

  test("a failed call is not retried, and a failure to save is never reported as success", async () => {
    const m = countingModel([{ ok: false, category: "timeout", httpStatus: null, message: "slow", uncertain: true, elapsedMs: 1 }, success(memoOutput)]);
    const deps = { repo: store.repoFor("user-a"), callModel: m.caller, now: () => new Date() };
    expect((await analyzeDocument(deps, settings, memoReq("r1"))).kind).toBe("model_failed");
    expect(store.runs[0]!.status).toBe("uncertain");
    store.failNextComplete = true;
    expect((await analyzeDocument(deps, settings, memoReq("r2"))).kind).toBe("persistence_error");
    expect(store.runs[1]!.status).toBe("failed");
    expect(m.calls).toHaveLength(2);
  });
});

describe("structural guarantee: only explicit paths can reach Meta", () => {
  // Editing, revalidating, reopening a document or changing a filter must never
  // be able to trigger a paid call. Enforced by the import graph: only these
  // files may import the Meta transport.
  const ALLOWED = new Set([
    "src/lib/meta/transport.ts",
    "src/lib/extraction/pipeline.ts", // type-only import of ModelCaller
    "src/lib/extraction/two-pass.ts", // U3: type-only; it calls the caller the pipeline was given
    "src/lib/server/analyze.ts",
    "scripts/live-extract.ts",
    // U4: one memo photo per run of the script, or a saved response read again for free.
    "scripts/live-memo.ts",
    // P1: one clip per press of "stop" in the fix sheet; never retried, never chained to a model.
    "src/app/api/voice/route.ts",
    "scripts/live-voice.ts",
    // P2: one text call per typed or spoken question (never per suggestion), never retried.
    "src/app/api/ask/route.ts",
    "scripts/live-ask.ts",
  ]);

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });
  }

  test("no other module imports @/lib/meta", () => {
    const root = join(import.meta.dir, "..");
    const offenders = [...files(join(root, "src")), ...files(join(root, "scripts"))]
      .map((p) => relative(root, p).replaceAll("\\", "/"))
      .filter((p) => !p.endsWith(".test.ts"))
      .filter((p) => /from\s+["'](@\/lib\/meta|\.\.?\/.*meta\/transport)/.test(readFileSync(join(root, p), "utf8")))
      .filter((p) => !ALLOWED.has(p));
    expect(offenders).toEqual([]);
  });

  test.each(["src/lib/extraction/pipeline.ts", "src/lib/extraction/two-pass.ts"])("%s imports the transport for types only", (path) => {
    const src = readFileSync(join(import.meta.dir, "..", path), "utf8");
    expect(src).toMatch(/import type \{[^}]*\} from "@\/lib\/meta\/transport"/);
    expect(src).not.toMatch(/^import \{[^}]*\} from "@\/lib\/meta\/transport"/m);
  });
});
