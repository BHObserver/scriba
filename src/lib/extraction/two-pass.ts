/**
 * U3: a two-pass reading of one page (prompt 6, schema 3).
 *
 * Pass 1 sends the whole page and gets its layout: the blocks and their boxes, no lines. Pass 2
 * cuts each block from the same image, with padding, and reads all the crops at once with prompt
 * 6's rules and the block's first look as a hint. The crops' boxes are mapped back to the page's
 * 0-1000 grid and the readings joined into one schema 3 reading, normalized by the usual parser.
 *
 * Credit rules: at most 1 + MAX_BLOCKS calls, never retried. When the layout can't be cut (no
 * blocks, a block without a box, more than MAX_BLOCKS blocks), the page is read whole in one more
 * call. When any call fails the run fails, because a reading missing a block would look complete.
 * Every call's output, usage and cost is kept, and the run records their sum.
 */
import type { PreparedImage } from "@/lib/images/rotate";
import type { BoundingBox } from "@/lib/ledger/types";
import type { MetaErrorCategory, ModelCallResult, ModelCaller } from "@/lib/meta/transport";
import { estimateCostUsd, type TokenUsage } from "@/lib/pricing";
import {
  type NormalizedExtraction,
  type ParseFailureKind,
  type ReadingInfo,
  normalizeBox,
  normalizeModelOutput,
  parseModelJson,
} from "./parse";
import { BLOCKS_PROMPT_VERSION, TWO_PASS_VERSION, blockUserText, isTwoPassVersion } from "./prompt";
import { type ModelBlock, type ModelLayout, type ModelOutputV3, SCHEMA_V3_VERSION, modelLayoutSchema, modelOutputSchemaV3 } from "./schema";

export const MAX_BLOCKS = 6;
export const MAX_RUN_CALLS = 1 + MAX_BLOCKS;
/** Two steps run one after the other (layout, then blocks or the whole page): both must fit the analyze route's 300 s. */
export const TWO_PASS_CALL_TIMEOUT_MS = 140_000;

/** A block's crop, ready to send, and the part of the page it shows (0-1000 grid, as cut). */
export type BlockCrop = { image: PreparedImage; rect: BoundingBox };
/** Cuts the rects from the page image as the model saw it (EXIF orientation applied). */
export type BlockCropper = (page: PreparedImage, rects: BoundingBox[]) => Promise<BlockCrop[]>;

/** Model calls a run counts against the limits. A two-pass run that left no count (pending, failed) counts as many as it may have made. */
export function callsOfRun(promptVersion: string, calls: number | null): number {
  return isTwoPassVersion(promptVersion) ? (calls ?? MAX_RUN_CALLS) : 1;
}

export type CallLog = {
  pass: "layout" | "block" | "page";
  block?: string;
  providerResponseId: string | null;
  reportedModel: string | null;
  usage: TokenUsage | null;
  estimatedCostUsd: number | null;
  elapsedMs: number;
  status: string | null;
  outputText: string | null;
  error?: MetaErrorCategory;
  message?: string;
};

/** What every call of a run spent, as the run records it. */
export type Spent = {
  providerResponseId: string | null;
  reportedModel: string | null;
  usage: TokenUsage | null;
  estimatedCostUsd: number | null;
  elapsedMs: number;
  /** Every call's output, as JSON: `{ format, calls: CallLog[] }`. */
  rawOutputText: string;
};

export type Reading =
  | ({ ok: true; extraction: NormalizedExtraction } & Spent)
  | { ok: false; kind: "model_failed"; category: MetaErrorCategory; uncertain: boolean; message: string; httpStatus: number | null; spent: Spent }
  | { ok: false; kind: "unusable_output"; category: ParseFailureKind; message: string; spent: Spent }
  | { ok: false; kind: "preparation"; message: string; spent: Spent };

const V3 = { promptVersion: `${BLOCKS_PROMPT_VERSION}+${TWO_PASS_VERSION}`, schemaVersion: SCHEMA_V3_VERSION };

// Padding around a block's box, on the page grid: a share of the block's size, at least PAD_MIN.
const PAD_MIN = 25;
const PAD_SHARE = 0.08;

