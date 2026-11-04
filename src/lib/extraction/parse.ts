/**
 * Turn the model's text output into a validated, normalized extraction.
 *
 * Nothing is invented here: unreadable numbers stay null next to their source
 * text, invalid coordinates are dropped (never guessed), and a truncated or
 * malformed response is reported as a failure, with the raw text preserved by the
 * caller for diagnosis.
 */
import { blockPartyKind, cashByDefault, splitPartyPerson } from "@/lib/ledger/blocks";
import {
  type BlockValues,
  type BoundingBox,
  type EntryValues,
  type LedgerType,
  type PageValues,
  type ReviewableField,
  TRANSACTION_TYPES,
} from "@/lib/ledger/types";
import type { z } from "zod";
import { normalizeDate, parseMoney, parseQuantity, parseRate } from "@/lib/numerals";
import { FIELD_TO_VALUE_KEY } from "@/lib/review/values";
import { type ExtractionProfile, getExtractionProfile } from "./prompt";
import {
  type ModelBlock,
  type ModelEntry,
  type ModelOutput,
  type ModelOutputV3,
  SCHEMA_V3_VERSION,
  modelOutputSchema,
  modelOutputSchemaV3,
} from "./schema";

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

/** A block as read: its editable values and its box on the 0-1000 grid. */
export type NormalizedBlock = BlockValues & { box: BoundingBox | null };

/**
 * A reading the model was unsure of, with two or three candidates. The entry's current value
 * comes first; every option is a valid value for its field.
 */
export type NormalizedDoubt = { entryId: string; field: ReviewableField; options: string[]; note: string | null };

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
  /** Schema 3 only (absent on earlier readings and on runs stored before it). */
  blocks?: NormalizedBlock[];
  doubts?: NormalizedDoubt[];
  /** Warnings from the model followed by warnings raised while normalizing. */
  warnings: string[];
  /** U3: how a two-pass reading was made. Absent on a reading made in one call. */
  reading?: ReadingInfo;
};

