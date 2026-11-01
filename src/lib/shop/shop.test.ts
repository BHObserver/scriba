import { describe, expect, test } from "bun:test";
import { prepareBook } from "@/lib/insights/book";
import { duesList } from "@/lib/insights/accounts";
import { daySummary } from "@/lib/insights/day";
import { bookInput, makeParty, makeRecords } from "@/lib/insights/testing";
import type { BookInput, InsightParty, InsightRecord, RecordType } from "@/lib/insights/types";
import { businessDateFor } from "@/lib/ledger/dates";
import { partyLinkFor } from "@/lib/ledger/parties";
import { validateLedger } from "@/lib/validation/engine";
import { closeSnapshots, demoShop } from "./demo";
import { historyDays, mergeProblem, searchLines } from "./history";
import { DEMO_PHOTO_DATASET, type DocumentRow, type RecordRow, SAMPLE_PAGE_DATASET, dayPages, isSeededPage, pageInfos, toBookInput } from "./rows";

const NOW = new Date("2026-11-01T11:30:00+06:00");

/** The demo as the confirm function would store it: parties by kind + key, records per line. */
function demoBookInput(): BookInput {
  const shop = demoShop(NOW);
  const parties = new Map<string, InsightParty>();
  const records: InsightRecord[] = [];
  for (const p of shop.pages) {
    const types = p.lines.map((l) => l.type);
    p.lines.forEach((l, i) => {
      const link = partyLinkFor(l, p.page, types);
      const partyId = link ? `${link.kind}:${link.key}` : null;
      if (link && partyId && !parties.has(partyId)) parties.set(partyId, makeParty(partyId, link.kind, link.name));
      records.push({
        id: `${p.key}-${i}`,
        documentId: p.key,
        runId: `run-${p.key}`,
        businessDate: p.date,
        capturedAt: p.capturedAt,
        lineOrder: i + 1,
        type: l.type as RecordType,
        partyId,
        itemName: l.item,
        amountPoisha: Number(l.amountText!.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))) * 100,
        wasCorrected: false,
        confirmedAt: p.capturedAt,
      });
    });
  }
  return { records, parties: [...parties.values()], closes: [], usualOpeningCashPoisha: 150_000 };
}

describe("demo shop", () => {
  const shop = demoShop(NOW);

  test("is deterministic and reaches back 45+ days", () => {
    expect(demoShop(NOW)).toEqual(shop);
    const dates = new Set(shop.pages.map((p) => p.date));
    expect(dates.size).toBeGreaterThanOrEqual(45);
    expect(shop.today).toBe("2026-11-01");
    expect(shop.pages.filter((p) => p.date === shop.today)).toHaveLength(3);
  });

  test("every page passes every check and its written date gives its business date", () => {
    for (const p of shop.pages) {
      const entries = p.lines.map((values, i) => ({ id: `e${i}`, line: i + 1, values, reviewFields: [], uncertaintyReason: null, excluded: false }));
      const failed = validateLedger({ page: p.page, entries }).filter((f) => f.status === "fail");
      expect({ page: p.key, failed: failed.map((f) => f.ruleId) }).toEqual({ page: p.key, failed: [] });
      expect(businessDateFor(p.page.dateText, new Date(p.capturedAt)).iso).toBe(p.date);
    }
  });

  test("today's pages are captured before now, in order", () => {
    const today = shop.pages.filter((p) => p.date === shop.today).map((p) => p.capturedAt);
    expect([...today].sort()).toEqual(today);
    const early = demoShop(new Date("2026-11-01T00:20:00+06:00")).pages.filter((p) => p.date === "2026-11-01");
    for (const p of early) expect(new Date(p.capturedAt).getTime()).toBeLessThanOrEqual(new Date("2026-11-01T00:20:00+06:00").getTime());
  });

  test("has 12–15 parties and D3's today: drawer ৳৪,৩২০, sales ৳৬,২৯০, the three risks", () => {
    const input = demoBookInput();
    expect(input.parties.length).toBeGreaterThanOrEqual(12);
    expect(input.parties.length).toBeLessThanOrEqual(15);
    const book = prepareBook({ ...input, closes: [] });
    const day = daySummary(book, shop.today);
    expect(day.expectedCash.poisha).toBe(432_000);
    expect(day.sales.poisha).toBe(629_000);
    expect(day.creditSales.poisha).toBe(134_000);
    const dues = duesList(book, "customer", shop.today);
    const risks = Object.fromEntries(dues.parties.filter((a) => a.risks.length > 0).map((a) => [a.name, a.risks[0]!.code]));
    expect(risks).toEqual({ "রহিম উদ্দিন": "no_payment", "সুমাইয়া আপা": "growing", বাবুল: "big_credit" });
  });

  test("closes: one short by ৳৫০, one over by ৳২০; today still starts from the usual cash", () => {
    const input = demoBookInput();
    const snaps = closeSnapshots(input, shop.closes);
    expect(snaps.map((s) => s.gapPoisha).sort((a, b) => a - b)).toEqual([-5_000, 0, 0, 0, 2_000]);
    for (const s of snaps) expect(s.breakdown.opening.source).toBe("usual");
    const closes = snaps.map((s) => ({ ...s, businessDate: s.businessDate }));
    const day = daySummary(prepareBook({ ...input, closes }), shop.today);
    expect(day.opening.source).toBe("usual");
    expect(day.expectedCash.poisha).toBe(432_000);
  });
});

