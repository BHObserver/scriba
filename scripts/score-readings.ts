/**
 * U3: score saved readings against one page's ground truth, offline. No call is made.
 * For the single-pass vs two-pass comparison: fields and amounts read right, lines missing or
 * extra, how the lines are grouped into blocks, and what each reading cost.
 *
 *   bun scripts/score-readings.ts private-test-data/ground-truth/V01.json private-test-data/responses/V01.jpg.*.private.json
 *   bun scripts/score-readings.ts --align=order <truth> <responses>...   # strict, as the app's evaluations
 *   bun scripts/score-readings.ts --truths=private-test-data/ground-truth private-test-data/responses/P?.jpg.*
 *                                     # T6: each file's truth by its name (P3.jpg.… → P3.json), then a summary per prompt
 *
 * Reads the files live:extract writes (one call, or `--two-pass`). Block scores need the
 * ground truth's `_blocks` (informal: kind and line numbers per block). Lines are paired by
 * content (alignByContent) unless `--align=order`, so a merged line costs only its own lines.
 * Unflagged (T6): amounts read wrong that nothing on screen marks: no doubt, no unsure field, no
 * failing check. Digits (T6): each digit of every number in the truth, right when the reading's number has
 * as many digits and that one agrees; a number read with a digit dropped or added counts none.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { alignByContent } from "@/lib/evaluation/align";
import { type TruthBlocks, groupingAgreement, kindsFound } from "@/lib/evaluation/blocks";
import { type GroundTruth, groundTruthSchema } from "@/lib/evaluation/ground-truth";
import { type FieldComparison, type LinePair, evaluateSample, formatRatio } from "@/lib/evaluation/metrics";
import { type ModelResponseSummary, type NormalizedExtraction, parseModelResponse } from "@/lib/extraction/parse";
import { type TokenUsage, estimateCostUsd } from "@/lib/pricing";

const args = process.argv.slice(2);
const byOrder = args.includes("--align=order");
const truthsDir = args.find((a) => a.startsWith("--truths="))?.slice("--truths=".length) ?? null;
const paths = args.filter((a) => !a.startsWith("--"));
const [truthPath, ...rest] = truthsDir ? [null, ...paths] : paths;
const files = rest as string[];
if ((!truthsDir && !truthPath) || files.length === 0) {
  console.error("Usage: bun scripts/score-readings.ts [--align=order] (<ground-truth.json> | --truths=<dir>) <response.private.json>...");
  process.exit(2);
}

type Truth = { truth: GroundTruth; blocks: TruthBlocks | null };
const truths = new Map<string, Truth>();
function truthAt(path: string): Truth {
  let t = truths.get(path);
  if (!t) {
    const json = JSON.parse(readFileSync(path, "utf8")) as { _blocks?: TruthBlocks };
    t = { truth: groundTruthSchema.parse(json), blocks: json._blocks ?? null };
    truths.set(path, t);
  }
  return t;
}
const truthFor = (file: string) => truthAt(truthsDir ? join(truthsDir, `${basename(file).split(".")[0]}.json`) : truthPath!);

type Saved = {
  model: string;
  promptVersion: string;
  schemaVersion: string;
  result?: { ok: true; summary: ModelResponseSummary; usage: TokenUsage | null; elapsedMs: number } | { ok: false };
  twoPass?: { calls: unknown[]; estimatedCostUsd: number | null; elapsedMs: number; extraction?: NormalizedExtraction };
};

function readingOf(saved: Saved): { x: NormalizedExtraction; calls: number; cost: number | null; ms: number } | string {
  if (saved.twoPass) {
    if (!saved.twoPass.extraction) return "two-pass run failed";
    return { x: saved.twoPass.extraction, calls: saved.twoPass.calls.length, cost: saved.twoPass.estimatedCostUsd, ms: saved.twoPass.elapsedMs };
  }
  if (!saved.result?.ok) return "call failed";
  const parsed = parseModelResponse(saved.result.summary, { promptVersion: saved.promptVersion, schemaVersion: saved.schemaVersion });
  if (!parsed.ok) return `unusable output: ${parsed.kind}`;
  return { x: parsed.extraction, calls: 1, cost: estimateCostUsd(saved.model, saved.result.usage), ms: saved.result.elapsedMs };
}

/** Line 1 with line 1, and so on: evaluateSample's own alignment, spelled out for the grouping score. */
function pairsByOrder(truth: GroundTruth, readLines: number[]): LinePair[] {
  const gt = truth.entries.map((g) => g.line).sort((a, b) => a - b);
  const read = [...readLines].sort((a, b) => a - b);
  return Array.from({ length: Math.max(gt.length, read.length) }, (_, i) => ({ gtLine: gt[i] ?? null, line: read[i] ?? null }));
}

// Numbers are compared in poisha (money) and thousandths (quantities).
const NUMBER_FIELDS = new Set(["qty", "rate", "amount", "balance"]);
const shown = (field: string, v: string | number | null) => (typeof v !== "number" ? (v ?? "—") : field === "qty" ? v / 1000 : v / 100);
const digitsOf = (field: string, v: number) => String(shown(field, v)).replace(/[^0-9]/g, "");

/** Digits of the truth's numbers read right, as described at the top. */
function digitScore(comparisons: readonly FieldComparison[]): { numerator: number; denominator: number } {
  let right = 0;
  let all = 0;
  for (const x of comparisons) {
    if (!NUMBER_FIELDS.has(x.field) || x.gtLine == null || typeof x.expected !== "number") continue;
    const truth = digitsOf(x.field, x.expected);
    const read = typeof x.observed === "number" ? digitsOf(x.field, x.observed) : "";
    all += truth.length;
    if (read.length === truth.length) right += [...truth].filter((d, i) => read[i] === d).length;
  }
  return { numerator: right, denominator: all };
}

