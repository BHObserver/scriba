import { pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { BLOCKS_PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_V3_VERSION } from "@/lib/extraction/schema";
import { normalizePartyName } from "@/lib/ledger/parties";
import type { KnownParty } from "@/lib/questions/types";
import type { ReviewRow } from "@/lib/review/state";
import type { Fixture } from "./check-board";

/**
 * Development only: pages shaped like the five-page test's first two, written for the dev board,
 * not his data. The "photo" is drawn here, so the strips have something to show without a private
 * photo.
 *  - `karimFixture` (T2): Karim's account with its total, then a separate sale just below with
 *    its own, read as one part; then the day's sales.
 *  - `karimBookFixture` (T3): the next day, with a pretend khata. Karim pays ৳200 with no
 *    "before" written (the khata has ৳260); Fresh's Kamal comes with "before ২৬০০" (the khata
 *    has ৳1,600: a misread ১); Pran's Selim with "before ২৮০০", as the khata has it.
 */
const W = 1000;
const H = 1400;

type Line = { block: string; text: string; type: string; item?: string; amount: string; balance?: string; y: number };
type Drawn = { date: string; blocks: unknown[]; lines: Line[]; heads: Array<{ y: number; text: string }>; rules: number[] };

const KARIM_P1: Drawn = {
  date: "২/১১/২৬",
  blocks: [
    { id: "b1", kind: "customer_account", title: "করিম বাকি", party: "করিম", person: null, date_text: null, box: null },
    { id: "b2", kind: "day_sales", title: "নগদ বিক্রি", party: null, person: null, date_text: null, box: null },
  ],
  lines: [
    { block: "b1", text: "চাল ১৬০", type: "credit_sale", item: "চাল", amount: "১৬০", y: 230 },
    { block: "b1", text: "ডাল ১০০", type: "credit_sale", item: "ডাল", amount: "১০০", y: 310 },
    { block: "b1", text: "মোট ২৬০", type: "subtotal", amount: "২৬০", y: 400 },
    { block: "b1", text: "আটা ১২০", type: "credit_sale", item: "আটা", amount: "১২০", y: 500 },
    { block: "b1", text: "লবণ ৩০", type: "credit_sale", item: "লবণ", amount: "৩০", y: 580 },
    { block: "b1", text: "ডিম ১০০", type: "credit_sale", item: "ডিম", amount: "১০০", y: 660 },
    { block: "b1", text: "মোট ২৫০", type: "subtotal", amount: "২৫০", y: 750 },
    { block: "b2", text: "চা ২০", type: "cash_sale", item: "চা", amount: "২০", y: 960 },
    { block: "b2", text: "বিস্কুট ৪০ = ৬০", type: "cash_sale", item: "বিস্কুট", amount: "৪০", balance: "৬০", y: 1040 },
    // A running total written wrong, like his "চিনি … = ৬২৫" (F2, 4 Nov): the lines give ৳১১০.
    { block: "b2", text: "সাবান ৫০ = ১২০", type: "cash_sale", item: "সাবান", amount: "৫০", balance: "১২০", y: 1120 },
  ],
  heads: [
    { y: 140, text: "করিম বাকি" },
    { y: 880, text: "নগদ বিক্রি" },
  ],
  rules: [350, 700],
};

const KARIM_P2: Drawn = {
  date: "৩/১১/২৬",
  blocks: [
    { id: "b1", kind: "customer_account", title: "করিম", party: "করিম", person: null, date_text: null, box: null },
    { id: "b2", kind: "supplier_visit", title: "ফ্রেশের কামাল", party: "ফ্রেশ", person: "কামাল", date_text: null, box: null },
    { id: "b3", kind: "supplier_visit", title: "প্রাণের সেলিম", party: "প্রাণ", person: "সেলিম", date_text: null, box: null },
  ],
  lines: [
    { block: "b1", text: "করিম জমা ২০০", type: "repayment", amount: "২০০", y: 230 },
    { block: "b2", text: "আগের ২৬০০", type: "opening_balance", amount: "২৬০০", y: 520 },
    { block: "b2", text: "দিলাম ১০০০", type: "supplier_payment", amount: "১০০০", y: 600 },
    { block: "b3", text: "আগের ২৮০০", type: "opening_balance", amount: "২৮০০", y: 900 },
    { block: "b3", text: "দিলাম ১৫০০", type: "supplier_payment", amount: "১৫০০", y: 980 },
  ],
  heads: [
    { y: 140, text: "করিম" },
    { y: 430, text: "ফ্রেশের কামাল আসছিল" },
    { y: 810, text: "প্রাণের সেলিম আসছিল" },
  ],
  rules: [330, 700],
};

/** The pretend khata for `KARIM_P2`: what each party owed just before that page. */
const KARIM_P2_BOOK: Array<{ party: Omit<KnownParty, "key">; duePoisha: number }> = [
  { party: { id: "kit-karim", kind: "customer", name: "করিম" }, duePoisha: 26_000 },
  { party: { id: "kit-fresh", kind: "supplier", name: "ফ্রেশ" }, duePoisha: 160_000 },
  { party: { id: "kit-pran", kind: "supplier", name: "প্রাণ" }, duePoisha: 280_000 },
];

const grid = (px: number, size: number) => Math.round((px / size) * 1000);

function pageSvg(d: Drawn): string {
  const text = (x: number, y: number, s: string, size = 52) => `<text x="${x}" y="${y}" font-size="${size}">${s}</text>`;
  const rule = (y: number) => `<line x1="140" x2="560" y1="${y}" y2="${y}" stroke="#2b2b6b" stroke-width="3"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#f4eedc"/>`,
    ...Array.from({ length: 17 }, (_, i) => `<line x1="0" x2="${W}" y1="${80 * i + 70}" y2="${80 * i + 70}" stroke="#c9d6e8" stroke-width="2"/>`),
    `<g font-family="Nirmala UI, Vrinda, sans-serif" fill="#23235a">`,
    text(150, d.heads[0]!.y, d.heads[0]!.text, 58),
    text(700, 140, d.date, 44),
    ...d.lines.map((l) => text(170, l.y, l.text)),
    ...d.rules.map(rule),
    ...d.heads.slice(1).map((h) => text(150, h.y, h.text, 58)),
    `</g></svg>`,
  ].join("");
}

function drawnFixture(d: Drawn, source: string): Fixture | null {
  const output = {
    page: { date_text: d.date, ledger_type: "mixed", legibility: "clear" },
    blocks: d.blocks,
    entries: d.lines.map((l, i) => ({
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
      balance: l.balance ?? null,
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
    photo: { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageSvg(d))}`, width: W, height: H, turns: 0 },
    page: { values: pageValuesOf(extraction), version: 0, reviewStartedAt: null },
    rows,
    doubts: [],
    source,
  };
}

export function karimFixture(): Fixture | null {
  return drawnFixture(KARIM_P1, "karim-fixture.ts");
}

export function karimBookFixture(): Fixture | null {
  const fixture = drawnFixture(KARIM_P2, "karim-fixture.ts (T3)");
  if (!fixture) return null;
  const parties = KARIM_P2_BOOK.map(({ party }) => ({ ...party, key: normalizePartyName(party.name)! }));
  return { ...fixture, book: { parties, dues: KARIM_P2_BOOK.map(({ party, duePoisha }) => [party.id, duePoisha]) } };
}
