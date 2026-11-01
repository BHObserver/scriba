/**
 * Ask Scriba's one model call (P2): a question in, a query shape out.
 *
 * - Responses API, text only, strict JSON Schema with the shop's names and items as the only
 *   choices, a bounded output budget, `store: false`.
 * - One request per question, never retried: a failed question is asked again by the person.
 * - The reply is only a shape; code computes every number the answer shows.
 *
 * Reads the API key from MetaConfig only; never import this from client code.
 */
import OpenAI from "openai";
import type { AskConfig, MetaConfig } from "@/lib/config";
import { ASK_INSTRUCTIONS, ASK_SCHEMA_NAME, askUserText } from "@/lib/ask/prompt";
import { type AskVocabulary, askJsonSchema } from "@/lib/ask/query";
import { type ModelCallResult, normalizeError, summarizeResponse } from "./transport";

export type AskCaller = (question: string, vocabulary: AskVocabulary) => Promise<ModelCallResult>;

/** The exact request body sent to POST /v1/responses. */
export function buildAskRequest(config: Pick<AskConfig, "modelId" | "reasoningEffort" | "maxOutputTokens">, question: string, vocabulary: AskVocabulary) {
  return {
    model: config.modelId,
    instructions: ASK_INSTRUCTIONS,
    input: [{ role: "user" as const, content: [{ type: "input_text" as const, text: askUserText(question, vocabulary) }] }],
    text: { format: { type: "json_schema" as const, name: ASK_SCHEMA_NAME, strict: true, schema: askJsonSchema(vocabulary) } },
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: config.maxOutputTokens,
    store: false,
    stream: false as const,
  };
}

export function createAskCaller(meta: Pick<MetaConfig, "apiKey" | "baseURL">, config: AskConfig, opts: { fetch?: typeof fetch } = {}): AskCaller {
  return async (question, vocabulary) => {
    const started = performance.now();
    if (!meta.apiKey) {
      return { ok: false, category: "not_configured", httpStatus: null, message: "META_MODEL_API_KEY is not set on the server.", uncertain: false, elapsedMs: 0 };
    }
    const client = new OpenAI({
      apiKey: meta.apiKey,
      baseURL: meta.baseURL,
      maxRetries: 0, // never repeat a paid request automatically
      timeout: config.timeoutMs,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
    try {
      const response = (await client.responses.create(
        buildAskRequest(config, question, vocabulary) as Parameters<typeof client.responses.create>[0],
      )) as unknown as Parameters<typeof summarizeResponse>[0];
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