export function padRect(box: BoundingBox): BoundingBox {
  const px = Math.max(PAD_MIN, (box.x_max - box.x_min) * PAD_SHARE);
  const py = Math.max(PAD_MIN, (box.y_max - box.y_min) * PAD_SHARE);
  const clamp = (n: number) => Math.min(1000, Math.max(0, n));
  return { x_min: clamp(box.x_min - px), y_min: clamp(box.y_min - py), x_max: clamp(box.x_max + px), y_max: clamp(box.y_max + py) };
}

/** A box on a crop's own grid, moved to the page grid. Null when it isn't a usable box on the crop. */
export function mapBoxToPage(box: BoundingBox | null, rect: BoundingBox): BoundingBox | null {
  if (!normalizeBox(box, [], "")) return null;
  const b = box!;
  const clamp = (n: number) => Math.min(1000, Math.max(0, n));
  const x = (v: number) => Math.round(rect.x_min + (clamp(v) / 1000) * (rect.x_max - rect.x_min));
  const y = (v: number) => Math.round(rect.y_min + (clamp(v) / 1000) * (rect.y_max - rect.y_min));
  const out = { x_min: x(b.x_min), y_min: y(b.y_min), x_max: x(b.x_max), y_max: y(b.y_max) };
  return out.x_max > out.x_min && out.y_max > out.y_min ? out : null;
}

const holds = (b: BoundingBox, x: number, y: number) => x >= b.x_min && x <= b.x_max && y >= b.y_min && y <= b.y_max;

type Cut = { block: ModelBlock & { box: BoundingBox }; rect: BoundingBox };
type Plan = { ok: true; cuts: Cut[] } | { ok: false; fallback: NonNullable<ReadingInfo["fallback"]> };

/** Where to cut, or why the layout can't be cut. */
export function planCuts(layout: ModelLayout): Plan {
  if (layout.blocks.length === 0) return { ok: false, fallback: "no_blocks" };
  if (layout.blocks.length > MAX_BLOCKS) return { ok: false, fallback: "too_many_blocks" };
  const cuts: Cut[] = [];
  for (const b of layout.blocks) {
    const box = normalizeBox(b.box, [], b.id);
    if (!box) return { ok: false, fallback: "box_missing" };
    cuts.push({ block: { ...b, box }, rect: padRect(box) });
  }
  return { ok: true, cuts };
}

const LEGIBILITY_ORDER = ["clear", "partly_unclear", "mostly_unclear"] as const;

/**
 * The block readings joined into one schema 3 reading on the page grid. Blocks keep the layout's
 * order and get ids b1, b2, ...; the crop's reading of a block wins over the first look, field by
 * field. A line whose centre lies outside its own block and inside another block came from the
 * padding: that block's own reading has it, so it is left out here.
 */
