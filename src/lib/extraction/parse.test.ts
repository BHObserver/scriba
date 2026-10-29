import { describe, expect, test } from "bun:test";
import { ENTRY_FIELDS, EXTRACTION_JSON_SCHEMA, PAGE_FIELDS, modelOutputSchema } from "./schema";
import { parseModelResponse } from "./parse";
import { extractionCacheKey } from "./cache-key";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    line: 1,
    text: "চাল ৩ কেজি × ৬০ = ১৮০",
    type: "credit_sale",
    customer: null,
    item: "চাল",
    qty: "৩",
    unit: "কেজি",
    rate: "৬০",
    amount: "১৮০",
    balance: null,
    crossed_out: false,
    review: [],
    note: null,
    box: { x_min: 50, y_min: 100, x_max: 900, y_max: 160 },
    ...overrides,
  };
}

function output(entries: unknown[], page: Record<string, unknown> = {}) {
  return {
    page: { date_text: "২৯/১০/২০২৬", ledger_type: "customer_credit", account_name: "রহিম", legibility: "clear", ...page },
    entries,
    warnings: [],
  };
}

const respond = (body: unknown, extra: Partial<Parameters<typeof parseModelResponse>[0]> = {}) =>
  parseModelResponse({
    status: "completed",
    incompleteReason: null,
    refusal: null,
    outputText: typeof body === "string" ? body : JSON.stringify(body),
    ...extra,
  });

