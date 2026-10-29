/**
 * Credit-control guarantees. No test here talks to Meta: the model is a counting
 * mock, and the repository is the in-memory double that mirrors the database
 * constraints.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { type AnalyzeSettings, analyzeDocument } from "@/lib/extraction/pipeline";
import type { ModelCallResult, ModelCallSuccess, ModelCaller } from "@/lib/meta/transport";
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

describe("structural guarantee: only explicit paths can reach Meta", () => {
  // Editing, revalidating, reopening a document or changing a filter must never
  // be able to trigger a paid call. Enforced by the import graph: only these
  // files may import the Meta transport.
  const ALLOWED = new Set([
    "src/lib/meta/transport.ts",
    "src/lib/extraction/pipeline.ts", // type-only import of ModelCaller
    "src/lib/server/analyze.ts",
    "scripts/live-extract.ts",
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

  test("the pipeline imports the transport for types only", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/lib/extraction/pipeline.ts"), "utf8");
    expect(src).toMatch(/import type \{[^}]*\} from "@\/lib\/meta\/transport"/);
  });
});