export function mergeBlockReadings(layout: ModelLayout, cuts: Array<Cut & { reading: ModelOutputV3 }>): ModelOutputV3 {
  const blocks: ModelOutputV3["blocks"] = [];
  const extras: ModelOutputV3["blocks"] = [];
  const entries: ModelOutputV3["entries"] = [];
  const doubts: ModelOutputV3["doubts"] = [];
  const warnings = [...layout.warnings];

  cuts.forEach(({ block, rect, reading }, i) => {
    const id = `b${i + 1}`;
    const others = cuts.filter((_, j) => j !== i).map((c) => c.block.box);
    const main = reading.blocks.find((b) => b.id === "b1") ?? reading.blocks[0];
    const pageIdOf = new Map<string, string>();
    if (main) pageIdOf.set(main.id, id);

    const entryIds = new Map<string, string>();
    const leftOut: string[] = [];
    for (const e of [...reading.entries].sort((a, b) => a.line - b.line)) {
      const box = mapBoxToPage(e.box, rect);
      if (box) {
        const [cx, cy] = [(box.x_min + box.x_max) / 2, (box.y_min + box.y_max) / 2];
        if (!holds(block.box, cx, cy) && others.some((o) => holds(o, cx, cy))) {
          leftOut.push(e.text);
          continue;
        }
      }
      let blockId = pageIdOf.get(e.block);
      const extra = reading.blocks.find((b) => b.id === e.block);
      if (!blockId && extra && extra !== main) {
        blockId = `x${i + 1}-${extras.length + 1}`;
        pageIdOf.set(extra.id, blockId);
        extras.push({ ...extra, id: blockId, box: mapBoxToPage(extra.box, rect) });
      }
      const entryId = `e${entries.length + 1}`;
      entryIds.set(e.id, entryId);
      entries.push({ ...e, id: entryId, line: entries.length + 1, block: blockId ?? id, box });
    }
    for (const d of reading.doubts) {
      const entry = entryIds.get(d.entry);
      if (entry) doubts.push({ ...d, entry });
    }

    blocks.push({
      id,
      kind: main?.kind ?? block.kind,
      title: main?.title ?? block.title,
      party: main?.party ?? block.party,
      person: main?.person ?? block.person,
      date_text: main?.date_text ?? block.date_text,
      box: block.box,
    });
    warnings.push(...reading.warnings.filter((w) => w.trim()).map((w) => `${id}: ${w}`));
    if (leftOut.length > 0) {
      const lines = leftOut.length === 1 ? "a line" : `${leftOut.length} lines`;
      warnings.push(`${id}: left out ${lines} from another block at the edge of its crop (${leftOut.join("; ")}).`);
    }
  });

  // Extra blocks a crop held get the ids after the layout's own.
  const renamed = new Map(extras.map((b, k) => [b.id, `b${cuts.length + k + 1}`]));
  for (const b of extras) blocks.push({ ...b, id: renamed.get(b.id)! });
  for (const e of entries) e.block = renamed.get(e.block) ?? e.block;

  const legibility = [layout.page.legibility, ...cuts.map((c) => c.reading.page.legibility)].reduce((worst, l) =>
    LEGIBILITY_ORDER.indexOf(l) > LEGIBILITY_ORDER.indexOf(worst) ? l : worst,
  );
  return {
    page: {
      date_text: layout.page.date_text ?? cuts.map((c) => c.reading.page.date_text).find((d) => d != null) ?? null,
      ledger_type: layout.page.ledger_type,
      legibility,
    },
    blocks,
    entries,
    doubts,
    warnings,
  };
}

function sumUsage(usages: Array<TokenUsage | null>): TokenUsage | null {
  const known = usages.filter((u): u is TokenUsage => u != null);
  if (known.length === 0) return null;
  return known.reduce((a, u) => ({
    inputTokens: a.inputTokens + u.inputTokens,
    cachedInputTokens: a.cachedInputTokens + u.cachedInputTokens,
    outputTokens: a.outputTokens + u.outputTokens,
    reasoningTokens: a.reasoningTokens + u.reasoningTokens,
    totalTokens: a.totalTokens + u.totalTokens,
  }));
}

export const TWO_PASS_LOG_FORMAT = "scriba-two-pass-1";

function spentOf(calls: CallLog[]): Spent {
  const costs = calls.map((c) => c.estimatedCostUsd).filter((c): c is number => c != null);
  // The layout call, then the block calls side by side, then (on a fallback) the whole page.
  const longest = (pass: CallLog["pass"]) => Math.max(0, ...calls.filter((c) => c.pass === pass).map((c) => c.elapsedMs));
  return {
    providerResponseId: calls[0]?.providerResponseId ?? null,
    reportedModel: calls[0]?.reportedModel ?? null,
    usage: sumUsage(calls.map((c) => c.usage)),
    estimatedCostUsd: costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) * 1e8) / 1e8 : null,
    elapsedMs: longest("layout") + longest("block") + longest("page"),
    rawOutputText: JSON.stringify({ format: TWO_PASS_LOG_FORMAT, calls }),
  };
}

const thrown = (): ModelCallResult => ({
  ok: false,
  category: "unknown",
  httpStatus: null,
  message: "Unexpected error while calling Meta.",
  uncertain: true,
  elapsedMs: 0,
});

