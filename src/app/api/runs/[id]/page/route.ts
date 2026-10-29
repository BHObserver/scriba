import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { pageValuesSchema } from "@/lib/review/values";

const bodySchema = z.union([
  z.object({ expectedVersion: z.number().int().min(1), values: pageValuesSchema }),
  z.object({ markReviewStarted: z.literal(true) }),
]);

/** Edit page-level values (e.g. the account convention), or record when review began. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/runs/[id]/page">) {
  const { id: runId } = await ctx.params;
  if (!UUID_RE.test(runId)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid page values.", 400);

  if ("markReviewStarted" in parsed.data) {
    // Only the first opening counts; later visits leave the timestamp alone.
    await supabase.from("page_reviews").update({ review_started_at: new Date().toISOString() }).eq("run_id", runId).is("review_started_at", null);
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase
    .from("page_reviews")
    .update({ page_values: parsed.data.values })
    .eq("run_id", runId)
    .eq("version", parsed.data.expectedVersion)
    .select("page_values, version, review_started_at")
    .maybeSingle();
  if (error) return jsonError("The page details could not be saved.", 500);
  if (!data) return jsonError("The page details were changed elsewhere. Reload to continue.", 409);
  return NextResponse.json({ values: data.page_values, version: data.version, reviewStartedAt: data.review_started_at });
}
