/**
 * Orchestrates one explicit "Analyze handwriting" action.
 *
 * Credit rules enforced here:
 *  - A compatible successful result is reused (no call) unless a fresh run is
 *    explicitly requested.
 *  - A repeated request id returns the earlier run (double-click safe).
 *  - Only one in-flight run per cache key; the database enforces it as well.
 *  - Per-user rate limits apply before any paid call.
 *  - Exactly one model call per run, never retried automatically.
 *  - A stale in-flight run is marked uncertain and requires a deliberate retry.
 *
 * Storage, image preparation and the model are injected, so tests can count model
 * calls exactly.
 */
import { sha256Hex, extractionCacheKey, type ProcessingMode } from "./cache-key";
import { parseModelResponse, type NormalizedExtraction, type ParseFailureKind } from "./parse";
import { PROMPT_VERSION } from "./prompt";
import { SCHEMA_VERSION } from "./schema";
import type { PreparedImage } from "@/lib/images/rotate";
import type { MetaErrorCategory, ModelCaller } from "@/lib/meta/transport";
import { estimateCostUsd, type TokenUsage } from "@/lib/pricing";
import { type Finding, VALIDATOR_VERSION, validateLedger } from "@/lib/validation/engine";

export type RunStatus = "pending" | "succeeded" | "failed" | "incomplete" | "invalid_output" | "uncertain";

export type DocumentForExtraction = {
  id: string;
  ownerId: string;
  sha256: string;
  storagePath: string;
  mimeType: string;
};

export type RunRecord = {
  id: string;
  documentId: string;
  status: RunStatus;
  requestId: string;
  cacheKey: string;
  startedAt: Date;
  errorCategory: string | null;
  errorMessage: string | null;
};

export type NewRun = {
  documentId: string;
  ownerId: string;
  requestId: string;
  cacheKey: string;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  processingMode: ProcessingMode;
  isFreshRequest: boolean;
};

export type RunSuccess = {
  providerResponseId: string | null;
  reportedModel: string | null;
  usage: TokenUsage | null;
  estimatedCostUsd: number | null;
  elapsedMs: number;
  rawOutputText: string;
  extraction: NormalizedExtraction;
  findings: Finding[];
  validatorVersion: string;
};

export type RunFailure = {
  status: Exclude<RunStatus, "pending" | "succeeded">;
  errorCategory: MetaErrorCategory | ParseFailureKind | "integrity" | "preparation" | "persistence" | "stale";
  errorMessage: string;
  httpStatus?: number | null;
  providerResponseId?: string | null;
  usage?: TokenUsage | null;
  estimatedCostUsd?: number | null;
  elapsedMs?: number | null;
  rawOutputText?: string | null;
};

export interface ExtractionRepo {
  /** Returns the document only if it belongs to the signed-in user. */
  getDocument(documentId: string): Promise<DocumentForExtraction | null>;
  findRunByRequestId(requestId: string): Promise<RunRecord | null>;
  findLatestSucceededRun(cacheKey: string): Promise<RunRecord | null>;
  findPendingRun(cacheKey: string): Promise<RunRecord | null>;
  countPaidRunsSince(since: Date): Promise<number>;
  /** Must be atomic: fails on a duplicate request id or an existing pending run. */
  insertPendingRun(run: NewRun): Promise<{ ok: true; run: RunRecord } | { ok: false; conflict: "request_id" | "pending" }>;
  downloadOriginal(doc: DocumentForExtraction): Promise<Uint8Array>;
  /** Must be atomic: run result, entries, review copies and findings together. */
  completeRun(runId: string, result: RunSuccess): Promise<void>;
  failRun(runId: string, failure: RunFailure): Promise<void>;
  recordCacheHit(runId: string, documentId: string): Promise<void>;
}

export type AnalyzeRequest = {
  documentId: string;
  /** Client-generated UUID, stable across retries of the same click. */
  requestId: string;
  /** "fresh" deliberately makes a new paid request even if a cached result exists. */
  mode: "use_cache" | "fresh";
  /** How the photo is turned before it is sent. Defaults to the untouched original. */
  processingMode?: ProcessingMode;
};

