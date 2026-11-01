/**
 * U3: score saved readings against one page's ground truth, offline. No call is made.
 * For the single-pass vs two-pass comparison: fields and amounts read right, lines missing or
 * extra, how the lines are grouped into blocks, and what each reading cost.
 *
 *   bun scripts/score-readings.ts private-test-data/ground-truth/V01.json private-test-data/responses/V01.jpg.*.private.json
 *
 * Reads the files live:extract writes (one call, or `--two-pass`). Block scores need the
 * ground truth's `_blocks` (informal: kind and line numbers per block).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { type TruthBlocks, groupingAgreement, kindsFound } from "@/lib/evaluation/blocks";
import { groundTruthSchema } from "@/lib/evaluation/ground-truth";
import { evaluateSample, formatRatio } from "@/lib/evaluation/metrics";
import { type ModelResponseSummary, type NormalizedExtraction, parseModelResponse } from "@/lib/extraction/parse";
import { type TokenUsage, estimateCostUsd } from "@/lib/pricing";

const [truthPath, ...files] = process.argv.slice(2);
if (!truthPath || files.length === 0) {
  console.error("Usage: bun scripts/score-readings.ts <ground-truth.json> <response.private.json>...");
  process.exit(2);
}

const truthJson = JSON.parse(readFileSync(truthPath, "utf8")) as { _blocks?: TruthBlocks };
const truth = groundTruthSchema.parse(truthJson);
const truthBlocks = truthJson._blocks ?? null;

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

console.log(`Ground truth ${truth.sample_id}: ${truth.entries.length} lines${truthBlocks ? `, ${truthBlocks.length} blocks` : ", no _blocks (block scores skipped)"}\n`);
for (const file of files) {
  const saved = JSON.parse(readFileSync(file, "utf8")) as Saved;
  const r = readingOf(saved);
  console.log(`${basename(file)}  ${saved.promptVersion}`);
  if (typeof r === "string") {
    console.log(`  skipped: ${r}\n`);
    continue;
  }
  const e = evaluateSample(truth, { ledgerType: r.x.page.ledgerType, entries: r.x.entries });
  const c = e.counts;
  console.log(`  cost     ${r.calls} call${r.calls === 1 ? "" : "s"}  $${r.cost?.toFixed(4) ?? "?"}  ${(r.ms / 1000).toFixed(1)} s`);
  console.log(`  lines    ${e.extractedEntries} read for ${e.gtEntries} (missing ${e.missingEntries}, extra ${e.extraEntries})`);
  console.log(`  fields   ${formatRatio({ numerator: c.fieldsCorrect, denominator: c.fieldsScored })}`);
  console.log(`  amounts  ${formatRatio({ numerator: c.amountsCorrect, denominator: c.amountsLabelled })}`);
  // Numbers are compared in poisha (money) and thousandths (quantities).
  const shown = (field: string, v: string | number | null) => (typeof v !== "number" ? (v ?? "—") : field === "qty" ? v / 1000 : v / 100);
  const wrong = e.comparisons.filter((x) => !x.correct && x.field !== "type");
  if (wrong.length > 0) console.log(`  misread  ${wrong.map((x) => `L${x.gtLine}.${x.field} ${shown(x.field, x.observed)} (is ${shown(x.field, x.expected)})`).join(", ")}`);
  if (truthBlocks) {
    const blocks = r.x.blocks ?? [];
    console.log(`  blocks   ${blocks.map((b) => `${b.id} ${b.kind}${b.party ? ` ${b.party}` : ""}`).join(" | ") || "none"}`);
    console.log(`  kinds    ${formatRatio(kindsFound(truthBlocks, blocks.map((b) => b.kind)))}`);
    console.log(`  grouping ${formatRatio(groupingAgreement(truthBlocks, r.x.entries.map((x) => ({ line: x.line, block: x.values.block ?? null }))))}`);
  }
  if (r.x.reading?.fallback) console.log(`  fallback ${r.x.reading.fallback}`);
  console.log("");
}
