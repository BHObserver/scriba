/**
 * Turn the model's text output into a validated, normalized extraction.
 *
 * Nothing is invented here: unreadable numbers stay null next to their source
 * text, invalid coordinates are dropped (never guessed), and a truncated or
 * malformed response is reported as a failure, with the raw text preserved by the
 * caller for diagnosis.
 */
import type { BoundingBox, EntryValues, LedgerType, ReviewableField } from "@/lib/ledger/types";
import { normalizeDate, parseMoney, parseQuantity, parseRate } from "@/lib/numerals";
import { PROMPT_VERSION } from "./prompt";
import { type ModelEntry, type ModelOutput, SCHEMA_VERSION, modelOutputSchema } from "./schema";

export type NormalizedEntry = {
  candidateId: string;
  line: number;
  values: EntryValues;
  reviewFields: ReviewableField[];
  uncertaintyReason: string | null;
  bbox: BoundingBox | null;
  /** Derived from the written text. Null when absent or unreadable. */
  numbers: {
    quantityMilli: number | null;
    ratePoisha: number | null;
    amountPoisha: number | null;
    balancePoisha: number | null;
  };
};

export type NormalizedExtraction = {
  schemaVersion: string;
  promptVersion: string;
  page: {
    dateText: string | null;
    dateIso: string | null;
    ledgerType: LedgerType;
    accountName: string | null;
    legibility: ModelOutput["page"]["legibility"];
    /** Only when an opening/closing balance line is explicitly written. */
    openingBalancePoisha: number | null;
    closingBalancePoisha: number | null;
    writtenTotals: Array<{ candidateId: string; amountPoisha: number | null }>;
  };
  entries: NormalizedEntry[];
  /** Warnings from the model followed by warnings raised while normalizing. */
  warnings: string[];
};

export type ParseFailureKind = "incomplete" | "refusal" | "empty" | "invalid_json" | "schema_mismatch";

export type ParseResult =
  | { ok: true; extraction: NormalizedExtraction }
  | { ok: false; kind: ParseFailureKind; detail: string };

export type ModelResponseSummary = {
  status: string | null;
  incompleteReason: string | null;
  outputText: string | null;
  refusal: string | null;
};

const BOX_MAX = 1000;
const BOX_TOLERANCE = 5; // the docs note values slightly outside the grid, e.g. 1001

function normalizeBox(box: ModelEntry["box"], warnings: string[], id: string): BoundingBox | null {
  if (!box) return null;
  const vals = [box.x_min, box.y_min, box.x_max, box.y_max];
  if (vals.some((v) => !Number.isFinite(v) || v < -BOX_TOLERANCE || v > BOX_MAX + BOX_TOLERANCE)) {
    warnings.push(`Discarded out-of-range coordinates for ${id}.`);
    return null;
  }
  const clamp = (v: number) => Math.min(BOX_MAX, Math.max(0, Math.round(v)));
  const b = { x_min: clamp(box.x_min), y_min: clamp(box.y_min), x_max: clamp(box.x_max), y_max: clamp(box.y_max) };
  if (b.x_max <= b.x_min || b.y_max <= b.y_min) {
    warnings.push(`Discarded empty or inverted coordinates for ${id}.`);
    return null;
  }
  return b;
}

const blankToNull = (s: string | null): string | null => (s != null && s.trim().length > 0 ? s.trim() : null);

function okValue(p: ReturnType<typeof parseMoney>): number | null {
  return p.ok ? p.value : null;
}

