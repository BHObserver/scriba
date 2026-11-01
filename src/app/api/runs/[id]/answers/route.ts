import { NextResponse } from "next/server";
import { z } from "zod";
import { type AnswerError, answerQuestion } from "@/lib/questions/answer";
import { buildQuestions } from "@/lib/questions/engine";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { loadQuestionInput, saveAnswer } from "@/lib/server/questions-data";

const bodySchema = z.object({
  question: z.string().min(1).max(120),
  /** The fingerprint of the question as it was shown. */
  fingerprint: z.string().min(1).max(40),
  answer: z.union([z.object({ option: z.string().min(1).max(60) }), z.object({ value: z.string().min(1).max(200) })]),
});

const ERRORS: Record<AnswerError, { status: number; message: string }> = {
  stale: { status: 409, message: "This question has changed. Reload to see it again." },
  unknown_option: { status: 400, message: "That isn't one of the answers." },
  local: { status: 400, message: "That answer has nothing to save." },
  no_input: { status: 400, message: "This question takes one of its answers, not a typed one." },
  bad_value: { status: 422, message: "That value can't be used here." },
};

/**
 * Answer one of Scriba's questions (U2). The server works the questions out again from the
 * saved review and refuses an answer to a question that changed since it was shown. What the
 * answer changes comes from the server's own question, never from the client, and is saved as
 * ordinary review edits (audited by the database). Nothing is confirmed here: lines are still
 * confirmed through /confirm and its approval rules. Never calls Meta.
 *
 * Returns the saved review and the questions that are left.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[id]/answers">) {
  const { id: runId } = await ctx.params;
  if (!UUID_RE.test(runId)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid answer.", 400);
  const { question, fingerprint, answer } = parsed.data;

  const loaded = await loadQuestionInput(supabase, runId, { dues: false });
  if (!loaded) return jsonError("Not found.", 404);
  const outcome = answerQuestion(loaded.input, question, fingerprint, answer, new Date());
  if (!outcome.ok) {
    const e = ERRORS[outcome.error];
    return jsonError(e.message, e.status, { code: outcome.error });
  }

  const saved = await saveAnswer(supabase, user.id, loaded.review, outcome.after);
  if (!saved.ok) return jsonError(saved.message, saved.status, { code: saved.status === 409 ? "stale" : "failed" });

  const reloaded = await loadQuestionInput(supabase, runId);
  if (!reloaded) return jsonError("Not found.", 404);
  return NextResponse.json({ page: reloaded.review.page, rows: reloaded.review.rows, ...buildQuestions(reloaded.input) });
}
