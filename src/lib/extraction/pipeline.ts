/**
 * Orchestrates one explicit "Analyze handwriting" action.
 *
 * Credit rules enforced here:
 *  - A compatible successful result is reused (no call) unless a fresh run is
 *    explicitly requested.
 *  - A repeated request id returns the earlier run (double-click safe).
 *  - Only one in-flight run per cache key; the database enforces it as well.
 *  - Per-user rate limits apply before any paid call. They count model calls, and a run
 *    only starts when every call it may make still fits.
 *  - One model call per run, or (U3, two-pass) at most 1 + 6, each logged and counted in the
 *    run's usage and cost. Never retried automatically.
 *  - A stale in-flight run is marked uncertain and requires a deliberate retry.
 *  - U4: a company memo is read the same way, in one call with the memo prompt. Its reading is
 *    stored on its run; it has no review rows and is never confirmed.
 *
 * Storage, image preparation and the model are injected, so tests can count model
 * calls exactly.
 */
import { sha256Hex, extractionCacheKey, type ProcessingMode } from "./cache-key";
import { type ModelResponseSummary, pageValuesOf, parseModelResponse, type NormalizedExtraction, type ParseFailureKind } from "./parse";
import {
  type PageLayout,
  getExtractionProfile,
  getPersonalProfile,
  isTwoPassVersion,
  layoutOfPromptVersion,
  withLayout,
  withTwoPass,
} from "./prompt";
import { type BlockCropper, MAX_RUN_CALLS, type Spent, readTwoPass } from "./two-pass";
import type { PreparedImage } from "@/lib/images/rotate";
import { type NormalizedMemo, parseMemoResponse } from "@/lib/memo/parse";
import { MEMO_PROFILE } from "@/lib/memo/prompt";
import type { MetaErrorCategory, ModelCallInput, ModelCaller } from "@/lib/meta/transport";
import { estimateCostUsd, type TokenUsage } from "@/lib/pricing";
import { type Finding, VALIDATOR_VERSION, validateLedger } from "@/lib/validation/engine";

export type RunStatus = "pending" | "succeeded" | "failed" | "incomplete" | "invalid_output" | "uncertain";

