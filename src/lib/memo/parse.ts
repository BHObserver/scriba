/**
 * U4: a company memo's reading, validated and normalized, with code's checks of its own sums.
 *
 * Nothing is invented: a figure that doesn't read as a number stays null beside its text, and the
 * memo's arithmetic (qty × rate per line, lines against the written subtotal and total) is worked
 * out here, never taken from the model. A memo only proposes prices; the shopkeeper confirms them.
 */
import { type ModelResponseSummary, type ParseFailureKind, normalizeBox, parseModelJson } from "@/lib/extraction/parse";
import type { LEGIBILITY } from "@/lib/extraction/schema";
import type { BoundingBox } from "@/lib/ledger/types";
import { multiplyQuantityByRate, parseMoney, parseQuantity, parseRate } from "@/lib/numerals";
import { MEMO_PROMPT_VERSION } from "./prompt";
import { MEMO_SCHEMA_VERSION, type MemoLineField, type MemoOutput, memoOutputSchema } from "./schema";

export type MemoLine = {
  /** "m1", "m2"… in the memo's order. */
  id: string;
  /** The row as printed. */
  text: string;
  item: string | null;
  quantityText: string | null;
  unit: string | null;
  rateText: string | null;
  amountText: string | null;
  crossedOut: boolean;
  /** Fields the model could not read with confidence. */
  review: MemoLineField[];
  box: BoundingBox | null;
  /** Derived from the text by code; null when absent or unreadable. */
  quantityMilli: number | null;
  ratePoisha: number | null;
  amountPoisha: number | null;
  /** qty × rate comes to the amount (to the taka). Null when a figure is missing or unreadable. */
  multiplies: boolean | null;
};

/** A figure from the memo's totals: as written, and in poisha when it reads as a number. */
export type MemoFigure = { text: string | null; poisha: number | null };

export const MEMO_TOTALS = ["subtotal", "discount", "total", "previousDue", "paid", "due"] as const;
export type MemoTotal = (typeof MEMO_TOTALS)[number];

export type MemoCheck = {
  /** The amounts of the lines that aren't crossed out, added up; null when one doesn't read as a number or none is priced. */
  linesSum: number | null;
  /** What the goods come to: the written total, else the subtotal (or the lines' sum) less the discount. */
  total: number | null;
  /** The lines agree with what is written: subtotal = their sum, total = their sum less the discount. Null: nothing to compare. */
  agrees: boolean | null;
};

export type NormalizedMemo = {
  schemaVersion: string;
  promptVersion: string;
  company: string | null;
  person: string | null;
  number: string | null;
  dateText: string | null;
  legibility: (typeof LEGIBILITY)[number];
  lines: MemoLine[];
  totals: Record<MemoTotal, MemoFigure>;
  check: MemoCheck;
  warnings: string[];
};

export type MemoParseResult = { ok: true; memo: NormalizedMemo } | { ok: false; kind: ParseFailureKind; detail: string };

const blankToNull = (s: string | null): string | null => (s != null && s.trim().length > 0 ? s.trim() : null);
const value = (p: { ok: true; value: number } | { ok: false }): number | null => (p.ok ? p.value : null);

/** A memo prints a discount as "-50", "(50)" or "Less 50": the figure is what is taken off. */
function discountText(text: string | null): string | null {
  const t = blankToNull(text);
  return t ? t.replace(/^\(\s*(.*?)\s*\)$/, "$1").replace(/^[-−–]\s*/, "") : null;
}

function figure(text: string | null, read: (t: string) => number | null = (t) => value(parseMoney(t))): MemoFigure {
  const t = blankToNull(text);
  return { text: t, poisha: t ? read(t) : null };
}

/** Within a taka: printed memos round a line's amount to the taka. */
const ROUNDING = 100;

