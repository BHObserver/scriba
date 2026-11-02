/**
 * The only module that talks to the Meta Model API.
 *
 * - One request per call. SDK retries are disabled: a paid request is never
 *   repeated automatically.
 * - Responses API with a strict JSON Schema (`text.format`), low reasoning effort,
 *   a bounded output budget, and `store: false` so the response is not retained.
 * - Errors are normalized, and every failure says whether the request may still
 *   have been processed (and billed) by Meta.
 *
 * Reads the API key from MetaConfig only; never import this from client code.
 */
import OpenAI from "openai";
import type { MetaConfig } from "@/lib/config";
import type { TokenUsage } from "@/lib/pricing";
import {
  BLOCK_PROFILE,
  EXTRACTION_USER_TEXT,
  LAYOUT_PROFILE,
  LAYOUT_USER_TEXT,
  PERSONAL_PAGE_TEXT,
  type PageLayout,
  getExtractionProfile,
  getPersonalProfile,
  withLayout,
} from "@/lib/extraction/prompt";
import type { ModelResponseSummary } from "@/lib/extraction/parse";
import { MEMO_PROFILE, MEMO_USER_TEXT } from "@/lib/memo/prompt";

export type ModelCallInput = {
  imageBytes: Uint8Array;
  mimeType: string;
  /** Prompt 5 (P3): the writer's notes and, when his lines can be cut from photos, their reference image. */
  personal?: { text: string; reference: { imageBytes: Uint8Array; mimeType: string } | null };
  /** P4: a printed Scriba khata page adds its column layout to the instructions. */
  layout?: PageLayout;
  /**
   * U3: a step of a two-pass reading. "layout" finds the blocks on the whole page; "block" reads
   * one block's crop, with what the layout step found for it. Absent: the whole page in one call.
   */
  pass?: { kind: "layout" } | { kind: "block"; hint: string };
  /** U4: a company memo photographed with a page, read with the memo prompt. */
  memo?: true;
};

export type MetaErrorCategory =
  | "not_configured"
  | "auth"
  | "billing"
  | "forbidden"
  | "model_not_found"
  | "payload_too_large"
  | "content_policy"
  | "invalid_request"
  | "rate_limited"
  | "server_error"
  | "gateway_timeout"
  | "timeout"
  | "network"
  | "unknown";

export type ModelCallSuccess = {
  ok: true;
  providerResponseId: string | null;
  reportedModel: string | null;
  summary: ModelResponseSummary;
  usage: TokenUsage | null;
  elapsedMs: number;
};

export type ModelCallFailure = {
  ok: false;
  category: MetaErrorCategory;
  httpStatus: number | null;
  /** Short, safe-to-display explanation. Never contains credentials. */
  message: string;
  /** True when Meta may have processed the request despite the error. */
  uncertain: boolean;
  elapsedMs: number;
};

export type ModelCallResult = ModelCallSuccess | ModelCallFailure;
export type ModelCaller = (input: ModelCallInput) => Promise<ModelCallResult>;

export function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")}`;
}

/** The exact request body sent to POST /v1/responses (minus the image bytes in tests). */
export function buildExtractionRequest(config: Pick<MetaConfig, "modelId" | "reasoningEffort" | "maxOutputTokens">, input: ModelCallInput) {
  const personal = input.personal && !input.pass && !input.memo ? getPersonalProfile() : null;
  const profile = input.memo
    ? MEMO_PROFILE
    : input.pass?.kind === "layout"
      ? LAYOUT_PROFILE
      : input.pass?.kind === "block"
        ? BLOCK_PROFILE
        : withLayout(personal ?? getExtractionProfile(), input.layout ?? "free");
  const page = { type: "input_image" as const, image_url: toDataUrl(input.imageBytes, input.mimeType) };
  const content = input.memo
    ? [{ type: "input_text" as const, text: MEMO_USER_TEXT }, page]
    : input.pass
      ? [{ type: "input_text" as const, text: input.pass.kind === "layout" ? LAYOUT_USER_TEXT : input.pass.hint }, page]
      : personal && input.personal
        ? [
            { type: "input_text" as const, text: input.personal.text },
            ...(input.personal.reference
              ? [{ type: "input_image" as const, image_url: toDataUrl(input.personal.reference.imageBytes, input.personal.reference.mimeType) }]
              : []),
            { type: "input_text" as const, text: PERSONAL_PAGE_TEXT },
            page,
          ]
        : [{ type: "input_text" as const, text: EXTRACTION_USER_TEXT }, page];
  return {
    model: config.modelId,
    instructions: profile.instructions,
    input: [{ role: "user" as const, content }],
    text: {
      format: {
        type: "json_schema" as const,
        name: profile.schemaName,
        strict: true,
        schema: profile.jsonSchema,
      },
    },
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: config.maxOutputTokens,
    store: false,
    stream: false as const,
  };
}