describe("valid responses", () => {
  test("normalizes Bangla digits while preserving source text", () => {
    const r = respond(output([entry()]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = r.extraction.entries[0]!;
    expect(e.values.sourceText).toBe("চাল ৩ কেজি × ৬০ = ১৮০");
    expect(e.values.amountText).toBe("১৮০");
    expect(e.numbers).toEqual({ quantityMilli: 3000, ratePoisha: 6000, amountPoisha: 18000, balancePoisha: null });
    expect(r.extraction.page.dateIso).toBe("2026-10-29");
  });

  test("mixed Bangla and Arabic digits across fields", () => {
    const r = respond(output([entry({ qty: "2", rate: "৮৫", amount: "170" })]));
    expect(r.ok && r.extraction.entries[0]!.numbers.amountPoisha).toBe(17000);
  });

  test("missing and null fields stay null; a missing amount is not zero", () => {
    const r = respond(output([entry({ qty: null, rate: null, amount: null, item: null })]));
    expect(r.ok && r.extraction.entries[0]!.numbers.amountPoisha).toBeNull();
  });

  test("malformed numbers keep their text and get a null value", () => {
    const r = respond(output([entry({ amount: "১৮?" })]));
    if (!r.ok) throw new Error("expected ok");
    expect(r.extraction.entries[0]!.values.amountText).toBe("১৮?");
    expect(r.extraction.entries[0]!.numbers.amountPoisha).toBeNull();
  });

  test("an opening or closing balance filed under balance is read as the line's amount", () => {
    const r = respond(output([
      entry({ id: "e1", line: 1, type: "opening_balance", item: null, qty: null, unit: null, rate: null, amount: null, balance: "১০০০" }),
      entry({ id: "e2", line: 2, amount: "১৮০", balance: "১১৮০" }),
      entry({ id: "e3", line: 3, type: "closing_balance", item: null, qty: null, unit: null, rate: null, amount: null, balance: "১১৮০" }),
    ]));
    if (!r.ok) throw new Error("expected ok");
    const [opening, sale, closing] = r.extraction.entries;
    expect(opening!.values).toMatchObject({ amountText: "১০০০", balanceText: null });
    expect(sale!.values).toMatchObject({ amountText: "১৮০", balanceText: "১১৮০" }); // a running balance on a sale stays put
    expect(closing!.numbers.amountPoisha).toBe(118000);
    expect(r.extraction.page.openingBalancePoisha).toBe(100000);
    expect(r.extraction.page.closingBalancePoisha).toBe(118000);
  });

  test("missing source coordinates are allowed", () => {
    const r = respond(output([entry({ box: null })]));
    expect(r.ok && r.extraction.entries[0]!.bbox).toBeNull();
  });

  test("invalid coordinates are discarded with a warning, never guessed", () => {
    const r = respond(output([
      entry({ id: "e1", box: { x_min: 500, y_min: 100, x_max: 400, y_max: 160 } }),
      entry({ id: "e2", line: 2, box: { x_min: 0, y_min: 0, x_max: 5000, y_max: 10 } }),
      entry({ id: "e3", line: 3, box: { x_min: -2, y_min: 10, x_max: 1001, y_max: 40 } }),
    ]));
    if (!r.ok) throw new Error("expected ok");
    expect(r.extraction.entries[0]!.bbox).toBeNull();
    expect(r.extraction.entries[1]!.bbox).toBeNull();
    expect(r.extraction.entries[2]!.bbox).toEqual({ x_min: 0, y_min: 10, x_max: 1000, y_max: 40 });
    expect(r.extraction.warnings.length).toBe(2);
  });

  test("page-level balances are taken only from explicit balance lines", () => {
    const r = respond(output([
      entry({ id: "o", line: 1, type: "opening_balance", amount: "১,০০০", qty: null, rate: null }),
      entry({ id: "s", line: 2 }),
      entry({ id: "t", line: 3, type: "subtotal", amount: "৩১০", qty: null, rate: null }),
    ]));
    if (!r.ok) throw new Error("expected ok");
    expect(r.extraction.page.openingBalancePoisha).toBe(100000);
    expect(r.extraction.page.closingBalancePoisha).toBeNull();
    expect(r.extraction.page.writtenTotals).toEqual([{ candidateId: "t", amountPoisha: 31000 }]);
  });

  test("duplicate ids and out-of-order lines are repaired with warnings", () => {
    const r = respond(output([entry({ id: "e1", line: 2 }), entry({ id: "e1", line: 1, text: "first" })]));
    if (!r.ok) throw new Error("expected ok");
    expect(r.extraction.entries.map((e) => e.values.sourceText)).toEqual(["first", "চাল ৩ কেজি × ৬০ = ১৮০"]);
    expect(new Set(r.extraction.entries.map((e) => e.candidateId)).size).toBe(2);
  });

  test("a fenced JSON response is accepted", () => {
    expect(respond("```json\n" + JSON.stringify(output([entry()])) + "\n```").ok).toBe(true);
  });
});

describe("invalid responses are failures, never silently accepted", () => {
  test("truncated output", () => {
    const text = JSON.stringify(output([entry(), entry({ id: "e2" })])).slice(0, 120);
    expect(respond(text)).toMatchObject({ ok: false, kind: "invalid_json" });
  });

  test("status incomplete is a failure even if the JSON happens to parse", () => {
    expect(respond(output([entry()]), { status: "incomplete", incompleteReason: "max_output_tokens" })).toMatchObject({
      ok: false,
      kind: "incomplete",
    });
  });

  test("unsupported transaction type", () => {
    expect(respond(output([entry({ type: "loan" })]))).toMatchObject({ ok: false, kind: "schema_mismatch" });
  });

  test("missing required field", () => {
    const e = entry() as Record<string, unknown>;
    delete e.amount;
    expect(respond(output([e]))).toMatchObject({ ok: false, kind: "schema_mismatch" });
  });

  test("not JSON at all", () => {
    expect(respond("I cannot read this image.")).toMatchObject({ ok: false, kind: "invalid_json" });
  });

  test("empty output and refusals", () => {
    expect(respond("")).toMatchObject({ ok: false, kind: "empty" });
    expect(respond("", { refusal: "No." })).toMatchObject({ ok: false, kind: "refusal" });
  });
});

describe("schema agreement", () => {
  test("the JSON Schema sent to Meta and the local zod schema have the same fields", () => {
    const jsonEntry = EXTRACTION_JSON_SCHEMA.properties.entries.items;
    expect(Object.keys(jsonEntry.properties).sort()).toEqual([...ENTRY_FIELDS].sort());
    expect([...jsonEntry.required].sort()).toEqual([...ENTRY_FIELDS].sort());
    expect(Object.keys(modelOutputSchema.shape.entries.element.shape).sort()).toEqual([...ENTRY_FIELDS].sort());
    const jsonPage = EXTRACTION_JSON_SCHEMA.properties.page;
    expect(Object.keys(jsonPage.properties).sort()).toEqual([...PAGE_FIELDS].sort());
    expect(Object.keys(modelOutputSchema.shape.page.shape).sort()).toEqual([...PAGE_FIELDS].sort());
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
    visit(EXTRACTION_JSON_SCHEMA);
  });
});

describe("cache key", () => {
  const parts = {
    ownerId: "u1",
    imageSha256: "a".repeat(64),
    modelId: "muse-spark-1.3",
    promptVersion: "p1",
    schemaVersion: "s1",
    processingMode: "baseline_original" as const,
  };
  test("deterministic", () => {
    expect(extractionCacheKey(parts)).toBe(extractionCacheKey({ ...parts }));
  });
  test("changes with every component, including owner", () => {
    const base = extractionCacheKey(parts);
    for (const change of [{ ownerId: "u2" }, { modelId: "muse-spark-1.2" }, { promptVersion: "p2" }, { schemaVersion: "s2" }, { imageSha256: "b".repeat(64) }]) {
      expect(extractionCacheKey({ ...parts, ...change })).not.toBe(base);
    }
  });
});