export type DocumentForExtraction = {
  id: string;
  ownerId: string;
  sha256: string;
  storagePath: string;
  mimeType: string;
  /** U4: a company memo photographed with a page. Absent: a page. */
  kind?: "page" | "memo";
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

/** U4: what a memo run records. A memo has no lines to review and no checks of the page's rules. */
export type MemoRunSuccess = Omit<RunSuccess, "extraction" | "findings" | "validatorVersion"> & { memo: NormalizedMemo };

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
  /** The prompt version of this document's latest run of any status, or null if it was never sent. */
  latestPromptVersion(documentId: string): Promise<string | null>;
  /** Model calls of the user's runs started since then (`callsOfRun` per run). */
  countModelCallsSince(since: Date): Promise<number>;
  /** Must be atomic: fails on a duplicate request id or an existing pending run. */
  insertPendingRun(run: NewRun): Promise<{ ok: true; run: RunRecord } | { ok: false; conflict: "request_id" | "pending" }>;
  downloadOriginal(doc: DocumentForExtraction): Promise<Uint8Array>;
  /** Must be atomic: run result, entries, review copies and findings together. */
  completeRun(runId: string, result: RunSuccess): Promise<void>;
  /** U4: a memo's run succeeded; its reading is the run's result. */
  completeMemoRun(runId: string, result: MemoRunSuccess): Promise<void>;
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
  /** P4: a printed Scriba khata page. Absent means the layout of the page's latest run, so a re-read keeps it. */
  layout?: PageLayout;
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

/**
 * Prompt 5 (P3): what this writer's earlier pages taught, ready to send. `key` changes
 * whenever the notes or the reference image change, and is part of the cache key.
 */
export type Personalization = { key: string; text: string; reference: PreparedImage | null };
/** Null when he hasn't switched it on, or there's nothing to send yet. Never sees the page itself. */
export type Personalizer = (doc: DocumentForExtraction) => Promise<Personalization | null>;

export type ImagePreparer = (imageBytes: Uint8Array, mimeType: string, mode: ProcessingMode) => Promise<PreparedImage>;

/**
 * F2 fix 6: puts the reading's line boxes on the rows of writing in the image the model saw. Must
 * never fail a reading: on any trouble it returns the reading as it was.
 */
export type BoxSnapper = (image: PreparedImage, extraction: NormalizedExtraction) => Promise<NormalizedExtraction>;

const originalOnly: ImagePreparer = async (imageBytes, mimeType, mode) => {
  if (mode !== "baseline_original") throw new Error(`No image preparer for ${mode}.`);
  return { imageBytes, mimeType };
};

export async function analyzeDocument(
  deps: {
    repo: ExtractionRepo;
    callModel: ModelCaller;
    now: () => Date;
    prepareImage?: ImagePreparer;
    personalize?: Personalizer;
    /** U3: cuts blocks from the page for a two-pass reading. Without it, a two-pass run sends nothing. */
    cropBlocks?: BlockCropper;
    /** F2 fix 6: without it, the model's boxes are stored as they came. */
    snapBoxes?: BoxSnapper;
  },
  settings: AnalyzeSettings,
  request: AnalyzeRequest,
): Promise<AnalyzeOutcome> {
  const { repo, callModel, now, prepareImage = originalOnly } = deps;
  const processingMode = request.processingMode ?? "baseline_original";
  const doc = await repo.getDocument(request.documentId);
  if (!doc) return { kind: "not_found" };

  // A memo is read with the memo prompt alone: no writer's notes, no khata layout, one call.
  const memo = doc.kind === "memo";
  // Personal notes ride on prompts 4 and 6 (as 5 and 7); a failure to build them means a plain reading.
  const personalProfile = deps.personalize && !memo ? getPersonalProfile() : null;
  const personal = personalProfile ? await deps.personalize!(doc).catch(() => null) : null;
  const layout = memo ? "free" : (request.layout ?? layoutOfPromptVersion(await repo.latestPromptVersion(doc.id)));
  // Two-pass rides on plain prompt 6 only: a khata page or one with the writer's notes is read in one call.
  const { promptVersion, schemaVersion } = memo
    ? MEMO_PROFILE
    : withTwoPass(withLayout(personal ? personalProfile! : getExtractionProfile(), layout));
  const twoPass = isTwoPassVersion(promptVersion);

  const cacheKey = extractionCacheKey({
    ownerId: doc.ownerId,
    imageSha256: doc.sha256,
    modelId: settings.modelId,
    promptVersion,
    schemaVersion,
    processingMode,
    personalKey: personal?.key ?? null,
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
    repo.countModelCallsSince(new Date(nowMs - 60 * 60 * 1000)),
    repo.countModelCallsSince(new Date(nowMs - 24 * 60 * 60 * 1000)),
  ]);
  const mayMake = twoPass ? MAX_RUN_CALLS : 1;
  if (lastHour + mayMake > settings.extractionsPerHour || lastDay + mayMake > settings.extractionsPerDay) {
    return {
      kind: "rate_limited",
      message: `Extraction limit reached (${settings.extractionsPerHour} model calls per hour, ${settings.extractionsPerDay} per day).`,
    };
  }

  const inserted = await repo.insertPendingRun({
    documentId: doc.id,
    ownerId: doc.ownerId,
    requestId: request.requestId,
    cacheKey,
    modelId: settings.modelId,
    promptVersion,
    schemaVersion,
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

  // What was read, and what every call of it spent.
  let read: { extraction: NormalizedExtraction } & Omit<Spent, "rawOutputText"> & { rawOutputText: string | null };
  if (twoPass) {
    if (!deps.cropBlocks) {
      const message = "The photograph could not be prepared for a two-pass reading. No request was sent to Meta.";
      await repo.failRun(runId, { status: "failed", errorCategory: "preparation", errorMessage: message });
      return { kind: "integrity_error", runId, message };
    }
    const reading = await readTwoPass({ callModel, cropBlocks: deps.cropBlocks, modelId: settings.modelId }, prepared);
    if (!reading.ok) {
      const { spent } = reading;
      const recorded = {
        providerResponseId: spent.providerResponseId,
        usage: spent.usage,
        estimatedCostUsd: spent.estimatedCostUsd,
        elapsedMs: spent.elapsedMs,
        rawOutputText: spent.rawOutputText,
      };
      if (reading.kind === "model_failed") {
        await repo.failRun(runId, {
          status: reading.uncertain ? "uncertain" : "failed",
          errorCategory: reading.category,
          errorMessage: reading.message,
          httpStatus: reading.httpStatus,
          ...recorded,
        });
        return { kind: "model_failed", runId, category: reading.category, message: reading.message, uncertain: reading.uncertain };
      }
      if (reading.kind === "unusable_output") {
        await repo.failRun(runId, {
          status: reading.category === "incomplete" ? "incomplete" : "invalid_output",
          errorCategory: reading.category,
          errorMessage: reading.message,
          ...recorded,
        });
        return { kind: "unusable_output", runId, category: reading.category, message: reading.message };
      }
      await repo.failRun(runId, { status: "failed", errorCategory: "preparation", errorMessage: reading.message, ...recorded });
      return { kind: "integrity_error", runId, message: reading.message };
    }
    read = reading;
  } else {
    const called = await callOnce<{ memo: NormalizedMemo } | { extraction: NormalizedExtraction }>(
      { repo, callModel, modelId: settings.modelId, runId },
      {
        ...prepared,
        ...(personal ? { personal: { text: personal.text, reference: personal.reference } } : {}),
        ...(layout === "free" ? {} : { layout }),
        ...(memo ? { memo: true as const } : {}),
      },
      (summary) => {
        const parsed = memo ? parseMemoResponse(summary) : parseModelResponse(summary, { promptVersion, schemaVersion });
        if (!parsed.ok) return parsed;
        return { ok: true, reading: "memo" in parsed ? { memo: parsed.memo } : { extraction: parsed.extraction } };
      },
    );
    if (!called.ok) return called.outcome;
    if ("memo" in called.reading) {
      // A memo is only read here: code matches it to the page when the questions are worked out.
      const { spent, reading } = { spent: called.spent, reading: called.reading.memo };
      return persist(repo, runId, spent, () => repo.completeMemoRun(runId, { ...spent, rawOutputText: spent.rawOutputText ?? "", memo: reading }));
    }
    read = { extraction: called.reading.extraction, ...called.spent };
  }

  // F2 fix 6: the model places lines badly on a long page (up to five lines low on his 4 Nov page 2),
  // so every picture of a line showed another one. The boxes are put on the writing before they
  // are stored; the model's own boxes stay in the raw output.
  if (deps.snapBoxes) {
    const reading = read.extraction;
    read = { ...read, extraction: await deps.snapBoxes(prepared, reading).catch(() => reading) };
  }

  const findings = validateLedger({
    page: pageValuesOf(read.extraction),
    entries: read.extraction.entries.map((e) => ({
      id: e.candidateId,
      line: e.line,
      values: e.values,
      reviewFields: e.reviewFields,
      uncertaintyReason: e.uncertaintyReason,
      excluded: false,
    })),
  });

  return persist(repo, runId, read, () =>
    repo.completeRun(runId, {
      providerResponseId: read.providerResponseId,
      reportedModel: read.reportedModel,
      usage: read.usage,
      estimatedCostUsd: read.estimatedCostUsd,
      elapsedMs: read.elapsedMs,
      rawOutputText: read.rawOutputText ?? "",
      // The version actually sent (prompt 5, a khata layout, two-pass), not only the configured base.
      extraction: { ...read.extraction, promptVersion },
      findings,
      validatorVersion: VALIDATOR_VERSION,
    }),
  );
}

type Spending = Omit<Spent, "rawOutputText"> & { rawOutputText: string | null };
type Parsed<T> = { ok: true; reading: T } | { ok: false; kind: ParseFailureKind; detail: string };

/**
 * One model call and its parse. A failed call or an unusable answer fails the run, with whatever
 * the call spent, and is never retried.
 */
async function callOnce<T>(
  ctx: { repo: ExtractionRepo; callModel: ModelCaller; modelId: string; runId: string },
  input: ModelCallInput,
  parse: (summary: ModelResponseSummary) => Parsed<T>,
): Promise<{ ok: true; reading: T; spent: Spending } | { ok: false; outcome: AnalyzeOutcome }> {
  const { repo, runId } = ctx;
  const result = await ctx.callModel(input);
  if (!result.ok) {
    await repo.failRun(runId, {
      status: result.uncertain ? "uncertain" : "failed",
      errorCategory: result.category,
      errorMessage: result.message,
      httpStatus: result.httpStatus,
      elapsedMs: result.elapsedMs,
    });
    return { ok: false, outcome: { kind: "model_failed", runId, category: result.category, message: result.message, uncertain: result.uncertain } };
  }

  const spent: Spending = {
    providerResponseId: result.providerResponseId,
    reportedModel: result.reportedModel,
    usage: result.usage,
    estimatedCostUsd: estimateCostUsd(ctx.modelId, result.usage),
    elapsedMs: result.elapsedMs,
    rawOutputText: result.summary.outputText,
  };
  const parsed = parse(result.summary);
  if (!parsed.ok) {
    await repo.failRun(runId, {
      status: parsed.kind === "incomplete" ? "incomplete" : "invalid_output",
      errorCategory: parsed.kind,
      errorMessage: parsed.detail,
      providerResponseId: spent.providerResponseId,
      usage: spent.usage,
      estimatedCostUsd: spent.estimatedCostUsd,
      elapsedMs: spent.elapsedMs,
      rawOutputText: spent.rawOutputText,
    });
    return { ok: false, outcome: { kind: "unusable_output", runId, category: parsed.kind, message: parsed.detail } };
  }
  return { ok: true, reading: parsed.reading, spent };
}

/** Save what was read. A failure to save is never reported as success, and keeps what was spent. */
async function persist(repo: ExtractionRepo, runId: string, spent: Spending, complete: () => Promise<void>): Promise<AnalyzeOutcome> {
  try {
    await complete();
  } catch {
    const message =
      "Meta answered, but saving the result failed, so nothing was confirmed. The raw response is kept on the run record for diagnosis where possible.";
    try {
      await repo.failRun(runId, {
        status: "failed",
        errorCategory: "persistence",
        errorMessage: message,
        providerResponseId: spent.providerResponseId,
        usage: spent.usage,
        estimatedCostUsd: spent.estimatedCostUsd,
        elapsedMs: spent.elapsedMs,
        rawOutputText: spent.rawOutputText,
      });
    } catch {
      // The run stays pending and will be reported as uncertain later.
    }
    return { kind: "persistence_error", runId, message };
  }
  return { kind: "completed", runId };
}