type Row = { fields: [number, number]; amounts: [number, number]; digits: [number, number]; unflagged: number; doubts: number; missing: number; extra: number; cost: number; ms: number; runs: number };
const summary = new Map<string, Row>();
const add = (a: [number, number], n: number, d: number): [number, number] => [a[0] + n, a[1] + d];

if (!truthsDir) {
  const t = truthFor(files[0]!);
  console.log(`Ground truth ${t.truth.sample_id}: ${t.truth.entries.length} lines${t.blocks ? `, ${t.blocks.length} blocks` : ", no _blocks (block scores skipped)"}, lines paired by ${byOrder ? "order" : "content"}\n`);
}
for (const file of files) {
  const { truth, blocks: truthBlocks } = truthFor(file);
  const saved = JSON.parse(readFileSync(file, "utf8")) as Saved;
  const r = readingOf(saved);
  console.log(`${basename(file)}  ${saved.promptVersion}${truthsDir ? `  (truth ${truth.sample_id})` : ""}`);
  if (typeof r === "string") {
    console.log(`  skipped: ${r}\n`);
    continue;
  }
  const pairs = byOrder ? pairsByOrder(truth, r.x.entries.map((x) => x.line)) : alignByContent(truth.entries, r.x.entries);
  const e = evaluateSample(truth, { ledgerType: r.x.page.ledgerType, entries: r.x.entries }, pairs);
  const c = e.counts;
  const digits = digitScore(e.comparisons);
  console.log(`  cost     ${r.calls} call${r.calls === 1 ? "" : "s"}  $${r.cost?.toFixed(4) ?? "?"}  ${(r.ms / 1000).toFixed(1)} s`);
  console.log(`  lines    ${e.extractedEntries} read for ${e.gtEntries} (missing ${e.missingEntries}, extra ${e.extraEntries})`);
  console.log(`  fields   ${formatRatio({ numerator: c.fieldsCorrect, denominator: c.fieldsScored })}`);
  console.log(`  amounts  ${formatRatio({ numerator: c.amountsCorrect, denominator: c.amountsLabelled })}  (wrong and unflagged: ${c.unflaggedIncorrectAmounts})`);
  console.log(`  digits   ${formatRatio(digits)}`);
  const wrong = e.comparisons.filter((x) => !x.correct && x.field !== "type");
  const lineName = (x: (typeof wrong)[number]) => (x.gtLine != null ? `L${x.gtLine}` : `extra ${x.extractedLine}`);
  if (wrong.length > 0) console.log(`  misread  ${wrong.map((x) => `${lineName(x)}.${x.field} ${shown(x.field, x.observed)} (is ${shown(x.field, x.expected)})`).join(", ")}`);
  if (truthBlocks) {
    const blocks = r.x.blocks ?? [];
    const blockOf = new Map(r.x.entries.map((x) => [x.line, x.values.block ?? null]));
    const paired = pairs.flatMap((p) => (p.gtLine != null && p.line != null ? [{ line: p.gtLine, block: blockOf.get(p.line) ?? null }] : []));
    console.log(`  blocks   ${blocks.map((b) => `${b.id} ${b.kind}${b.party ? ` ${b.party}` : ""}`).join(" | ") || "none"}`);
    console.log(`  kinds    ${formatRatio(kindsFound(truthBlocks, blocks.map((b) => b.kind)))}`);
    console.log(`  grouping ${formatRatio(groupingAgreement(truthBlocks, paired))}`);
  }
  if (r.x.reading?.fallback) console.log(`  fallback ${r.x.reading.fallback}`);
  for (const d of r.x.doubts ?? []) console.log(`  doubt    ${d.entryId}.${d.field}: ${d.options.join(" / ")}`);
  console.log("");

  const s = summary.get(saved.promptVersion) ?? { fields: [0, 0], amounts: [0, 0], digits: [0, 0], unflagged: 0, doubts: 0, missing: 0, extra: 0, cost: 0, ms: 0, runs: 0 };
  summary.set(saved.promptVersion, {
    fields: add(s.fields, c.fieldsCorrect, c.fieldsScored),
    amounts: add(s.amounts, c.amountsCorrect, c.amountsLabelled),
    digits: add(s.digits, digits.numerator, digits.denominator),
    unflagged: s.unflagged + c.unflaggedIncorrectAmounts,
    doubts: s.doubts + (r.x.doubts?.length ?? 0),
    missing: s.missing + e.missingEntries,
    extra: s.extra + e.extraEntries,
    cost: s.cost + (r.cost ?? 0),
    ms: s.ms + r.ms,
    runs: s.runs + 1,
  });
}

if (summary.size > 0 && files.length > 1) {
  console.log("Summary by prompt");
  const ratio = ([n, d]: [number, number]) => formatRatio({ numerator: n, denominator: d });
  for (const [version, s] of summary) {
    console.log(
      `  ${version}  ${s.runs} run${s.runs === 1 ? "" : "s"}  fields ${ratio(s.fields)}  amounts ${ratio(s.amounts)}  digits ${ratio(s.digits)}  wrong unflagged ${s.unflagged}  doubts ${s.doubts}` +
        `  missing ${s.missing}  extra ${s.extra}  mean $${(s.cost / s.runs).toFixed(4)}  ${(s.ms / s.runs / 1000).toFixed(1)} s`,
    );
  }
}
