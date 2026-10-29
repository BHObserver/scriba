import { NextResponse } from "next/server";
import { z } from "zod";
import { getMetaConfig } from "@/lib/config";
import type { NormalizedExtraction } from "@/lib/extraction/parse";
import { PROMPT_VERSION } from "@/lib/extraction/prompt";
import { SCHEMA_VERSION } from "@/lib/extraction/schema";
import { groundTruthSchema } from "@/lib/evaluation/ground-truth";
import { METRICS_VERSION, evaluateSample, summarize } from "@/lib/evaluation/metrics";
import { apiUser, jsonError } from "@/lib/server/auth";
import { createServiceSupabase } from "@/lib/supabase/server";
import { VALIDATOR_VERSION } from "@/lib/validation/engine";

const bodySchema = z.object({ datasetLabel: z.string().trim().max(80).nullable().default(null) });

/**
 * Compute a benchmark from stored results. Makes no model call: it compares the
 * latest successful extraction for the current model/prompt/schema with the
 * latest ground-truth version for each photograph, and stores a new, versioned
 * evaluation row. Earlier evaluations are never overwritten.
 *
 * A photo the user turned upright counts with that run. Each sample records its
 * orientation, and the evaluation is labelled "user_oriented" when any photo was
 * turned, so the write-up can say so.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return jsonError("Invalid request.", 400);
  const modelId = getMetaConfig().modelId;

  let docsQuery = supabase.from("ledger_documents").select("id, sha256, dataset_label, sample_label");
  if (body.data.datasetLabel) docsQuery = docsQuery.eq("dataset_label", body.data.datasetLabel);
  const [{ data: docs }, { data: truths }, { data: runs }, { data: reviews }, { data: confirmations }] = await Promise.all([
    docsQuery,
    supabase.from("ground_truth_annotations").select("document_id, gt_version, annotation").order("gt_version", { ascending: false }),
    supabase
      .from("extraction_runs")
      .select("id, document_id, processing_mode, result, elapsed_ms, completed_at")
      .eq("status", "succeeded")
      .eq("model_id", modelId)
      .eq("prompt_version", PROMPT_VERSION)
      .eq("schema_version", SCHEMA_VERSION)
      .order("completed_at", { ascending: false }),
    supabase.from("page_reviews").select("run_id, review_started_at"),
    supabase.from("confirmed_records").select("run_id, confirmed_at"),
  ]);

  const latestTruth = new Map<string, { version: number; annotation: unknown }>();
  for (const t of truths ?? []) if (!latestTruth.has(t.document_id)) latestTruth.set(t.document_id, { version: t.gt_version, annotation: t.annotation });
  const latestRun = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) if (!latestRun.has(r.document_id)) latestRun.set(r.document_id, r);
  const reviewStart = new Map((reviews ?? []).map((r) => [r.run_id, r.review_started_at as string | null]));
  const lastConfirm = new Map<string, string>();
  for (const c of confirmations ?? []) {
    const prev = lastConfirm.get(c.run_id);
    if (!prev || c.confirmed_at > prev) lastConfirm.set(c.run_id, c.confirmed_at);
  }

  const samples = [];
  const skipped: Array<{ documentId: string; reason: string }> = [];
  for (const doc of docs ?? []) {
    const truth = latestTruth.get(doc.id);
    const run = latestRun.get(doc.id);
    if (!truth) continue;
    if (!run) {
      skipped.push({ documentId: doc.id, reason: "no successful extraction with the current model, prompt and schema" });
      continue;
    }
    const gt = groundTruthSchema.safeParse(truth.annotation);
    if (!gt.success) {
      skipped.push({ documentId: doc.id, reason: "ground truth does not match the current format" });
      continue;
    }
    const extraction = run.result as NormalizedExtraction;
    const evaluation = evaluateSample(gt.data, { ledgerType: extraction.page.ledgerType, entries: extraction.entries });
    const started = reviewStart.get(run.id);
    const confirmed = lastConfirm.get(run.id);
    samples.push({
      ...evaluation,
      documentId: doc.id,
      imageSha256: doc.sha256,
      extractionRunId: run.id,
      processingMode: run.processing_mode,
      groundTruthVersion: truth.version,
      timing: {
        manualTranscriptionSeconds: gt.data.manual_transcription_seconds,
        modelWaitMs: run.elapsed_ms,
        humanReviewSeconds: started && confirmed ? Math.round((Date.parse(confirmed) - Date.parse(started)) / 1000) : null,
      },
    });
  }

  if (samples.length === 0) {
    return jsonError("No photograph has both ground truth and a successful extraction yet.", 422, { skipped });
  }

  const summary = { ...summarize(samples), skipped };
  const processingMode = samples.every((s) => s.processingMode === "baseline_original") ? "baseline_original" : "user_oriented";
  const { data, error } = await createServiceSupabase()
    .from("evaluation_runs")
    .insert({
      owner_id: user.id,
      label: "exploratory",
      dataset_label: body.data.datasetLabel,
      model_id: modelId,
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
      processing_mode: processingMode,
      validator_version: VALIDATOR_VERSION,
      metrics_version: METRICS_VERSION,
      sample_count: samples.length,
      summary,
      samples,
    })
    .select("id")
    .single();
  if (error || !data) return jsonError("The evaluation could not be saved.", 500);
  return NextResponse.json({ id: data.id, samples: samples.length, skipped: skipped.length }, { status: 201 });
}