export async function readTwoPass(deps: { callModel: ModelCaller; cropBlocks: BlockCropper; modelId: string }, page: PreparedImage): Promise<Reading> {
  const calls: CallLog[] = [];
  const log = (pass: CallLog["pass"], r: ModelCallResult, block?: string) =>
    calls.push(
      r.ok
        ? {
            pass,
            ...(block ? { block } : {}),
            providerResponseId: r.providerResponseId,
            reportedModel: r.reportedModel,
            usage: r.usage,
            estimatedCostUsd: estimateCostUsd(deps.modelId, r.usage),
            elapsedMs: r.elapsedMs,
            status: r.summary.status,
            outputText: r.summary.outputText,
          }
        : {
            pass,
            ...(block ? { block } : {}),
            providerResponseId: null,
            reportedModel: null,
            usage: null,
            estimatedCostUsd: null,
            elapsedMs: r.elapsedMs,
            status: null,
            outputText: null,
            error: r.category,
            message: r.message,
          },
    );
  const call = (input: Parameters<ModelCaller>[0]) => deps.callModel(input).catch(thrown);
  const failed = (r: Extract<ModelCallResult, { ok: false }>): Reading => ({
    ok: false,
    kind: "model_failed",
    category: r.category,
    uncertain: r.uncertain,
    message: r.message,
    httpStatus: r.httpStatus,
    spent: spentOf(calls),
  });
  const unusable = (p: { kind: ParseFailureKind; detail: string }, where?: string): Reading => ({
    ok: false,
    kind: "unusable_output",
    category: p.kind,
    message: where ? `${where}: ${p.detail}` : p.detail,
    spent: spentOf(calls),
  });
  const done = (output: ModelOutputV3, reading: ReadingInfo, warnings: string[] = []): Reading => {
    const extraction = normalizeModelOutput(output, V3);
    return { ok: true, extraction: { ...extraction, warnings: [...extraction.warnings, ...warnings], reading }, ...spentOf(calls) };
  };

  const first = await call({ ...page, pass: { kind: "layout" } });
  log("layout", first);
  if (!first.ok) return failed(first);
  const layout = parseModelJson(first.summary, modelLayoutSchema);
  if (!layout.ok) return unusable(layout, "Layout step");

  const plan = planCuts(layout.data);
  if (!plan.ok) {
    const whole = await call({ ...page });
    log("page", whole);
    if (!whole.ok) return failed(whole);
    const parsed = parseModelJson(whole.summary, modelOutputSchemaV3);
    if (!parsed.ok) return unusable(parsed);
    const why = { no_blocks: "found no blocks", box_missing: "gave a block no box", too_many_blocks: `found more than ${MAX_BLOCKS} blocks` }[plan.fallback];
    return done(parsed.data, { passes: 2, calls: calls.length, fallback: plan.fallback, crops: [] }, [`The layout step ${why}, so the page was read whole.`]);
  }

  let crops: BlockCrop[];
  try {
    crops = await deps.cropBlocks(page, plan.cuts.map((c) => c.rect));
    if (crops.length !== plan.cuts.length) throw new Error("crop count");
  } catch {
    return { ok: false, kind: "preparation", message: "The blocks could not be cut from the photograph. No block was sent to Meta.", spent: spentOf(calls) };
  }

  const results = await Promise.all(crops.map((c, i) => call({ ...c.image, pass: { kind: "block", hint: blockUserText(plan.cuts[i]!.block) } })));
  results.forEach((r, i) => log("block", r, `b${i + 1}`));
  // A call that may have been billed decides the run's status before one that surely wasn't.
  const failures = results.filter((r): r is Extract<ModelCallResult, { ok: false }> => !r.ok);
  const failure = failures.find((r) => r.uncertain) ?? failures[0];
  if (failure) return failed(failure);

  const readings: ModelOutputV3[] = [];
  for (const [i, r] of results.filter((r): r is Extract<ModelCallResult, { ok: true }> => r.ok).entries()) {
    const parsed = parseModelJson(r.summary, modelOutputSchemaV3);
    if (!parsed.ok) return unusable(parsed, `Block b${i + 1}`);
    readings.push(parsed.data);
  }

  // Crops are mapped back by the rect actually cut, which pixel rounding may have moved slightly.
  const cuts = plan.cuts.map((c, i) => ({ ...c, rect: crops[i]!.rect, reading: readings[i]! }));
  const merged = mergeBlockReadings(layout.data, cuts);
  return done(merged, { passes: 2, calls: calls.length, fallback: null, crops: cuts.map((c, i) => ({ block: `b${i + 1}`, rect: c.rect })) });
}
