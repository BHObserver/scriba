import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/config";
import type { ExtractionRepo, RunFailure, RunRecord, RunStatus, RunSuccess } from "@/lib/extraction/pipeline";

type RunRow = {
  id: string;
  document_id: string;
  status: RunStatus;
  request_id: string;
  cache_key: string;
  started_at: string;
  error_category: string | null;
  error_message: string | null;
};

const RUN_COLUMNS = "id, document_id, status, request_id, cache_key, started_at, error_category, error_message";

function toRecord(r: RunRow): RunRecord {
  return {
    id: r.id,
    documentId: r.document_id,
    status: r.status,
    requestId: r.request_id,
    cacheKey: r.cache_key,
    startedAt: new Date(r.started_at),
    errorCategory: r.error_category,
    errorMessage: r.error_message,
  };
}

function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/**
 * Reads go through the user's own client (RLS proves ownership). Server-attested
 * writes use the service client and are always filtered by the verified owner id.
 */
export function createSupabaseExtractionRepo(opts: {
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  ownerId: string;
}): ExtractionRepo {
  const { userClient: db, serviceClient: service, ownerId } = opts;

  return {
    async getDocument(documentId) {
      const data = must(
        await db
          .from("ledger_documents")
          .select("id, owner_id, sha256, storage_path, mime_type")
          .eq("id", documentId)
          .maybeSingle(),
      );
      if (!data || data.owner_id !== ownerId) return null;
      return {
        id: data.id,
        ownerId: data.owner_id,
        sha256: data.sha256,
        storagePath: data.storage_path,
        mimeType: data.mime_type,
      };
    },

    async findRunByRequestId(requestId) {
      const data = must(await db.from("extraction_runs").select(RUN_COLUMNS).eq("request_id", requestId).maybeSingle());
      return data ? toRecord(data as RunRow) : null;
    },

    async findLatestSucceededRun(cacheKey) {
      const data = must(
        await db
          .from("extraction_runs")
          .select(RUN_COLUMNS)
          .eq("cache_key", cacheKey)
          .eq("status", "succeeded")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      return data ? toRecord(data as RunRow) : null;
    },

    async findPendingRun(cacheKey) {
      const data = must(
        await db.from("extraction_runs").select(RUN_COLUMNS).eq("cache_key", cacheKey).eq("status", "pending").maybeSingle(),
      );
      return data ? toRecord(data as RunRow) : null;
    },

    async countPaidRunsSince(since) {
      const { count, error } = await db
        .from("extraction_runs")
        .select("id", { count: "exact", head: true })
        .gte("started_at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async insertPendingRun(run) {
      const { data, error } = await service
        .from("extraction_runs")
        .insert({
          document_id: run.documentId,
          owner_id: ownerId,
          request_id: run.requestId,
          cache_key: run.cacheKey,
          model_id: run.modelId,
          prompt_version: run.promptVersion,
          schema_version: run.schemaVersion,
          processing_mode: run.processingMode,
          is_fresh_request: run.isFreshRequest,
          status: "pending",
        })
        .select(RUN_COLUMNS)
        .single();
      if (error) {
        if (error.code === "23505") {
          return { ok: false, conflict: error.message.includes("request_id") ? "request_id" : "pending" } as const;
        }
        throw new Error(error.message);
      }
      return { ok: true, run: toRecord(data as RunRow) } as const;
    },

    async downloadOriginal(doc) {
      const { data, error } = await db.storage.from(STORAGE_BUCKET).download(doc.storagePath);
      if (error || !data) throw new Error(error?.message ?? "download failed");
      return new Uint8Array(await data.arrayBuffer());
    },

    async completeRun(runId, r: RunSuccess) {
      const entries = r.extraction.entries.map((e) => ({
        candidate_id: e.candidateId,
        line_order: e.line,
        source_text: e.values.sourceText,
        transaction_type: e.values.type,
        customer_alias: e.values.customer,
        item_name: e.values.item,
        quantity_text: e.values.quantityText,
        quantity_milli: e.numbers.quantityMilli,
        unit: e.values.unit,
        unit_rate_text: e.values.rateText,
        unit_rate_poisha: e.numbers.ratePoisha,
        amount_text: e.values.amountText,
        amount_poisha: e.numbers.amountPoisha,
        balance_text: e.values.balanceText,
        balance_poisha: e.numbers.balancePoisha,
        crossed_out: e.values.crossedOut,
        bbox: e.bbox,
        review_fields: e.reviewFields,
        uncertainty_reason: e.uncertaintyReason,
        entry_values: e.values,
      }));
      const findings = r.findings.map((f) => ({
        finding_key: f.key,
        rule_id: f.ruleId,
        rule_version: f.ruleVersion,
        status: f.status,
        severity: f.severity,
        entry_refs: f.entryIds,
        expected_poisha: f.expected,
        observed_poisha: f.observed,
        message: f.message,
      }));
      const { error } = await service.rpc("scriba_complete_extraction", {
        p_owner_id: ownerId,
        p_run_id: runId,
        p_run: {
          elapsed_ms: r.elapsedMs,
          provider_response_id: r.providerResponseId,
          reported_model: r.reportedModel,
          input_tokens: r.usage?.inputTokens ?? null,
          cached_input_tokens: r.usage?.cachedInputTokens ?? null,
          output_tokens: r.usage?.outputTokens ?? null,
          reasoning_tokens: r.usage?.reasoningTokens ?? null,
          total_tokens: r.usage?.totalTokens ?? null,
          estimated_cost_usd: r.estimatedCostUsd,
          raw_output_text: r.rawOutputText,
          result: r.extraction,
          validator_version: r.validatorVersion,
        },
        p_entries: entries,
        p_page: {
          dateText: r.extraction.page.dateText,
          ledgerType: r.extraction.page.ledgerType,
          accountName: r.extraction.page.accountName,
        },
        p_findings: findings,
      });
      if (error) throw new Error(error.message);
    },

    async failRun(runId, f: RunFailure) {
      const { error } = await service
        .from("extraction_runs")
        .update({
          status: f.status,
          completed_at: new Date().toISOString(),
          error_category: f.errorCategory,
          error_message: f.errorMessage.slice(0, 1000),
          http_status: f.httpStatus ?? null,
          provider_response_id: f.providerResponseId ?? null,
          input_tokens: f.usage?.inputTokens ?? null,
          cached_input_tokens: f.usage?.cachedInputTokens ?? null,
          output_tokens: f.usage?.outputTokens ?? null,
          reasoning_tokens: f.usage?.reasoningTokens ?? null,
          total_tokens: f.usage?.totalTokens ?? null,
          estimated_cost_usd: f.estimatedCostUsd ?? null,
          elapsed_ms: f.elapsedMs ?? null,
          raw_output_text: f.rawOutputText ?? null,
        })
        .eq("id", runId)
        .eq("owner_id", ownerId)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
    },

    async recordCacheHit(runId, documentId) {
      const { error } = await service
        .from("extraction_cache_hits")
        .insert({ run_id: runId, document_id: documentId, owner_id: ownerId });
      if (error) throw new Error(error.message);
    },
  };
}
