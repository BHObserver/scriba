import { answerQuestion } from "@/lib/questions/answer";
import { buildQuestions } from "@/lib/questions/engine";
import type { Answer, QuestionInput, QuestionSet } from "@/lib/questions/types";
import type { PageState, ReviewRow } from "@/lib/review/state";
import type { Review } from "./deck-model";
import { type ReviewApi, httpReviewApi, localReviewApi } from "./review-api";

/**
 * The ask deck (B7) saves answers through `POST /api/runs/[id]/answers` (U2), which works the
 * question out again on the server, saves what the answer changes as ordinary review edits and
 * returns the review and the questions left. Lines are still confirmed through the review API's
 * `confirm`, with its approval rules. `review` is the state the answer was given on; only the
 * dev board's in-memory version reads it (the server has its own).
 */
export type AskResult = { ok: true; review: Review; set: QuestionSet } | { ok: false; reason: "stale" | "bad_value" | "failed" };
export type AskApi = ReviewApi & {
  answer: (review: Review, question: string, fingerprint: string, answer: Answer) => Promise<AskResult>;
};

export function httpAskApi(runId: string): AskApi {
  return {
    ...httpReviewApi(runId),
    async answer(_review, question, fingerprint, answer) {
      try {
        const res = await fetch(`/api/runs/${runId}/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, fingerprint, answer }) });
        const json = (await res.json().catch(() => ({}))) as { page?: PageState; rows?: ReviewRow[]; questions?: QuestionSet["questions"]; later?: QuestionSet["later"]; code?: string };
        if (res.status === 409) return { ok: false, reason: "stale" };
        if (res.status === 422) return { ok: false, reason: "bad_value" };
        if (!res.ok || !json.page || !json.rows) return { ok: false, reason: "failed" };
        return { ok: true, review: { page: json.page, rows: json.rows }, set: { questions: json.questions ?? [], later: json.later ?? [] } };
      } catch {
        return { ok: false, reason: "failed" };
      }
    },
  };
}

/** Development only: the engine and the answer rules in memory, so the dev board can be clicked through on a stored reading. */
export function localAskApi(base: Omit<QuestionInput, "page" | "rows">): AskApi {
  const inputOf = (review: Review): QuestionInput => ({ ...base, page: review.page.values, rows: review.rows });
  return {
    ...localReviewApi(),
    async answer(review, question, fingerprint, answer) {
      const outcome = answerQuestion(inputOf(review), question, fingerprint, answer, new Date());
      if (!outcome.ok) return { ok: false, reason: outcome.error === "stale" ? "stale" : outcome.error === "bad_value" ? "bad_value" : "failed" };
      const next: Review = { page: { ...review.page, values: outcome.after.page, version: review.page.version + 1 }, rows: outcome.after.rows };
      return { ok: true, review: next, set: buildQuestions(inputOf(next)) };
    },
  };
}
