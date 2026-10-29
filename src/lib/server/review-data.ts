import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoundingBox, ReviewableField } from "@/lib/ledger/types";
import type { NormalizedExtraction } from "@/lib/extraction/parse";
import type { PageState, ReviewRow } from "@/lib/review/state";
import { entryValuesSchema, pageValuesSchema } from "@/lib/review/values";

export type { PageState, ReviewRow } from "@/lib/review/state";

export type RunSummary = {
  id: string;
  documentId: string;
  status: string;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  processingMode: string;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  estimatedCostUsd: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  isFreshRequest: boolean;
};

export type RunReview = {
  run: RunSummary;
  extraction: NormalizedExtraction | null;
  page: PageState;
  rows: ReviewRow[];
};

type RunRow = {
  id: string;
  document_id: string;
  status: string;
  model_id: string;
  prompt_version: string;
  schema_version: string;
  processing_mode: string;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  estimated_cost_usd: number | string | null;
  error_category: string | null;
  error_message: string | null;
  is_fresh_request: boolean;
};

export const RUN_SUMMARY_COLUMNS =
  "id, document_id, status, model_id, prompt_version, schema_version, processing_mode, started_at, completed_at, elapsed_ms, input_tokens, output_tokens, reasoning_tokens, estimated_cost_usd, error_category, error_message, is_fresh_request";

export function toRunSummary(r: RunRow): RunSummary {
  return {
    id: r.id,
    documentId: r.document_id,
    status: r.status,
    modelId: r.model_id,
    promptVersion: r.prompt_version,
    schemaVersion: r.schema_version,
    processingMode: r.processing_mode,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    elapsedMs: r.elapsed_ms,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    reasoningTokens: r.reasoning_tokens,
    estimatedCostUsd: r.estimated_cost_usd == null ? null : Number(r.estimated_cost_usd),
    errorCategory: r.error_category,
    errorMessage: r.error_message,
    isFreshRequest: r.is_fresh_request,
  };
}

/** Load a run's review state. Reads only; never triggers extraction. RLS scopes it to the user. */
export async function loadRunReview(supabase: SupabaseClient, runId: string): Promise<RunReview | null> {
  const { data: run } = await supabase
    .from("extraction_runs")
    .select(`${RUN_SUMMARY_COLUMNS}, result`)
    .eq("id", runId)
    .maybeSingle();
  if (!run) return null;

  const [{ data: page }, { data: reviews }, { data: candidates }] = await Promise.all([
    supabase.from("page_reviews").select("page_values, version, review_started_at").eq("run_id", runId).maybeSingle(),
    supabase
      .from("entry_reviews")
      .select("id, extracted_entry_id, line_order, entry_values, review_fields, status, version")
      .eq("run_id", runId)
      .order("line_order"),
    supabase
      .from("extracted_entries")
      .select(
        "id, candidate_id, source_text, transaction_type, customer_alias, item_name, quantity_text, unit, unit_rate_text, amount_text, balance_text, crossed_out, bbox, review_fields, uncertainty_reason",
      )
      .eq("run_id", runId),
  ]);

  const byId = new Map((candidates ?? []).map((c) => [c.id as string, c]));
  const rows: ReviewRow[] = (reviews ?? []).map((r) => {
    const c = r.extracted_entry_id ? byId.get(r.extracted_entry_id) : undefined;
    return {
      id: r.id,
      extractedEntryId: r.extracted_entry_id,
      lineOrder: Number(r.line_order),
      values: entryValuesSchema.parse(r.entry_values),
      reviewFields: (r.review_fields ?? []) as ReviewableField[],
      status: r.status,
      version: r.version,
      candidate: c
        ? {
            candidateId: c.candidate_id,
            values: {
              sourceText: c.source_text,
              type: c.transaction_type,
              customer: c.customer_alias,
              item: c.item_name,
              quantityText: c.quantity_text,
              unit: c.unit,
              rateText: c.unit_rate_text,
              amountText: c.amount_text,
              balanceText: c.balance_text,
              crossedOut: c.crossed_out,
            },
            bbox: (c.bbox ?? null) as BoundingBox | null,
            reviewFields: (c.review_fields ?? []) as ReviewableField[],
            uncertaintyReason: c.uncertainty_reason,
          }
        : null,
    };
  });

  return {
    run: toRunSummary(run as RunRow),
    extraction: (run.result ?? null) as NormalizedExtraction | null,
    page: {
      values: page ? pageValuesSchema.parse(page.page_values) : { dateText: null, ledgerType: "unknown", accountName: null },
      version: page?.version ?? 0,
      reviewStartedAt: page?.review_started_at ?? null,
    },
    rows,
  };
}
