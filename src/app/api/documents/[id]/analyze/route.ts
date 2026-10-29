import { NextResponse } from "next/server";
import { z } from "zod";
import { getLimitsConfig } from "@/lib/config";
import { PROCESSING_MODES } from "@/lib/images/orientation";
import { runAnalyze } from "@/lib/server/analyze";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";

// One model request can take a while for a full page; it is never retried.
export const maxDuration = 300;

const bodySchema = z.object({
  requestId: z.string().regex(UUID_RE),
  mode: z.enum(["use_cache", "fresh"]).default("use_cache"),
  processingMode: z.enum(PROCESSING_MODES).default("baseline_original"),
});

/** The explicit "Analyze handwriting" action: the only route that can spend Meta credits. */
export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/analyze">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const allowed = getLimitsConfig().extractionAllowedEmails;
  if (allowed.length > 0 && !allowed.includes((auth.user.email ?? "").toLowerCase())) {
    return jsonError("This account is not allowed to start paid extractions on this deployment.", 403);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);

  let outcome;
  try {
    outcome = await runAnalyze(auth.supabase, auth.user.id, { documentId: id, ...parsed.data });
  } catch (err) {
    console.error("analyze failed", err instanceof Error ? err.message : "unknown error");
    return jsonError("Scriba could not start the extraction. No result was recorded.", 500);
  }

  switch (outcome.kind) {
    case "not_found":
      return jsonError("Not found.", 404);
    case "completed":
    case "cached":
    case "duplicate_request":
      return NextResponse.json(outcome);
    case "in_progress":
      return NextResponse.json({ ...outcome, message: "This photo is already being analyzed." }, { status: 409 });
    case "previous_uncertain":
      return NextResponse.json(outcome, { status: 409 });
    case "rate_limited":
      return NextResponse.json(outcome, { status: 429 });
    case "integrity_error":
      return NextResponse.json(outcome, { status: 409 });
    case "model_failed":
      return NextResponse.json(outcome, { status: 502 });
    case "unusable_output":
      return NextResponse.json(outcome, { status: 422 });
    case "persistence_error":
      return NextResponse.json(outcome, { status: 500 });
  }
}