export type ReadingInfo = {
  passes: 2;
  /** Model calls this reading took: 1 + one per block, or 2 when it fell back to the whole page. */
  calls: number;
  /** Why the blocks weren't cut, when the page was read whole after the layout step. */
  fallback: null | "no_blocks" | "box_missing" | "too_many_blocks";
  /** Where each block was cut from, on the page's 0-1000 grid. */
  crops: Array<{ block: string; rect: BoundingBox }>;
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

export function normalizeBox(box: ModelEntry["box"], warnings: string[], id: string): BoundingBox | null {
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

const MAX_OPTIONS = 3;

function normalizeBlocks(blocks: ModelBlock[], warnings: string[]): NormalizedBlock[] {
  const seen = new Set<string>();
  return blocks.map((b, index) => {
    let id = b.id.trim() || `b${index + 1}`;
    if (seen.has(id)) {
      let n = blocks.length + 1;
      while (seen.has(`b${n}`)) n++;
      warnings.push(`Duplicate block id "${id}" was renamed to "b${n}"; its lines stay with the first block of that id.`);
      id = `b${n}`;
    }
    seen.add(id);
    let party = blankToNull(b.party);
    let person = blankToNull(b.person);
    // An account or a visit is about its heading's name when the model left party empty.
    const title = blankToNull(b.title);
    if (!party && title && blockPartyKind(b.kind)) party = title;
    if (party && !person) ({ party, person } = splitPartyPerson(party));
    return {
      id,
      kind: b.kind,
      title,
      party,
      person,
      dateText: blankToNull(b.date_text),
      box: normalizeBox(b.box, warnings, id),
    };
  });
}

/** True when `text` is a value the field can hold, and its comparable form. */
function optionValue(field: ReviewableField, text: string): string | null {
  switch (field) {
    case "qty": {
      const p = parseQuantity(text);
      return p.ok ? `q${p.value}` : null;
    }
    case "rate": {
      const p = parseRate(text);
      return p.ok ? `r${p.value}` : null;
    }
    case "amount":
    case "balance": {
      const p = parseMoney(text);
      return p.ok ? `m${p.value}` : null;
    }
    case "type":
      return (TRANSACTION_TYPES as readonly string[]).includes(text) ? text : null;
    default:
      return text.length <= 200 ? text.normalize("NFC") : null;
  }
}

function normalizeDoubts(doubts: ModelOutputV3["doubts"], entries: NormalizedEntry[], idOf: Map<string, string>, warnings: string[]) {
  const byId = new Map(entries.map((e) => [e.candidateId, e]));
  const out: NormalizedDoubt[] = [];
  const done = new Set<string>();
  for (const d of doubts) {
    const entry = byId.get(idOf.get(d.entry.trim()) ?? "");
    if (!entry || done.has(`${entry.candidateId}|${d.field}`)) continue;
    const current = entry.values[FIELD_TO_VALUE_KEY[d.field]];
    const candidates = [...(typeof current === "string" ? [current] : []), ...d.options.map((o) => o.trim())];
    const options: string[] = [];
    const values = new Set<string>();
    for (const o of candidates) {
      const value = o.length > 0 ? optionValue(d.field, o) : null;
      if (value == null || values.has(value)) continue;
      values.add(value);
      options.push(o);
      if (options.length === MAX_OPTIONS) break;
    }
    if (options.length < 2) {
      warnings.push(`A doubt about ${d.field} on ${entry.candidateId} was dropped: it had fewer than two valid readings.`);
      continue;
    }
    done.add(`${entry.candidateId}|${d.field}`);
    if (!entry.reviewFields.includes(d.field)) entry.reviewFields.push(d.field);
    out.push({ entryId: entry.candidateId, field: d.field, options, note: blankToNull(d.note) });
  }
  return out;
}

type AnyModelOutput = ModelOutput | ModelOutputV3;
const isV3 = (o: AnyModelOutput): o is ModelOutputV3 => "blocks" in o;

export function normalizeModelOutput(
  output: AnyModelOutput,
  profile: Pick<ExtractionProfile, "schemaVersion" | "promptVersion"> = getExtractionProfile(),
): NormalizedExtraction {
  const warnings = [...output.warnings.filter((w) => w.trim().length > 0)];
  const blocks = isV3(output) ? normalizeBlocks(output.blocks, warnings) : null;
  const blockIds = new Set(blocks?.map((b) => b.id));
  const idOf = new Map<string, string>();
  const orphans: string[] = [];

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
    if (!idOf.has(e.id.trim())) idOf.set(e.id.trim(), id);
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
    if (blocks) {
      const block = "block" in e && typeof e.block === "string" ? e.block.trim() : "";
      if (blockIds.has(block)) values.block = block;
      else orphans.push(id);
    }
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

  // A line whose block the reading did not describe goes to one "other" block, never dropped.
  if (blocks && orphans.length > 0) {
    let n = blocks.length + 1;
    while (blockIds.has(`b${n}`)) n++;
    const id = `b${n}`;
    blocks.push({ id, kind: "other", title: null, party: null, person: null, dateText: null, box: null });
    for (const e of entries) if (orphans.includes(e.candidateId)) e.values.block = id;
    warnings.push(`${orphans.join(", ")} named no block of this reading, so ${orphans.length === 1 ? "it was" : "they were"} put in block ${id} ("other").`);
  }
  let doubts = isV3(output) ? normalizeDoubts(output.doubts, entries, idOf, warnings) : null;

  // The shop's rule (F2): in the day's sales, no বাকি written means a cash sale. The model leaves
  // the kind unknown there, as it is told not to guess credit; code applies the rule, so nothing
  // asks "cash or credit?". Any doubt about the kind goes with it.
  if (blocks) {
    const kindOf = new Map(blocks.map((b) => [b.id, b.kind]));
    const cash = new Set<string>();
    for (const e of entries) {
      const kind = e.values.block ? kindOf.get(e.values.block) : undefined;
      if (!kind || !cashByDefault(kind, e.values)) continue;
      e.values.type = "cash_sale";
      e.reviewFields = e.reviewFields.filter((f) => f !== "type");
      cash.add(e.candidateId);
    }
    if (doubts && cash.size > 0) doubts = doubts.filter((d) => d.field !== "type" || !cash.has(d.entryId));
  }

  const single = (type: string) => {
    const matches = entries.filter((e) => e.values.type === type && !e.values.crossedOut);
    return matches.length === 1 ? matches[0]!.numbers.amountPoisha : null;
  };

  const dateText = blankToNull(output.page.date_text);
  const { schemaVersion, promptVersion } = profile;
  return {
    schemaVersion,
    promptVersion,
    page: {
      dateText,
      dateIso: normalizeDate(dateText),
      ledgerType: output.page.ledger_type,
      accountName: "account_name" in output.page ? blankToNull(output.page.account_name) : null,
      legibility: output.page.legibility,
      openingBalancePoisha: single("opening_balance"),
      closingBalancePoisha: single("closing_balance"),
      writtenTotals: entries
        .filter((e) => e.values.type === "subtotal")
        .map((e) => ({ candidateId: e.candidateId, amountPoisha: e.numbers.amountPoisha })),
    },
    entries,
    ...(blocks ? { blocks, doubts: doubts ?? [] } : {}),
    warnings,
  };
}

/** The page values review starts from: the page fields, and the blocks without their boxes. */
export function pageValuesOf(extraction: NormalizedExtraction): PageValues {
  const { dateText, ledgerType, accountName } = extraction.page;
  if (!extraction.blocks) return { dateText, ledgerType, accountName };
  const blocks = extraction.blocks.map((b) => ({ id: b.id, kind: b.kind, title: b.title, party: b.party, person: b.person, dateText: b.dateText }));
  return { dateText, ledgerType, accountName, blocks };
}

/** Strip a Markdown code fence if a model wraps its JSON in one. */
function unfence(text: string): string {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1]! : text.trim();
}

export function parseModelResponse(
  response: ModelResponseSummary,
  profile: Pick<ExtractionProfile, "schemaVersion" | "promptVersion"> = getExtractionProfile(),
): ParseResult {
  const parsed: ReturnType<typeof parseModelJson<AnyModelOutput>> =
    profile.schemaVersion === SCHEMA_V3_VERSION ? parseModelJson(response, modelOutputSchemaV3) : parseModelJson(response, modelOutputSchema);
  return parsed.ok ? { ok: true, extraction: normalizeModelOutput(parsed.data, profile) } : parsed;
}

/** The response's JSON, checked against `schema` but not normalized yet. */
export function parseModelJson<T>(
  response: ModelResponseSummary,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; kind: ParseFailureKind; detail: string } {
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
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, kind: "schema_mismatch", detail: `The response did not match the schema: ${issues}` };
  }
  return { ok: true, data: parsed.data };
}