type RawResponse = {
  id?: string;
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: {
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
    total_tokens?: number;
  } | null;
};

export function summarizeResponse(r: RawResponse): { summary: ModelResponseSummary; usage: TokenUsage | null } {
  let text = typeof r.output_text === "string" ? r.output_text : "";
  let refusal: string | null = null;
  for (const item of r.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "refusal" && part.refusal) refusal = part.refusal;
      if (!r.output_text && part.type === "output_text" && part.text) text += part.text;
    }
  }
  const u = r.usage;
  const usage: TokenUsage | null =
    u && typeof u.input_tokens === "number" && typeof u.output_tokens === "number"
      ? {
          inputTokens: u.input_tokens,
          cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: u.output_tokens,
          reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0,
          totalTokens: u.total_tokens ?? u.input_tokens + u.output_tokens,
        }
      : null;
  return {
    summary: {
      status: r.status ?? null,
      incompleteReason: r.incomplete_details?.reason ?? null,
      outputText: text.length > 0 ? text : null,
      refusal,
    },
    usage,
  };
}

function safeMessage(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(sk|key|sb_secret)[-_][A-Za-z0-9_-]{8,}/g, "[redacted]")
    .slice(0, 300);
}

export function normalizeError(err: unknown, elapsedMs: number): ModelCallFailure {
  const fail = (category: MetaErrorCategory, message: string, uncertain: boolean, httpStatus: number | null = null): ModelCallFailure => ({
    ok: false,
    category,
    httpStatus,
    message,
    uncertain,
    elapsedMs,
  });

  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return fail("timeout", "No response from Meta before the time limit. The request may still have been processed.", true);
  }
  if (err instanceof OpenAI.APIUserAbortError) {
    return fail("timeout", "The request was cancelled before Meta answered. It may still have been processed.", true);
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return fail("network", "The connection to Meta failed. It is not known whether the request was received.", true);
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? null;
    const body = (err.error ?? {}) as { message?: string; code?: string | null; type?: string };
    const detail = safeMessage(body.message ?? err.message);
    const code = body.code ?? err.code ?? null;
    switch (status) {
      case 400:
        return code === "content_policy_violation"
          ? fail("content_policy", `Meta declined the image: ${detail}`, false, status)
          : fail("invalid_request", `Meta rejected the request: ${detail}`, false, status);
      case 401:
        return fail("auth", "Meta rejected the API key. Check META_MODEL_API_KEY.", false, status);
      case 402:
        return fail("billing", "Meta billing is not set up or credits are exhausted.", false, status);
      case 403:
        return fail("forbidden", `This key cannot use the model or feature: ${detail}`, false, status);
      case 404:
        return fail("model_not_found", `Model not found. Check META_MODEL_ID. ${detail}`, false, status);
      case 413:
        return fail("payload_too_large", "The image is too large for an inline request.", false, status);
      case 429:
        return fail("rate_limited", "Meta rate limit reached. Wait a minute, then retry explicitly.", false, status);
      case 504:
        return fail("gateway_timeout", "Meta timed out. The request may still have been processed.", true, status);
      default:
        if (status != null && status >= 500) {
          return fail("server_error", `Meta had a server error (${status}).`, false, status);
        }
        return fail("unknown", `Unexpected response from Meta (${status ?? "no status"}).`, true, status);
    }
  }
  return fail("unknown", "Unexpected error while calling Meta.", true);
}

export function createMetaCaller(config: MetaConfig, opts: { fetch?: typeof fetch } = {}): ModelCaller {
  return async (input) => {
    const started = performance.now();
    if (!config.apiKey) {
      return {
        ok: false,
        category: "not_configured",
        httpStatus: null,
        message: "META_MODEL_API_KEY is not set on the server.",
        uncertain: false,
        elapsedMs: 0,
      };
    }
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: 0, // never repeat a paid request automatically
      timeout: config.timeoutMs,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
    try {
      const response = (await client.responses.create(
        buildExtractionRequest(config, input) as Parameters<typeof client.responses.create>[0],
      )) as unknown as RawResponse;
      const { summary, usage } = summarizeResponse(response);
      return {
        ok: true,
        providerResponseId: response.id ?? null,
        reportedModel: response.model ?? null,
        summary,
        usage,
        elapsedMs: Math.round(performance.now() - started),
      };
    } catch (err) {
      return normalizeError(err, Math.round(performance.now() - started));
    }
  };
}
