import { NextResponse } from "next/server";
import { z } from "zod";
import { answerQuery, answerRecordIds } from "@/lib/ask/answer";
import { type AskQuery, askVocabulary, parseAskOutput, toAskQuery } from "@/lib/ask/query";
import { getAskConfig, getMetaConfig } from "@/lib/config";
import { dhakaDate } from "@/lib/ledger/dates";
import { createAskCaller } from "@/lib/meta/ask";
import { estimateCostUsd } from "@/lib/pricing";
import { apiUser, jsonError } from "@/lib/server/auth";
import { loadShop } from "@/lib/server/shop-data";
import { createWindowLimiter } from "@/lib/voice/rate-limit";

export const maxDuration = 60;

/** The lines an answer card can open; the count of the rest is still given. */
const MAX_PROOF = 300;

const bodySchema = z.union([z.object({ question: z.string() }), z.object({ query: z.unknown() })]);

let limiter: ReturnType<typeof createWindowLimiter> | null = null;

/**
 * Ask Scriba (P2). `{ question }`: the model maps the words to a query shape (one call, never
 * retried); `{ query }`: a suggestion's shape, answered without the model. Either way code
 * computes the answer from the shop's confirmed records and returns it with the ids of the lines
 * that prove it, newest first. Nothing is saved, and the question is not logged.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);

  const config = getAskConfig();
  const question = "question" in parsed.data ? parsed.data.question.normalize("NFC").replace(/\s+/g, " ").trim() : null;
  if (question !== null) {
    if (!config.enabled) return jsonError("Asking is switched off on this deployment.", 503, { code: "off" });
    if (question.length === 0 || question.length > config.maxQuestionChars) return jsonError("Ask a shorter question.", 400, { code: "length" });
    limiter ??= createWindowLimiter(config);
    const take = limiter.take(auth.user.id);
    if (!take.ok) return jsonError("Too many questions just now.", 429, { code: "busy", retryAfterSeconds: take.retryAfterSeconds });
  }

  const shop = await loadShop(auth.supabase);
  const vocabulary = askVocabulary(shop.book);
  let query: AskQuery | null;
  if (question === null) {
    query = toAskQuery("query" in parsed.data ? parsed.data.query : null, vocabulary);
    if (!query) return jsonError("Invalid question shape.", 400);
  } else {
    const result = await createAskCaller(getMetaConfig(), config)(question, vocabulary);
    if (!result.ok) {
      console.error("ask failed", result.category, result.httpStatus);
      return jsonError(result.message, result.category === "rate_limited" ? 429 : 502, { code: result.category === "rate_limited" ? "busy" : "failed" });
    }
    query = parseAskOutput(result.summary.status === "completed" ? result.summary.outputText : null, vocabulary);
    // Usage and the shape's intent only; the question is the shopkeeper's words and is not logged.
    console.info("ask", {
      intent: query?.intent ?? "unparsed",
      status: result.summary.status,
      usage: result.usage,
      usd: estimateCostUsd(config.modelId, result.usage),
      elapsedMs: result.elapsedMs,
    });
  }

  const answer = query ? answerQuery(shop.book, query, dhakaDate(new Date())) : ({ kind: "unknown" } as const);
  const proof = answerRecordIds(answer, shop.book);
  return new NextResponse(
    // The card needs the proof ids once, in order; the figures' own id lists would only repeat them.
    JSON.stringify({ answer, proof: proof.slice(0, MAX_PROOF), proofCount: proof.length, byModel: question !== null }, (key, value) =>
      key === "recordIds" ? undefined : value,
    ),
    { headers: { "content-type": "application/json", "cache-control": "private, no-store" } },
  );
}