export function normalizeModelOutput(output: ModelOutput): NormalizedExtraction {
  const warnings = [...output.warnings.filter((w) => w.trim().length > 0)];

  // Stable order by the model's line number, then by response order.
  const ordered = output.entries.map((e, i) => ({ e, i })).sort((a, b) => a.e.line - b.e.line || a.i - b.i);

  const seen = new Set<string>();
  let renumbered = false;
  const entries: NormalizedEntry[] = ordered.map(({ e }, index) => {
    let id = e.id.trim() || `e${index + 1}`;
    if (seen.has(id)) {
      const replacement = `e${index + 1}_${seen.size}`;
      warnings.push(`Duplicate entry id "${id}" was renamed to "${replacement}".`);
      id = replacement;
    }
    seen.add(id);
    const line = index + 1;
    if (e.line !== line) renumbered = true;

    // An opening or closing balance line has one figure, and the checks read it from
    // amount. The model sometimes files that figure under balance instead; move it so
    // the checks can see it. The written text itself is unchanged.
    let amount = e.amount;
    let balance = e.balance;
    if ((e.type === "opening_balance" || e.type === "closing_balance") && blankToNull(amount) == null && blankToNull(balance) != null) {
      amount = balance;
      balance = null;
    }

    const values: EntryValues = {
      sourceText: e.text.trim(),
      type: e.type,
      customer: blankToNull(e.customer),
      item: blankToNull(e.item),
      quantityText: blankToNull(e.qty),
      unit: blankToNull(e.unit),
      rateText: blankToNull(e.rate),
      amountText: blankToNull(amount),
      balanceText: blankToNull(balance),
      crossedOut: e.crossed_out,
    };
    return {
      candidateId: id,
      line,
      values,
      reviewFields: [...new Set(e.review)],
      uncertaintyReason: blankToNull(e.note),
      bbox: normalizeBox(e.box, warnings, id),
      numbers: {
        quantityMilli: values.quantityText ? okValue(parseQuantity(values.quantityText)) : null,
        ratePoisha: values.rateText ? okValue(parseRate(values.rateText)) : null,
        amountPoisha: values.amountText ? okValue(parseMoney(values.amountText)) : null,
        balancePoisha: values.balanceText ? okValue(parseMoney(values.balanceText)) : null,
      },
    };
  });
  if (renumbered) warnings.push("Line numbers were renumbered to follow the reading order.");

  const single = (type: string) => {
    const matches = entries.filter((e) => e.values.type === type && !e.values.crossedOut);
    return matches.length === 1 ? matches[0]!.numbers.amountPoisha : null;
  };

  const dateText = blankToNull(output.page.date_text);
  return {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    page: {
      dateText,
      dateIso: normalizeDate(dateText),
      ledgerType: output.page.ledger_type,
      accountName: blankToNull(output.page.account_name),
      legibility: output.page.legibility,
      openingBalancePoisha: single("opening_balance"),
      closingBalancePoisha: single("closing_balance"),
      writtenTotals: entries
        .filter((e) => e.values.type === "subtotal")
        .map((e) => ({ candidateId: e.candidateId, amountPoisha: e.numbers.amountPoisha })),
    },
    entries,
    warnings,
  };
}

/** Strip a Markdown code fence if a model wraps its JSON in one. */
function unfence(text: string): string {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1]! : text.trim();
}

export function parseModelResponse(response: ModelResponseSummary): ParseResult {
  if (response.refusal) return { ok: false, kind: "refusal", detail: response.refusal.slice(0, 300) };
  if (response.status === "incomplete") {
    return {
      ok: false,
      kind: "incomplete",
      detail: `The response stopped early (${response.incompleteReason ?? "reason not given"}). Entries may be missing.`,
    };
  }
  if (!response.outputText || response.outputText.trim().length === 0) {
    return { ok: false, kind: "empty", detail: "The model returned no text." };
  }
  let json: unknown;
  try {
    json = JSON.parse(unfence(response.outputText));
  } catch {
    return { ok: false, kind: "invalid_json", detail: "The response was not valid JSON (it may be truncated)." };
  }
  const parsed = modelOutputSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, kind: "schema_mismatch", detail: `The response did not match the schema: ${issues}` };
  }
  return { ok: true, extraction: normalizeModelOutput(parsed.data) };
}
