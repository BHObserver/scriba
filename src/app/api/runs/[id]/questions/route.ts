import { NextResponse } from "next/server";
import { buildQuestions } from "@/lib/questions/engine";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { loadQuestionInput } from "@/lib/server/questions-data";

/** What Scriba asks about this reading now, in order (U2). Reads only; never calls Meta. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/questions">) {
  const { id: runId } = await ctx.params;
  if (!UUID_RE.test(runId)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const loaded = await loadQuestionInput(auth.supabase, runId);
  if (!loaded) return jsonError("Not found.", 404);
  return NextResponse.json(buildQuestions(loaded.input));
}
