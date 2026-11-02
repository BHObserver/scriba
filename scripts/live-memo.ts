/**
 * U4, explicit live check: read ONE company memo photo with the memo prompt and print what came
 * back with code's checks. With --page, also print the questions Scriba would ask about a saved
 * page reading with this memo, and what their proposed answers would do. Never run by tests or
 * builds. A photo is one paid call; a saved memo response (.json) is read again for free.
 *
 *   bun run live:memo private-test-data/v3/M01.jpg
 *   bun run live:memo <memo photo> --page=private-test-data/responses/V01.flat.jpg.<stamp>.private.json
 *   bun run live:memo <saved memo response .json> --page=<saved page response .json>   # no call
 *   bun run live:memo <memo photo> --dry-run                                           # send nothing
 *
 * Reads META_MODEL_API_KEY etc. from .env.local. The raw response goes to
 * private-test-data/responses/ (git-ignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getMetaConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/extraction/cache-key";
import { type ModelResponseSummary, pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { BLOCKS_PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_V3_VERSION } from "@/lib/extraction/schema";
import { makeI18n } from "@/lib/i18n/format";
import { inspectImage } from "@/lib/images/inspect";
import { prepareImageForModel } from "@/lib/images/rotate";
import { type NormalizedMemo, parseMemoResponse } from "@/lib/memo/parse";
import { MEMO_PROFILE } from "@/lib/memo/prompt";
import { buildExtractionRequest, createMetaCaller } from "@/lib/meta/transport";
import { formatTaka } from "@/lib/numerals";
import { estimateCostUsd, isContributorModel } from "@/lib/pricing";
import { answerQuestion } from "@/lib/questions/answer";
import { buildQuestions } from "@/lib/questions/engine";
import { sentenceText } from "@/lib/questions/text";
import type { QuestionInput } from "@/lib/questions/types";
import type { ReviewRow } from "@/lib/review/state";
import { validateLedger } from "@/lib/validation/engine";
import { toValidationInput } from "@/lib/review/state";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const pagePath = args.find((a) => a.startsWith("--page="))?.slice("--page=".length) ?? null;
const dryRun = args.includes("--dry-run");
if (!path) {
  console.error("Usage: bun run live:memo <memo photo | saved memo response .json> [--page=<saved page response .json>] [--dry-run]");
  process.exit(2);
}

const summaryOf = (file: string): ModelResponseSummary => {
  const saved = JSON.parse(readFileSync(file, "utf8")) as { result?: { ok: boolean; summary?: ModelResponseSummary } };
  if (!saved.result?.ok || !saved.result.summary) throw new Error(`${file} holds no successful single-call response.`);
  return saved.result.summary;
};

let memo: NormalizedMemo;
if (path.endsWith(".json")) {
  const parsed = parseMemoResponse(summaryOf(path));
  if (!parsed.ok) throw new Error(`${parsed.kind}: ${parsed.detail}`);
  memo = parsed.memo;
  console.log(`Memo    ${basename(path)} (saved response, no call)`);
} else {
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
  console.log(`Config  effort=${config.reasoningEffort}  max_output_tokens=${config.maxOutputTokens}  ${MEMO_PROFILE.promptVersion}  ${MEMO_PROFILE.schemaVersion}`);
  const prepared = await prepareImageForModel(bytes, inspection.mimeType, "baseline_original");
  if (dryRun) {
    const body = buildExtractionRequest(config, { ...prepared, memo: true });
    console.log(JSON.stringify(body, (k, v) => (k === "image_url" ? `${String(v).slice(0, 40)}…` : v), 2).slice(0, 1500));
    console.log("\nDry run: nothing was sent.");
    process.exit(0);
  }
  if (!config.apiKey) {
    console.error("META_MODEL_API_KEY is not set (.env.local).");
    process.exit(1);
  }
  const result = await createMetaCaller(config)({ ...prepared, memo: true });
  const outDir = join("private-test-data", "responses");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${basename(path)}.${new Date().toISOString().replace(/[:.]/g, "-")}.memo.private.json`);
  writeFileSync(outFile, JSON.stringify({ sha256: sha, model: config.modelId, promptVersion: MEMO_PROFILE.promptVersion, schemaVersion: MEMO_PROFILE.schemaVersion, result }, null, 2));
  if (!result.ok) {
    console.error(`\nFAILED  ${result.category} (HTTP ${result.httpStatus ?? "-"})  ${result.message}`);
    if (result.uncertain) console.error("The request may still have been processed and billed. Do not re-run blindly.");
    process.exit(1);
  }
  const u = result.usage;
  console.log(`\nStatus  ${result.summary.status}  ${result.elapsedMs} ms  id=${result.providerResponseId}`);
  console.log(`Usage   ${u ? `in=${u.inputTokens} out=${u.outputTokens} (reasoning ${u.reasoningTokens})  ≈ $${estimateCostUsd(config.modelId, u)?.toFixed(5)}` : "not reported"}`);
  console.log(`Saved   ${outFile}`);
  const parsed = parseMemoResponse(result.summary);
  if (!parsed.ok) {
    console.error(`\nUNUSABLE OUTPUT  ${parsed.kind}: ${parsed.detail}`);
    process.exit(1);
  }
  memo = parsed.memo;
}

console.log(`\nMemo    company=${memo.company ?? "—"}  person=${memo.person ?? "—"}  no=${memo.number ?? "—"}  date=${memo.dateText ?? "—"}  legibility=${memo.legibility}`);
for (const l of memo.lines) {
  const check = l.multiplies == null ? "" : l.multiplies ? "  qty×rate ✓" : "  qty×rate ✗";
  console.log(
    `  ${l.id} ${l.crossedOut ? "(struck) " : ""}${l.text}\n     item=${l.item ?? "—"} qty=${l.quantityText ?? "—"} unit=${l.unit ?? "—"} rate=${l.rateText ?? "—"} amount=${l.amountText ?? "—"} -> ${formatTaka(l.amountPoisha)}${check}${l.review.length ? `  unsure: ${l.review.join(",")}` : ""}${l.box ? "  [box]" : ""}`,
  );
}
for (const [k, f] of Object.entries(memo.totals)) if (f.text) console.log(`Total   ${k}=${f.text} -> ${formatTaka(f.poisha)}`);
console.log(`Check   lines add up to ${formatTaka(memo.check.linesSum)}; goods come to ${formatTaka(memo.check.total)}; agrees=${memo.check.agrees}`);
if (memo.warnings.length) console.log(`Warnings: ${memo.warnings.join(" | ")}`);

if (pagePath) {
  const page = parseModelResponse(summaryOf(pagePath), { promptVersion: BLOCKS_PROMPT_VERSION, schemaVersion: SCHEMA_V3_VERSION });
  if (!page.ok) throw new Error(`${page.kind}: ${page.detail}`);
  const x = page.extraction;
  const rows: ReviewRow[] = x.entries.map((e, i) => ({
    id: `r${i + 1}`,
    extractedEntryId: null,
    lineOrder: e.line,
    values: e.values,
    reviewFields: [...e.reviewFields],
    status: "draft",
    version: 1,
    candidate: { candidateId: e.candidateId, values: e.values, bbox: e.bbox, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason },
  }));
  let input: QuestionInput = { page: pageValuesOf(x), rows, doubts: x.doubts ?? [], parties: [], capturedOn: null, memos: [{ documentId: "memo", runId: "live", memo }] };
  const en = makeI18n("en");
  const bn = makeI18n("bn");

  console.log(`\nQuestions about ${basename(pagePath)} with this memo:`);
  for (const q of buildQuestions(input).questions) {
    if (!q.kind.startsWith("memo") && q.kind !== "delivery" && q.kind !== "price" && q.kind !== "meaning") continue;
    console.log(`\n  ${q.id}${q.proposed ? `  (proposed: ${q.proposed})` : ""}`);
    console.log(`    en  ${sentenceText(en, q.sentence)}`);
    console.log(`    bn  ${sentenceText(bn, q.sentence)}`);
    if (q.why) console.log(`    why ${sentenceText(en, q.why.sentence)}${q.why.verified ? " ✓" : ""}`);
    for (const o of q.options) console.log(`    · ${o.id}: ${sentenceText(en, o.label)}${o.detail ? ` (${sentenceText(en, o.detail)})` : ""}`);
  }

  // One tap on each proposed memo answer, as the check screen would send it.
  for (const q of buildQuestions(input).questions) {
    if (!q.proposed || !(q.kind === "delivery" || q.kind === "price")) continue;
    const out = answerQuestion(input, q.id, q.fp, { option: q.proposed }, new Date());
    if (out.ok) input = { ...input, page: out.after.page, rows: out.after.rows };
  }
  console.log("\nAfter the proposed memo answers:");
  for (const r of input.rows.filter((r) => r.values.item && r.status !== "rejected" && ["credit_purchase", "purchase"].includes(r.values.type))) {
    console.log(`  ${r.values.sourceText || r.values.item}  amount=${r.values.amountText ?? "—"} rate=${r.values.rateText ?? "—"}`);
  }
  const findings = validateLedger(toValidationInput({ page: { values: input.page, version: 1, reviewStartedAt: null }, rows: input.rows }));
  for (const f of findings.filter((f) => f.ruleId === "balance_equation")) console.log(`  [${f.status.toUpperCase()}] ${f.block ?? ""} ${f.message}`);
}
