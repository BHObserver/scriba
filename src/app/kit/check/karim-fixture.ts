import { pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { BLOCKS_PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_V3_VERSION } from "@/lib/extraction/schema";
import type { ReviewRow } from "@/lib/review/state";
import type { Fixture } from "./check-board";

/**
 * Development only (T2): a page shaped like the five-page test's first one, written for the dev
 * board, not his data. Karim's account with its total, then a separate sale just below with its
 * own, read as one part; then the day's sales. The "photo" is drawn here, so the strips have
 * something to show without a private photo.
 */
const W = 1000;
const H = 1400;

type Line = { block: string; text: string; type: string; item?: string; amount: string; y: number };

const LINES: Line[] = [
  { block: "b1", text: "চাল ১৬০", type: "credit_sale", item: "চাল", amount: "১৬০", y: 230 },
  { block: "b1", text: "ডাল ১০০", type: "credit_sale", item: "ডাল", amount: "১০০", y: 310 },
  { block: "b1", text: "মোট ২৬০", type: "subtotal", amount: "২৬০", y: 400 },
  { block: "b1", text: "আটা ১২০", type: "credit_sale", item: "আটা", amount: "১২০", y: 500 },
  { block: "b1", text: "লবণ ৩০", type: "credit_sale", item: "লবণ", amount: "৩০", y: 580 },
  { block: "b1", text: "ডিম ১০০", type: "credit_sale", item: "ডিম", amount: "১০০", y: 660 },
  { block: "b1", text: "মোট ২৫০", type: "subtotal", amount: "২৫০", y: 750 },
  { block: "b2", text: "চা ২০", type: "cash_sale", item: "চা", amount: "২০", y: 960 },
  { block: "b2", text: "বিস্কুট ৪০", type: "cash_sale", item: "বিস্কুট", amount: "৪০", y: 1040 },
];

const grid = (px: number, size: number) => Math.round((px / size) * 1000);

function pageSvg(): string {
  const text = (x: number, y: number, s: string, size = 52) => `<text x="${x}" y="${y}" font-size="${size}">${s}</text>`;
  const rule = (y: number) => `<line x1="140" x2="560" y1="${y}" y2="${y}" stroke="#2b2b6b" stroke-width="3"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#f4eedc"/>`,
    ...Array.from({ length: 17 }, (_, i) => `<line x1="0" x2="${W}" y1="${80 * i + 70}" y2="${80 * i + 70}" stroke="#c9d6e8" stroke-width="2"/>`),
    `<g font-family="Nirmala UI, Vrinda, sans-serif" fill="#23235a">`,
    text(150, 140, "করিম বাকি", 58),
    text(700, 140, "২/১১/২৬", 44),
    ...LINES.map((l) => text(170, l.y, l.text)),
    rule(350),
    rule(700),
    text(150, 880, "নগদ বিক্রি", 58),
    `</g></svg>`,
  ].join("");
}

export function karimFixture(): Fixture | null {
  const output = {
    page: { date_text: "২/১১/২৬", ledger_type: "mixed", legibility: "clear" },
    blocks: [
      { id: "b1", kind: "customer_account", title: "করিম বাকি", party: "করিম", person: null, date_text: null, box: null },
      { id: "b2", kind: "day_sales", title: "নগদ বিক্রি", party: null, person: null, date_text: null, box: null },
    ],
    entries: LINES.map((l, i) => ({
      id: `e${i + 1}`,
      line: i + 1,
      block: l.block,
      text: l.text,
      type: l.type,
      customer: null,
      item: l.item ?? null,
      qty: null,
      unit: null,
      rate: null,
      amount: l.amount,
      balance: null,
      crossed_out: false,
      review: [],
      note: null,
      box: { x_min: grid(150, W), y_min: grid(l.y - 55, H), x_max: grid(560, W), y_max: grid(l.y + 18, H) },
    })),
    doubts: [],
    warnings: [],
  };
  const parsed = parseModelResponse(
    { status: "completed", incompleteReason: null, outputText: JSON.stringify(output), refusal: null },
    { promptVersion: BLOCKS_PROMPT_VERSION, schemaVersion: SCHEMA_V3_VERSION },
  );
  if (!parsed.ok) return null;
  const { extraction } = parsed;
  const rows: ReviewRow[] = extraction.entries.map((e) => ({
    id: e.candidateId,
    extractedEntryId: null,
    lineOrder: e.line,
    values: e.values,
    reviewFields: e.reviewFields,
    status: "draft",
    version: 0,
    candidate: { candidateId: e.candidateId, values: e.values, bbox: e.bbox, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason },
  }));
  return {
    photo: { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageSvg())}`, width: W, height: H, turns: 0 },
    page: { values: pageValuesOf(extraction), version: 0, reviewStartedAt: null },
    rows,
    doubts: [],
    source: "karim-fixture.ts",
  };
}