export type AnalyzeSettings = {
  modelId: string;
  extractionsPerHour: number;
  extractionsPerDay: number;
  stalePendingMs: number;
};

export type AnalyzeOutcome =
  | { kind: "not_found" }
  | { kind: "cached"; runId: string }
  | { kind: "duplicate_request"; runId: string; status: RunStatus }
  | { kind: "in_progress"; runId: string }
  | { kind: "previous_uncertain"; runId: string; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "integrity_error"; runId: string; message: string }
  | { kind: "completed"; runId: string }
  | { kind: "model_failed"; runId: string; category: MetaErrorCategory; message: string; uncertain: boolean }
  | { kind: "unusable_output"; runId: string; category: ParseFailureKind; message: string }
  | { kind: "persistence_error"; runId: string; message: string };

export type ImagePreparer = (imageBytes: Uint8Array, mimeType: string, mode: ProcessingMode) => Promise<PreparedImage>;

const originalOnly: ImagePreparer = async (imageBytes, mimeType, mode) => {
  if (mode !== "baseline_original") throw new Error(`No image preparer for ${mode}.`);
  return { imageBytes, mimeType };
};

export async function analyzeDocument(
  deps: { repo: ExtractionRepo; callModel: ModelCaller; now: () => Date; prepareImage?: ImagePreparer },
  settings: AnalyzeSettings,
  request: AnalyzeRequest,
): Promise<AnalyzeOutcome> {
  const { repo, callModel, now, prepareImage = originalOnly } = deps;
  const processingMode = request.processingMode ?? "baseline_original";

  const doc = await repo.getDocument(request.documentId);
  if (!doc) return { kind: "not_found" };

  const cacheKey = extractionCacheKey({
    ownerId: doc.ownerId,
    imageSha256: doc.sha256,
    modelId: settings.modelId,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    processingMode,
  });

  const replay = await repo.findRunByRequestId(request.requestId);
  if (replay) return { kind: "duplicate_request", runId: replay.id, status: replay.status };

  if (request.mode === "use_cache") {
    const cached = await repo.findLatestSucceededRun(cacheKey);
    if (cached) {
      await repo.recordCacheHit(cached.id, doc.id);
      return { kind: "cached", runId: cached.id };
    }
  }

  const pending = await repo.findPendingRun(cacheKey);
  if (pending) {
    if (now().getTime() - pending.startedAt.getTime() > settings.stalePendingMs) {
      const message =
        "An earlier request never reported back. It may have reached Meta and used credits. Click Analyze again to send a new request.";
      await repo.failRun(pending.id, { status: "uncertain", errorCategory: "stale", errorMessage: message });
      return { kind: "previous_uncertain", runId: pending.id, message };
    }
    return { kind: "in_progress", runId: pending.id };
  }

  const nowMs = now().getTime();
  const [lastHour, lastDay] = await Promise.all([
    repo.countPaidRunsSince(new Date(nowMs - 60 * 60 * 1000)),
    repo.countPaidRunsSince(new Date(nowMs - 24 * 60 * 60 * 1000)),
  ]);
  if (lastHour >= settings.extractionsPerHour || lastDay >= settings.extractionsPerDay) {
    return {
      kind: "rate_limited",
      message: `Extraction limit reached (${settings.extractionsPerHour} per hour, ${settings.extractionsPerDay} per day).`,
    };
  }

  const inserted = await repo.insertPendingRun({
    documentId: doc.id,
    ownerId: doc.ownerId,
    requestId: request.requestId,
    cacheKey,
    modelId: settings.modelId,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    processingMode,
    isFreshRequest: request.mode === "fresh",
  });
  if (!inserted.ok) {
    if (inserted.conflict === "request_id") {
      const existing = await repo.findRunByRequestId(request.requestId);
      if (existing) return { kind: "duplicate_request", runId: existing.id, status: existing.status };
    }
    const running = await repo.findPendingRun(cacheKey);
    return { kind: "in_progress", runId: running?.id ?? "" };
  }
  const runId = inserted.run.id;

  // Integrity: the bytes sent to Meta must be exactly the bytes that were uploaded.
  let bytes: Uint8Array;
  try {
    bytes = await repo.downloadOriginal(doc);
  } catch {
    const message = "The original photograph could not be read from storage. No request was sent to Meta.";
    await repo.failRun(runId, { status: "failed", errorCategory: "integrity", errorMessage: message });
    return { kind: "integrity_error", runId, message };
  }
  if (sha256Hex(bytes) !== doc.sha256) {
    const message = "The stored photograph does not match its recorded checksum. No request was sent to Meta.";
    await repo.failRun(runId, { status: "failed", errorCategory: "integrity", errorMessage: message });
    return { kind: "integrity_error", runId, message };
  }

  // A rotated mode sends a rotated copy of the verified bytes; the original is unchanged.
  let prepared: PreparedImage;
  try {
    prepared = await prepareImage(bytes, doc.mimeType, processingMode);
  } catch {
    const message = "The photograph could not be turned for analysis. No request was sent to Meta.";
    await repo.failRun(runId, { status: "failed", errorCategory: "preparation", errorMessage: message });
    return { kind: "integrity_error", runId, message };
  }

  const result = await callModel(prepared);

  if (!result.ok) {
    await repo.failRun(runId, {
      status: result.uncertain ? "uncertain" : "failed",
      errorCategory: result.category,
      errorMessage: result.message,
      httpStatus: result.httpStatus,
      elapsedMs: result.elapsedMs,
    });
    return { kind: "model_failed", runId, category: result.category, message: result.message, uncertain: result.uncertain };
  }

  const cost = estimateCostUsd(settings.modelId, result.usage);
  const parsed = parseModelResponse(result.summary);
  if (!parsed.ok) {
    await repo.failRun(runId, {
      status: parsed.kind === "incomplete" ? "incomplete" : "invalid_output",
      errorCategory: parsed.kind,
      errorMessage: parsed.detail,
      providerResponseId: result.providerResponseId,
      usage: result.usage,
      estimatedCostUsd: cost,
      elapsedMs: result.elapsedMs,
      rawOutputText: result.summary.outputText,
    });
    return { kind: "unusable_output", runId, category: parsed.kind, message: parsed.detail };
  }

  const findings = validateLedger({
    page: {
      dateText: parsed.extraction.page.dateText,
      ledgerType: parsed.extraction.page.ledgerType,
      accountName: parsed.extraction.page.accountName,
    },
    entries: parsed.extraction.entries.map((e) => ({
      id: e.candidateId,
      line: e.line,
      values: e.values,
      reviewFields: e.reviewFields,
      uncertaintyReason: e.uncertaintyReason,
      excluded: false,
    })),
  });

  try {
    await repo.completeRun(runId, {
      providerResponseId: result.providerResponseId,
      reportedModel: result.reportedModel,
      usage: result.usage,
      estimatedCostUsd: cost,
      elapsedMs: result.elapsedMs,
      rawOutputText: result.summary.outputText ?? "",
      extraction: parsed.extraction,
      findings,
      validatorVersion: VALIDATOR_VERSION,
    });
  } catch {
    const message =
      "Meta answered, but saving the result failed, so nothing was confirmed. The raw response is kept on the run record for diagnosis where possible.";
    try {
      await repo.failRun(runId, {
        status: "failed",
        errorCategory: "persistence",
        errorMessage: message,
        providerResponseId: result.providerResponseId,
        usage: result.usage,
        estimatedCostUsd: cost,
        elapsedMs: result.elapsedMs,
        rawOutputText: result.summary.outputText,
      });
    } catch {
      // The run stays pending and will be reported as uncertain later.
    }
    return { kind: "persistence_error", runId, message };
  }
  return { kind: "completed", runId };
}
