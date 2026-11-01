/**
 * Explicit live proof-of-concept: send ONE local photograph to Meta and print
 * what came back. Never run by tests or builds. Each run spends credits.
 *
 *   bun run live:extract private-test-data/ledger-snippets/S01.jpg
 *   bun run live:extract <path> --turn=90    # send a copy turned 90° clockwise (also 180, 270)
 *   bun run live:extract <path> --dry-run   # build the request, send nothing
 *   SCRIBA_PROMPT_VERSION=scriba-prompt-6 bun run live:extract <path> --two-pass
 *                                           # U3: layout call + one call per block (≤ 7 calls)
 *
 * Reads META_MODEL_API_KEY etc. from .env.local (Bun loads it automatically).
 * The raw response is written to private-test-data/responses/ (git-ignored); a two-pass run
 * also writes its block crops to private-test-data/crops/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getMetaConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/extraction/cache-key";
import { type NormalizedExtraction, pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { BLOCKS_PROMPT_VERSION, TWO_PASS_VERSION, getExtractionProfile } from "@/lib/extraction/prompt";
import { type BlockCropper, type CallLog, readTwoPass } from "@/lib/extraction/two-pass";
import { cropBlocksForReading } from "@/lib/images/crop";
import { inspectImage } from "@/lib/images/inspect";
import { processingModeForTurns } from "@/lib/images/orientation";
import { prepareImageForModel } from "@/lib/images/rotate";
import { buildExtractionRequest, createMetaCaller } from "@/lib/meta/transport";
import { formatTaka } from "@/lib/numerals";
import { estimateCostUsd, isContributorModel } from "@/lib/pricing";
import { RULE_LABELS, validateLedger } from "@/lib/validation/engine";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const twoPass = args.includes("--two-pass");
const turnArg = args.find((a) => a.startsWith("--turn="))?.slice("--turn=".length) ?? "0";
if (!path || !["0", "90", "180", "270"].includes(turnArg)) {
  console.error("Usage: bun run live:extract <image path> [--turn=90|180|270] [--two-pass] [--dry-run]");
  process.exit(2);
}
if (twoPass && getExtractionProfile().promptVersion !== BLOCKS_PROMPT_VERSION) {
  console.error(`--two-pass reads with prompt 6: set SCRIBA_PROMPT_VERSION=${BLOCKS_PROMPT_VERSION}.`);
  process.exit(2);
}
const processingMode = processingModeForTurns(Number(turnArg) / 90);

const bytes = new Uint8Array(readFileSync(path));
const inspection = inspectImage(bytes);
if (!inspection.ok) {
  console.error(`Rejected: ${inspection.message}`);
  process.exit(1);
}
const config = getMetaConfig();
const sha = sha256Hex(bytes);
console.log(`Image   ${basename(path)}  ${inspection.width}x${inspection.height}  ${bytes.byteLength} bytes  sha256 ${sha.slice(0, 16)}…`);
console.log(`Model   ${config.modelId}${isContributorModel(config.modelId) ? "  (CONTRIBUTOR MODE: may be used for training)" : "  (standard mode)"}`);
console.log(`Config  effort=${config.reasoningEffort}  max_output_tokens=${config.maxOutputTokens}  ${getExtractionProfile().promptVersion}  ${getExtractionProfile().schemaVersion}  ${processingMode}`);
if (inspection.hasGpsMetadata && processingMode === "baseline_original") console.log("Note    the photo carries GPS metadata and is sent unchanged.");
const prepared = await prepareImageForModel(bytes, inspection.mimeType, processingMode);

if (dryRun) {
  const body = buildExtractionRequest(config, twoPass ? { ...prepared, pass: { kind: "layout" } } : prepared);
  const preview = JSON.stringify(body, (k, v) => (k === "image_url" ? `${String(v).slice(0, 40)}…` : v), 2);
  console.log(preview.slice(0, 1500));
  console.log("\nDry run: nothing was sent.");
  process.exit(0);
}
if (!config.apiKey) {
  console.error("META_MODEL_API_KEY is not set (.env.local).");
  process.exit(1);
}

const outDir = join("private-test-data", "responses");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(outDir, `${basename(path)}.${stamp}${twoPass ? `.${TWO_PASS_VERSION}` : ""}.private.json`);
const usageLine = (u: CallLog["usage"]) =>
  u
    ? `in=${u.inputTokens} (cached ${u.cachedInputTokens})  out=${u.outputTokens} (reasoning ${u.reasoningTokens})  ≈ $${estimateCostUsd(config.modelId, u)?.toFixed(5)}`
    : "usage not reported";

let x: NormalizedExtraction;
if (twoPass) {
  // Keep the crops beside the response, so the cuts can be looked at.
  const cropDir = join("private-test-data", "crops");
  mkdirSync(cropDir, { recursive: true });
  const cropBlocks: BlockCropper = async (page, rects) => {
    const crops = await cropBlocksForReading(page, rects);
    crops.forEach((c, i) => writeFileSync(join(cropDir, `${basename(path)}.${stamp}.b${i + 1}.jpg`), c.image.imageBytes));
    return crops;
  };
  const reading = await readTwoPass({ callModel: createMetaCaller(config), cropBlocks, modelId: config.modelId }, prepared);
  const spent = reading.ok ? reading : reading.spent;
  const log = (JSON.parse(spent.rawOutputText) as { calls: CallLog[] }).calls;
  const outcome = reading.ok ? { extraction: reading.extraction } : { failure: { kind: reading.kind, message: reading.message } };
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        sha256: sha,
        model: config.modelId,
        promptVersion: `${BLOCKS_PROMPT_VERSION}+${TWO_PASS_VERSION}`,
        schemaVersion: getExtractionProfile().schemaVersion,
        processingMode,
        twoPass: { calls: log, usage: spent.usage, estimatedCostUsd: spent.estimatedCostUsd, elapsedMs: spent.elapsedMs, ...outcome },
      },
      null,
      2,
    ),
  );
  console.log("");
  for (const c of log) console.log(`Call    ${c.pass}${c.block ? ` ${c.block}` : ""}  ${c.error ? `FAILED ${c.error}: ${c.message}` : c.status}  ${c.elapsedMs} ms  ${usageLine(c.usage)}`);
  console.log(`Total   ${log.length} calls  ≈ ${spent.elapsedMs} ms  ≈ $${spent.estimatedCostUsd?.toFixed(5) ?? "?"}`);
  console.log(`Saved   ${outFile}`);
  if (!reading.ok) {
    console.error(`\nFAILED  ${reading.kind}${"category" in reading ? ` ${reading.category}` : ""}: ${reading.message}`);
    if (reading.kind === "model_failed" && reading.uncertain) console.error("A request may still have been processed and billed. Do not re-run blindly.");
    process.exit(1);
  }
  for (const c of reading.extraction.reading?.crops ?? []) {
    const r = c.rect;
    console.log(`Crop    ${c.block}  x ${r.x_min}–${r.x_max}  y ${r.y_min}–${r.y_max}`);
  }
  x = reading.extraction;
} else {
  const result = await createMetaCaller(config)(prepared);
  writeFileSync(outFile, JSON.stringify({ sha256: sha, model: config.modelId, promptVersion: getExtractionProfile().promptVersion, schemaVersion: getExtractionProfile().schemaVersion, processingMode, result }, null, 2));

  if (!result.ok) {
    console.error(`\nFAILED  ${result.category} (HTTP ${result.httpStatus ?? "-"})  ${result.message}`);
    if (result.uncertain) console.error("The request may still have been processed and billed. Do not re-run blindly.");
    console.error(`Saved   ${outFile}`);
    process.exit(1);
  }

  console.log(`\nStatus  ${result.summary.status}${result.summary.incompleteReason ? ` (${result.summary.incompleteReason})` : ""}  ${result.elapsedMs} ms  id=${result.providerResponseId}`);
  console.log(`Usage   ${usageLine(result.usage)}`);
  console.log(`Saved   ${outFile}`);

  const parsed = parseModelResponse(result.summary);
  if (!parsed.ok) {
    console.error(`\nUNUSABLE OUTPUT  ${parsed.kind}: ${parsed.detail}`);
    process.exit(1);
  }
  x = parsed.extraction;
}
console.log(`\nPage    ledger_type=${x.page.ledgerType}  legibility=${x.page.legibility}  date=${x.page.dateText ?? "—"}`);
for (const b of x.blocks ?? []) {
  console.log(`Block   ${b.id} ${b.kind}  title=${b.title ?? "—"}  party=${b.party ?? "—"}  person=${b.person ?? "—"}  date=${b.dateText ?? "—"}${b.box ? "  [box]" : ""}`);
}
for (const e of x.entries) {
  const v = e.values;
  console.log(
    `  ${String(e.line).padStart(2)} ${v.block ? `${v.block} ` : ""}${v.type.padEnd(16)} ${v.sourceText}` +
      `\n     item=${v.item ?? "—"} customer=${v.customer ?? "—"} qty=${v.quantityText ?? "—"} unit=${v.unit ?? "—"} rate=${v.rateText ?? "—"} amount=${v.amountText ?? "—"} -> ${formatTaka(e.numbers.amountPoisha)}` +
      `${e.reviewFields.length ? `  unsure: ${e.reviewFields.join(",")}` : ""}${e.bbox ? "  [box]" : ""}`,
  );
}
for (const d of x.doubts ?? []) console.log(`Doubt   ${d.entryId}.${d.field}: ${d.options.join(" / ")}${d.note ? `  (${d.note})` : ""}`);
if (x.warnings.length) console.log(`Warnings: ${x.warnings.join(" | ")}`);

const findings = validateLedger({
  page: pageValuesOf(x),
  entries: x.entries.map((e) => ({ id: e.candidateId, line: e.line, values: e.values, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason, excluded: false })),
});
console.log("\nChecks (deterministic, local):");
for (const f of findings) console.log(`  [${f.status.toUpperCase()}] ${RULE_LABELS[f.ruleId]}${f.block ? ` (${f.block})` : ""}: ${f.message}`);