const doc = (id: string, date: string, at: string, extra: Partial<DocumentRow> = {}): DocumentRow => ({
  id,
  storage_path: `u/${id}.jpg`,
  width: 1000,
  height: 1400,
  uploaded_at: at,
  status: "extracted",
  business_date: date,
  business_date_source: "capture",
  dataset_label: null,
  sample_label: null,
  ...extra,
});

describe("rows", () => {
  test("toBookInput joins the page's date, reads numeric strings and skips records of deleted pages", () => {
    const row = (id: string, document_id: string): RecordRow => ({
      id, document_id, run_id: "run", extracted_entry_id: null, line_order: "2.5", transaction_type: "cash_sale", party_id: null,
      customer_alias: null, item_name: "চাল", source_text: "চাল ১৮০", quantity_text: null, unit: null, unit_rate_text: null,
      amount_text: "১৮০", amount_poisha: "18000", was_corrected: false, confirmed_at: "2026-10-31T10:00:00Z",
    });
    const input = toBookInput({
      records: [row("r1", "d1"), row("r2", "gone")],
      documents: [doc("d1", "2026-10-30", "2026-10-31T02:00:00Z")],
      parties: [],
      closes: [{ business_date: "2026-10-30", opening_cash_poisha: "100", expected_cash_poisha: "200", counted_cash_poisha: "150", note: null, closed_at: "x" }],
      profile: { shopName: "দোকান", language: "bn", openingCashPoisha: 5_000, isSample: false },
    });
    expect(input.records).toEqual([expect.objectContaining({ id: "r1", businessDate: "2026-10-30", lineOrder: 2.5, amountPoisha: 18_000 })]);
    expect(input.closes[0]).toEqual({ businessDate: "2026-10-30", openingCashPoisha: 100, expectedCashPoisha: 200, countedCashPoisha: 150 });
    expect(input.usualOpeningCashPoisha).toBe(5_000);
  });

  test("page state: unread, waiting or checked, in capture order; sample pages have no photo", () => {
    const docs = [
      doc("b", "2026-10-31", "2026-10-31T09:00:00Z"),
      doc("a", "2026-10-31", "2026-10-31T04:00:00Z", { dataset_label: SAMPLE_PAGE_DATASET }),
      doc("c", "2026-10-31", "2026-10-31T10:00:00Z", { status: "uploaded" }),
    ];
    const pages = pageInfos(docs, new Set(["a", "b"]), new Map([["b", 3]]), new Map([["a", 9]]));
    expect(pages.map((p) => [p.documentId, p.state, p.waitingLines, p.confirmedLines, p.hasPhoto])).toEqual([
      ["a", "checked", 0, 9, false],
      ["b", "waiting", 3, 0, true],
      ["c", "unread", 0, 0, true],
    ]);
    expect(dayPages(pages, "2026-10-31")).toEqual([
      { documentId: "a", checked: true, waitingLines: 0 },
      { documentId: "b", checked: false, waitingLines: 3 },
      { documentId: "c", checked: false, waitingLines: 0 },
    ]);
    expect(dayPages(pages, "2026-10-30")).toEqual([]);
  });

  test("only the demo seed's pages count as seeded (their readings were never sent to Meta)", () => {
    expect(isSeededPage({ dataset_label: SAMPLE_PAGE_DATASET })).toBe(true);
    expect(isSeededPage({ dataset_label: DEMO_PHOTO_DATASET })).toBe(true);
    expect(isSeededPage({ dataset_label: null })).toBe(false);
    expect(isSeededPage({ dataset_label: "development" })).toBe(false);
  });
});

