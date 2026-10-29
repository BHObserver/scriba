/**
 * Explicit live proof-of-concept: send ONE local photograph to Meta and print
 * what came back. Never run by tests or builds. Each run spends credits.
 *
 *   bun run live:extract private-test-data/ledger-snippets/S01.jpg
 *   bun run live:extract <path> --turn=90    # send a copy turned 90° clockwise (also 180, 270)
 *   bun run live:extract <path> --dry-run   # build the request, send nothing
 *
 * Reads META_MODEL_API_KEY etc. from .env.local (Bun loads it automatically).
 * The raw response is written to private-test-data/responses/ (git-ignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getMetaConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/extraction/cache-key";
import { parseModelResponse } from "@/lib/extraction/parse";
import { PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_VERSION } from "@/lib/extraction/schema";
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
const turnArg = args.find((a) => a.startsWith("--turn="))?.slice("--turn=".length) ?? "0";
if (!path || !["0", "90", "180", "270"].includes(turnArg)) {
  console.error("Usage: bun run live:extract <image path> [--turn=90|180|270] [--dry-run]");
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
console.log(`Config  effort=${config.reasoningEffort}  max_output_tokens=${config.maxOutputTokens}  ${PROMPT_VERSION}  ${SCHEMA_VERSION}  ${processingMode}`);
if (inspection.hasGpsMetadata && processingMode === "baseline_original") console.log("Note    the photo carries GPS metadata and is sent unchanged.");
const prepared = await prepareImageForModel(bytes, inspection.mimeType, processingMode);

if (dryRun) {
  const body = buildExtractionRequest(config, prepared);
  const preview = JSON.stringify(body, (k, v) => (k === "image_url" ? `${String(v).slice(0, 40)}…` : v), 2);
  console.log(preview.slice(0, 1500));
  console.log("\nDry run: nothing was sent.");
  process.exit(0);
}
if (!config.apiKey) {
  console.error("META_MODEL_API_KEY is not set (.env.local).");
  process.exit(1);
}

const result = await createMetaCaller(config)(prepared);
const outDir = join("private-test-data", "responses");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(outDir, `${basename(path)}.${stamp}.private.json`);
writeFileSync(outFile, JSON.stringify({ sha256: sha, model: config.modelId, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, processingMode, result }, null, 2));

if (!result.ok) {
  console.error(`\nFAILED  ${result.category} (HTTP ${result.httpStatus ?? "-"})  ${result.message}`);
  if (result.uncertain) console.error("The request may still have been processed and billed. Do not re-run blindly.");
  console.error(`Saved   ${outFile}`);
  process.exit(1);
}

const u = result.usage;
console.log(`\nStatus  ${result.summary.status}${result.summary.incompleteReason ? ` (${result.summary.incompleteReason})` : ""}  ${result.elapsedMs} ms  id=${result.providerResponseId}`);
console.log(
  u
    ? `Usage   in=${u.inputTokens} (cached ${u.cachedInputTokens})  out=${u.outputTokens} (reasoning ${u.reasoningTokens})  ≈ $${estimateCostUsd(config.modelId, u)?.toFixed(5)}`
    : "Usage   not reported",
);
console.log(`Saved   ${outFile}`);

const parsed = parseModelResponse(result.summary);
if (!parsed.ok) {
  console.error(`\nUNUSABLE OUTPUT  ${parsed.kind}: ${parsed.detail}`);
  process.exit(1);
}
const x = parsed.extraction;
console.log(`\nPage    ledger_type=${x.page.ledgerType}  legibility=${x.page.legibility}  date=${x.page.dateText ?? "—"}`);
for (const e of x.entries) {
  const v = e.values;
  console.log(
    `  ${String(e.line).padStart(2)} ${v.type.padEnd(16)} ${v.sourceText}` +
      `\n     qty=${v.quantityText ?? "—"} unit=${v.unit ?? "—"} rate=${v.rateText ?? "—"} amount=${v.amountText ?? "—"} -> ${formatTaka(e.numbers.amountPoisha)}` +
      `${e.reviewFields.length ? `  unsure: ${e.reviewFields.join(",")}` : ""}${e.bbox ? "  [box]" : ""}`,
  );
}
if (x.warnings.length) console.log(`Warnings: ${x.warnings.join(" | ")}`);

const findings = validateLedger({
  page: { ledgerType: x.page.ledgerType, dateText: x.page.dateText, accountName: x.page.accountName },
  entries: x.entries.map((e) => ({ id: e.candidateId, line: e.line, values: e.values, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason, excluded: false })),
});
console.log("\nChecks (deterministic, local):");
for (const f of findings) console.log(`  [${f.status.toUpperCase()}] ${RULE_LABELS[f.ruleId]}: ${f.message}`);