function lineOf(raw: MemoOutput["lines"][number], id: string, warnings: string[]): MemoLine {
  const quantityText = blankToNull(raw.qty);
  const rateText = blankToNull(raw.rate);
  const amountText = blankToNull(raw.amount);
  const quantityMilli = value(parseQuantity(quantityText));
  const ratePoisha = value(parseRate(rateText));
  const amountPoisha = value(parseMoney(amountText));
  if (amountText && amountPoisha == null) warnings.push(`${id}: the amount "${amountText}" doesn't read as a number.`);
  let multiplies: boolean | null = null;
  if (quantityMilli != null && ratePoisha != null && amountPoisha != null) {
    multiplies = Math.abs(multiplyQuantityByRate(quantityMilli, ratePoisha).poisha - amountPoisha) < ROUNDING;
  }
  return {
    id,
    text: raw.text.trim(),
    item: blankToNull(raw.item),
    quantityText,
    unit: blankToNull(raw.unit),
    rateText,
    amountText,
    crossedOut: raw.crossed_out,
    review: [...new Set(raw.review)],
    box: normalizeBox(raw.box, warnings, id),
    quantityMilli,
    ratePoisha,
    amountPoisha,
    multiplies,
  };
}

/** The memo's own sums, worked out by code. */
export function checkMemo(lines: readonly MemoLine[], totals: Record<MemoTotal, MemoFigure>): MemoCheck {
  const priced = lines.filter((l) => !l.crossedOut && l.amountText != null);
  const linesSum = priced.length > 0 && priced.every((l) => l.amountPoisha != null) ? priced.reduce((s, l) => s + l.amountPoisha!, 0) : null;
  const { subtotal, discount, total } = totals;
  // A discount that is written but doesn't read as a number (a percentage) leaves the sum unknown.
  const off = discount.text == null ? 0 : discount.poisha;
  // The subtotal is the lines' sum; the total is the subtotal (or the lines) less the discount.
  const subtotalAgrees = subtotal.text == null ? null : linesSum != null && subtotal.poisha === linesSum;
  const base = subtotal.text != null ? subtotal.poisha : linesSum;
  const worked = base != null && off != null ? base - off : null;
  const totalAgrees = total.text == null || worked == null ? null : total.poisha === worked;
  const both = [subtotalAgrees, totalAgrees];
  const agrees = both.includes(false) ? false : both.includes(true) ? true : null;
  return { linesSum, total: total.text != null ? total.poisha : worked, agrees };
}

export function normalizeMemoOutput(out: MemoOutput): NormalizedMemo {
  const warnings = [...out.warnings];
  const seen = new Set<string>();
  const lines = out.lines.map((raw, i) => {
    let id = raw.id.trim() || `m${i + 1}`;
    if (seen.has(id)) {
      let n = out.lines.length + 1;
      while (seen.has(`m${n}`)) n++;
      id = `m${n}`;
    }
    seen.add(id);
    return lineOf(raw, id, warnings);
  });
  const t = out.totals;
  const totals: Record<MemoTotal, MemoFigure> = {
    subtotal: figure(t.subtotal),
    discount: figure(discountText(t.discount)),
    total: figure(t.total),
    previousDue: figure(t.previous_due),
    paid: figure(t.paid),
    due: figure(t.due),
  };
  return {
    schemaVersion: MEMO_SCHEMA_VERSION,
    promptVersion: MEMO_PROMPT_VERSION,
    company: blankToNull(out.memo.company),
    person: blankToNull(out.memo.person),
    number: blankToNull(out.memo.number),
    dateText: blankToNull(out.memo.date_text),
    legibility: out.memo.legibility,
    lines,
    totals,
    check: checkMemo(lines, totals),
    warnings,
  };
}

export function parseMemoResponse(response: ModelResponseSummary): MemoParseResult {
  const parsed = parseModelJson(response, memoOutputSchema);
  return parsed.ok ? { ok: true, memo: normalizeMemoOutput(parsed.data) } : parsed;
}

/** A stored memo reading (a run's `result`), or null when it isn't one. */
export function storedMemo(result: unknown): NormalizedMemo | null {
  const r = result as Partial<NormalizedMemo> | null;
  return r && r.schemaVersion === MEMO_SCHEMA_VERSION && Array.isArray(r.lines) && r.totals && r.check ? (r as NormalizedMemo) : null;
}