describe("history", () => {
  const parties = [makeParty("k1", "customer", "মোঃ করিম"), makeParty("k2", "customer", "করীম", "k1"), makeParty("s", "supplier", "রফিক ট্রেডার্স")];
  const records = makeRecords([
    { date: "2026-10-29", type: "credit_sale", taka: 180, party: "k1", item: "চাল", id: "x1" },
    { date: "2026-10-30", type: "credit_sale", taka: 140, party: "k2", item: "ডাল", id: "x2" },
    { date: "2026-10-31", type: "cash_sale", taka: 90, item: "সাবান", id: "x3" },
    { date: "2026-10-31", type: "credit_purchase", taka: 900, party: "s", item: "চিনি", id: "x4" },
  ]);
  const book = prepareBook(bookInput(records, { parties, closes: [{ businessDate: "2026-10-31", openingCashPoisha: 0, expectedCashPoisha: 9_000, countedCashPoisha: 8_500 }] }));
  const texts = new Map(records.map((r) => [r.id, { itemName: r.itemName, customerAlias: null, sourceText: r.itemName ?? "" }]));

  test("a name finds its spelling variants and merged parties, newest first; items match too", () => {
    expect(searchLines(book, texts, "করিম")).toEqual(["x2", "x1"]);
    expect(searchLines(book, texts, "সাবান")).toEqual(["x3"]);
    expect(searchLines(book, texts, "  ")).toEqual([]);
    expect(searchLines(book, texts, "রফিক")).toEqual(["x4"]);
  });

  test("one day per date, newest first, with sales, waiting pages and close status", () => {
    const pages = pageInfos([doc("doc-2026-10-31", "2026-10-31", "2026-10-31T04:00:00Z"), doc("p2", "2026-11-01", "2026-11-01T04:00:00Z")], new Set(["doc-2026-10-31"]), new Map(), new Map());
    const days = historyDays(book, pages);
    expect(days.map((d) => [d.date, d.sales.poisha, d.waitingPages, d.close?.status ?? null, d.close?.gapPoisha ?? null])).toEqual([
      ["2026-11-01", 0, 1, null, null],
      ["2026-10-31", 9_000, 0, "short", -500],
      ["2026-10-30", 14_000, 0, null, null],
      ["2026-10-29", 18_000, 0, null, null],
    ]);
  });

  test("merge rules", () => {
    const map = new Map([...parties, makeParty("k3", "customer", "করিম ভাই")].map((p) => [p.id, p]));
    expect(mergeProblem(map, "k3", "k1")).toBeNull();
    expect(mergeProblem(map, "k3", "k2")).toBeNull();
    expect(mergeProblem(map, "k1", "k1")).toBe("same");
    expect(mergeProblem(map, "k3", "s")).toBe("kind");
    expect(mergeProblem(map, "k2", "k3")).toBe("source_merged");
    expect(mergeProblem(map, "k1", "k2")).toBe("cycle");
    expect(mergeProblem(map, "k1", "nobody")).toBe("missing");
  });
});
