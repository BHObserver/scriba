/**
 * Schema 3 and prompt 6 (U1): a page read in blocks, from the model's output to the checks and
 * the parties. The north-star page is a company visit written beside the day's sales:
 *
 *   Praan (Selim)          নগদ বিক্রি
 *   Before - 2800          চাল ২ কেজি ১২০
 *   Given - 1500           তেল ১ লিটার ১৮০
 *   Juice 1 Box            করিম বাকি ২০০
 *   Buiscite 2 Box         মোট ৫০০
 *   Conacor - 1 Box
 *
 * Pran is the supplier, Selim its rep. The shop owed 2,800, paid 1,500, and took goods with no
 * price written, so Pran is owed 1,300 plus the goods, and that cannot be checked yet.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { partyLinkFor } from "@/lib/ledger/parties";
import { type EntryValues, type PageValues, REVIEWABLE_FIELDS } from "@/lib/ledger/types";
import { assessEntry } from "@/lib/review/approval";
import { keepBlock, keepBlocks, pageValuesSchema } from "@/lib/review/values";
import { type ValidationEntry, validateLedger } from "@/lib/validation/engine";
import { type NormalizedExtraction, pageValuesOf, parseModelResponse } from "./parse";
import {
  BLOCK_FIELDS,
  DOUBT_FIELDS,
  DOUBT_FIELD_NAMES,
  ENTRY_FIELDS_V3,
  EXTRACTION_JSON_SCHEMA_V3,
  PAGE_FIELDS_V3,
  SCHEMA_V3_VERSION,
  modelOutputSchemaV3,
} from "./schema";
import { BLOCKS_PROMPT_VERSION, DIGIT_RULES, getExtractionProfile, getPersonalProfile, withLayout } from "./prompt";

const V3 = { promptVersion: BLOCKS_PROMPT_VERSION, schemaVersion: SCHEMA_V3_VERSION };

function line(id: string, block: string, text: string, type: string, o: Record<string, unknown> = {}) {
  return {
    id,
    line: Number(id.slice(1)),
    block,
    text,
    type,
    customer: null,
    item: null,
    qty: null,
    unit: null,
    rate: null,
    amount: null,
    balance: null,
    crossed_out: false,
    review: [],
    note: null,
    box: null,
    ...o,
  };
}

const PRAN = { id: "b1", kind: "supplier_visit", title: "Praan (Selim)", party: "Praan", person: "Selim", date_text: null, box: { x_min: 40, y_min: 80, x_max: 480, y_max: 600 } };
const SALES = { id: "b2", kind: "day_sales", title: "নগদ বিক্রি", party: null, person: null, date_text: null, box: { x_min: 520, y_min: 80, x_max: 960, y_max: 520 } };

function pranPage(o: { blocks?: unknown[]; entries?: Array<ReturnType<typeof line>>; doubts?: unknown[] } = {}) {
  return {
    page: { date_text: "1/11/26", ledger_type: "mixed", legibility: "clear" },
    blocks: o.blocks ?? [PRAN, SALES],
    entries: o.entries ?? [
      line("e1", "b1", "Before - 2800", "opening_balance", { amount: "2800" }),
      line("e2", "b1", "Given - 1500", "supplier_payment", { amount: "1500" }),
      line("e3", "b1", "Juice 1 Box", "credit_purchase", { item: "Juice", qty: "1", unit: "Box" }),
      line("e4", "b1", "Buiscite 2 Box", "credit_purchase", { item: "Buiscite", qty: "2", unit: "Box" }),
      line("e5", "b1", "Conacor - 1 Box", "credit_purchase", { item: "Conacor", qty: "1", unit: "Box" }),
      line("e6", "b2", "চাল ২ কেজি ১২০", "cash_sale", { item: "চাল", qty: "২", unit: "কেজি", amount: "১২০" }),
      line("e7", "b2", "তেল ১ লিটার ১৮০", "cash_sale", { item: "তেল", qty: "১", unit: "লিটার", amount: "১৮০" }),
      line("e8", "b2", "করিম বাকি ২০০", "credit_sale", { customer: "করিম", amount: "২০০" }),
      line("e9", "b2", "মোট ৫০০", "subtotal", { amount: "৫০০" }),
    ],
    doubts: o.doubts ?? [],
    warnings: [],
  };
}

function read(output: unknown): NormalizedExtraction {
  const r = parseModelResponse({ status: "completed", incompleteReason: null, outputText: JSON.stringify(output), refusal: null }, V3);
  if (!r.ok) throw new Error(`${r.kind}: ${r.detail}`);
  return r.extraction;
}

function asEntries(x: NormalizedExtraction, values: Record<string, Partial<EntryValues>> = {}): ValidationEntry[] {
  return x.entries.map((e) => ({
    id: e.candidateId,
    line: e.line,
    values: { ...e.values, ...values[e.candidateId] },
    reviewFields: e.reviewFields,
    uncertaintyReason: e.uncertaintyReason,
    excluded: false,
  }));
}

describe("the Pran page", () => {
  const x = read(pranPage());
  const page = pageValuesOf(x);
  const entries = asEntries(x);
  const findings = validateLedger({ page, entries });
  const balance = (block: string) => findings.find((f) => f.ruleId === "balance_equation" && f.block === block);

  test("reads two blocks, with the company as party and the rep as a note", () => {
    expect(x.schemaVersion).toBe("scriba-extraction-3");
    expect(x.blocks?.map((b) => [b.id, b.kind, b.party, b.person])).toEqual([
      ["b1", "supplier_visit", "Praan", "Selim"],
      ["b2", "day_sales", null, null],
    ]);
    expect(x.blocks?.[0]?.box).toEqual(PRAN.box);
    expect(page.blocks?.[0]).toEqual({ id: "b1", kind: "supplier_visit", title: "Praan (Selim)", party: "Praan", person: "Selim", dateText: null });
    expect(x.entries.map((e) => e.values.block)).toEqual(["b1", "b1", "b1", "b1", "b1", "b2", "b2", "b2", "b2"]);
    expect(x.warnings).toEqual([]);
  });

  test("goods lines keep item, quantity and unit, with no amount", () => {
    const juice = x.entries.find((e) => e.candidateId === "e3")!;
    expect(juice.values).toMatchObject({ item: "Juice", quantityText: "1", unit: "Box", amountText: null });
    expect(juice.numbers.amountPoisha).toBeNull();
  });

  test("Pran's balance is 1,300 plus the goods, and cannot be checked yet", () => {
    const b = balance("b1")!;
    expect(b.status).toBe("unverifiable");
    expect(b.reason).toBe("unpriced_goods");
    expect(b.expected).toBeNull();
    expect(b.entryIds).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(b.message).toContain("৳2,800");
    expect(b.message).toContain("gives ৳1,300 so far");
    expect(b.message).toContain("lines 3, 4, 5");
  });

  test("the day's sales are checked on their own: the total adds up, and there is no balance to check", () => {
    const total = findings.find((f) => f.ruleId === "written_total")!;
    expect(total).toMatchObject({ status: "pass", block: "b2", expected: 50000, observed: 50000 });
    expect(total.entryIds).toEqual(["e6", "e7", "e8", "e9"]);
    expect(balance("b2")).toBeUndefined();
  });

  test("Pran's lines link to the supplier Praan; the day's credit sale to its customer", () => {
    const types = entries.map((e) => e.values.type);
    const link = (id: string) => partyLinkFor(entries.find((e) => e.id === id)!.values, page, types);
    for (const id of ["e1", "e2", "e3"]) expect(link(id)).toEqual({ kind: "supplier", key: "praan", name: "Praan" });
    expect(link("e8")).toEqual({ kind: "customer", key: "করিম", name: "করিম" });
    expect(link("e6")).toBeNull();
    expect(link("e9")).toBeNull();
  });

  test("a goods line cannot be confirmed until it has a price; the paid line can", () => {
    expect(assessEntry(entries.find((e) => e.id === "e3")!, findings).blockers).toContain(
      "No amount is recorded. A missing amount cannot be approved as zero.",
    );
    expect(assessEntry(entries.find((e) => e.id === "e2")!, findings).blockers).toEqual([]);
  });

  test("once the goods are priced, the balance follows; a written due is then checked", () => {
    const priced = { e3: { amountText: "600" }, e4: { amountText: "1000" }, e5: { amountText: "450" } };
    const open = validateLedger({ page, entries: asEntries(x, priced) }).find((f) => f.ruleId === "balance_equation")!;
    expect(open).toMatchObject({ status: "unverifiable", reason: "no_closing", expected: 335000, block: "b1" });

    const withDue = read(
      pranPage({
        entries: [
          ...pranPage().entries.slice(0, 5),
          line("e6", "b1", "Now - 3350", "closing_balance", { amount: "3350" }),
        ],
      }),
    );
    const checked = validateLedger({ page: pageValuesOf(withDue), entries: asEntries(withDue, priced) });
    expect(checked.find((f) => f.ruleId === "balance_equation")).toMatchObject({ status: "pass", expected: 335000, observed: 335000 });
    const wrong = validateLedger({ page: pageValuesOf(withDue), entries: asEntries(withDue, { ...priced, e6: { amountText: "3500" } }) });
    expect(wrong.find((f) => f.ruleId === "balance_equation")).toMatchObject({ status: "fail", severity: "error" });
  });

  test("a payment typed as a customer's repayment in a company visit is flagged, and gets no party", () => {
    const flipped = asEntries(x, { e2: { type: "repayment" } });
    const b = validateLedger({ page, entries: flipped }).find((f) => f.ruleId === "balance_equation")!;
    expect(b).toMatchObject({ status: "unverifiable", reason: "undefined_effect" });
    expect(b.message).toContain("what the shop owes this supplier");
    const unknown = validateLedger({ page, entries: asEntries(x, { e2: { type: "unknown" } }) }).find((f) => f.ruleId === "balance_equation")!;
    expect(unknown.message).toBe("Line 2 has no transaction type yet, so its effect on what the shop owes this supplier is not known.");
    expect(partyLinkFor(flipped[1]!.values, page, [])).toBeNull();
  });
});

describe("schema 3 parsing", () => {
  test("party and person written together are split", () => {
    const x = read(pranPage({ blocks: [{ ...PRAN, party: "Praan (Selim)", person: null }, SALES] }));
    expect(x.blocks?.[0]).toMatchObject({ party: "Praan", person: "Selim" });
  });

  test("an account block without a party takes its heading; a sales block does not", () => {
    const x = read(pranPage({ blocks: [{ ...PRAN, party: null, person: null }, { ...SALES }] }));
    expect(x.blocks?.map((b) => [b.party, b.person])).toEqual([["Praan", "Selim"], [null, null]]);
  });

  test("a line naming a block the reading did not describe goes to one 'other' block, with a warning", () => {
    const base = pranPage();
    const x = read({ ...base, entries: base.entries.map((e) => (e.id === "e9" || e.id === "e8" ? { ...e, block: "b7" } : e)) });
    expect(x.blocks?.map((b) => [b.id, b.kind])).toEqual([["b1", "supplier_visit"], ["b2", "day_sales"], ["b3", "other"]]);
    expect(x.entries.filter((e) => e.values.block === "b3").map((e) => e.candidateId)).toEqual(["e8", "e9"]);
    expect(x.warnings.join(" ")).toContain('e8, e9 named no block of this reading, so they were put in block b3 ("other").');
  });

  test("duplicate block ids are renamed; lines stay with the first", () => {
    const x = read(pranPage({ blocks: [PRAN, { ...SALES, id: "b1" }], entries: pranPage().entries.slice(0, 5) }));
    expect(x.blocks?.map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(x.entries.every((e) => e.values.block === "b1")).toBe(true);
    expect(x.warnings[0]).toContain('Duplicate block id "b1"');
  });

  test("doubts keep valid, distinct options with the entry's reading first, at most three", () => {
    const x = read(
      pranPage({
        doubts: [
          { entry: "e1", field: "amount", options: ["২৮০০", "2300", "2800", "28OO", "3800", "2900"], note: "8 or 3" },
          { entry: "e2", field: "amount", options: ["1500"], note: null },
          { entry: "e3", field: "type", options: ["purchase", "gift"], note: null },
          { entry: "e9", field: "amount", options: ["৫০০", "৬০০"], note: null },
          { entry: "e9", field: "amount", options: ["৫০০", "৯০০"], note: null },
          { entry: "e42", field: "amount", options: ["1", "2"], note: null },
        ],
      }),
    );
    expect(x.doubts).toEqual([
      { entryId: "e1", field: "amount", options: ["2800", "2300", "3800"], note: "8 or 3" },
      { entryId: "e3", field: "type", options: ["credit_purchase", "purchase"], note: null },
      { entryId: "e9", field: "amount", options: ["৫০০", "৬০০"], note: null },
    ]);
    // A doubt marks the field as unsure, so the old review screen asks about it too.
    expect(x.entries.find((e) => e.candidateId === "e1")!.reviewFields).toContain("amount");
    expect(x.entries.find((e) => e.candidateId === "e2")!.reviewFields).toEqual([]);
    expect(x.warnings.some((w) => w.includes("amount on e2 was dropped"))).toBe(true);
  });

  test("schema 3 output is refused by the schema 2 parser and the reverse, never half-read", () => {
    const summary = (o: unknown) => ({ status: "completed", incompleteReason: null, outputText: JSON.stringify(o), refusal: null });
    expect(parseModelResponse(summary(pranPage()), { promptVersion: "scriba-prompt-4", schemaVersion: "scriba-extraction-2" })).toMatchObject({
      ok: false,
      kind: "schema_mismatch",
    });
    const v2 = { page: { date_text: null, ledger_type: "mixed", account_name: null, legibility: "clear" }, entries: [], warnings: [] };
    expect(parseModelResponse(summary(v2), V3)).toMatchObject({ ok: false, kind: "schema_mismatch" });
  });

  test("the JSON Schema sent to Meta and the zod schema agree, and satisfy strict mode", () => {
    const j = EXTRACTION_JSON_SCHEMA_V3.properties;
    const z = modelOutputSchemaV3.shape;
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(j.page.properties)).toEqual([...PAGE_FIELDS_V3].sort());
    expect(keys(z.page.shape)).toEqual([...PAGE_FIELDS_V3].sort());
    expect(keys(j.blocks.items.properties)).toEqual([...BLOCK_FIELDS].sort());
    expect(keys(z.blocks.element.shape)).toEqual([...BLOCK_FIELDS].sort());
    expect(keys(j.entries.items.properties)).toEqual([...ENTRY_FIELDS_V3].sort());
    expect(keys(z.entries.element.shape)).toEqual([...ENTRY_FIELDS_V3].sort());
    expect(keys(j.doubts.items.properties)).toEqual([...DOUBT_FIELDS].sort());
    expect(keys(z.doubts.element.shape)).toEqual([...DOUBT_FIELDS].sort());
    expect(keys(j)).toEqual(keys(z));
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      Object.values(n).forEach(visit);
    };
    visit(EXTRACTION_JSON_SCHEMA_V3);
  });

  test("a doubt may be about any reviewable value except the whole line's text", () => {
    expect([...DOUBT_FIELD_NAMES].sort()).toEqual(REVIEWABLE_FIELDS.filter((f) => f !== "text").sort());
    expect(EXTRACTION_JSON_SCHEMA_V3.properties.doubts.items.properties.field.enum).toEqual([...DOUBT_FIELD_NAMES]);
    const textDoubt = { ...pranPage(), doubts: [{ entry: "e1", field: "text", options: ["a", "b"], note: null }] };
    expect(parseModelResponse({ status: "completed", incompleteReason: null, outputText: JSON.stringify(textDoubt), refusal: null }, V3)).toMatchObject({
      ok: false,
      kind: "schema_mismatch",
    });
  });
});

describe("prompt 6", () => {
  afterEach(() => {
    delete process.env.SCRIBA_PROMPT_VERSION;
  });

  test("is selectable with schema 3; prompt 4 stays the default", () => {
    expect(getExtractionProfile().promptVersion).toBe("scriba-prompt-4");
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    const p = getExtractionProfile();
    expect(p).toMatchObject({ promptVersion: "scriba-prompt-6", schemaVersion: "scriba-extraction-3", schemaName: "scriba_ledger_extraction_v3" });
    expect(p.jsonSchema).toBe(EXTRACTION_JSON_SCHEMA_V3);
  });

  test("carries prompt 4's digit rules word for word, and says never to price goods", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    const p6 = getExtractionProfile().instructions;
    expect(DIGIT_RULES.startsWith("Reading digits:")).toBe(true);
    expect(DIGIT_RULES).toContain("৪ (four) looks like 8");
    expect(DIGIT_RULES.endsWith("list that field in review.")).toBe(true);
    expect(p6).toContain(DIGIT_RULES);
    expect(p6).toContain("Never price goods");
    expect(p6).toContain('For "Praan (Selim)", party is "Praan" and person is "Selim".');
  });

  test("the khata layout and the writer's notes stay on prompt 4", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    expect(withLayout(getExtractionProfile(), "scriba_khata").promptVersion).toBe("scriba-prompt-6");
    expect(getPersonalProfile()).toBeNull();
  });
});

describe("blocks survive clients that predate them", () => {
  const blocks = [{ id: "b1", kind: "supplier_visit" as const, title: null, party: "Praan", person: "Selim", dateText: null }];

  test("a page edit without blocks keeps the stored ones; an explicit list replaces them", () => {
    const old: PageValues = { dateText: "১/১১", ledgerType: "mixed", accountName: null };
    expect(keepBlocks(old, { blocks }).blocks).toEqual(blocks);
    expect(keepBlocks({ ...old, blocks: [] }, { blocks }).blocks).toEqual([]);
    expect(keepBlocks(old, {}).blocks).toBeUndefined();
  });

  test("a line edit without a block keeps the stored one; null moves it out", () => {
    expect(keepBlock<Partial<EntryValues>>({ type: "cash_sale" }, { block: "b2" })).toEqual({ type: "cash_sale", block: "b2" });
    expect(keepBlock<Partial<EntryValues>>({ type: "cash_sale", block: null }, { block: "b2" })).toEqual({ type: "cash_sale", block: null });
  });

  test("page values with blocks validate; duplicate block ids do not", () => {
    const values = { dateText: null, ledgerType: "mixed", accountName: null, blocks };
    expect(pageValuesSchema.parse(values).blocks).toEqual(blocks);
    expect(pageValuesSchema.safeParse({ ...values, blocks: [...blocks, ...blocks] }).success).toBe(false);
    expect(pageValuesSchema.parse({ dateText: null, ledgerType: "mixed", accountName: null }).blocks).toBeUndefined();
  });
});
