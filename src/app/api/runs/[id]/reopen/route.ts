import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { loadRunReview } from "@/lib/server/review-data";
import { createServiceSupabase } from "@/lib/supabase/server";

const previewSchema = z.object({
  latest: z.boolean(),
  record_ids: z.array(z.string()),
  business_date: z.string(),
  closed_days: z.array(z.string()),
});
const resultSchema = z.object({
  records: z.number(),
  lines: z.number(),
  business_date: z.string(),
  closed_days: z.array(z.string()),
});

const REFUSED: Record<string, string> = {
  not_latest: "This page was read again since. Open its latest reading to fix it.",
  not_confirmed: "This page has nothing in the khata to reopen.",
};

/** The run, checked through his own client (RLS): only his own, finished readings. */
async function ownReading(runId: string) {
  if (!UUID_RE.test(runId)) return { ok: false as const, response: jsonError("Not found.", 404) };
  const auth = await apiUser();
  if (!auth.ok) return auth;
  const { data: run } = await auth.supabase.from("extraction_runs").select("id, status").eq("id", runId).maybeSingle();
  if (!run || run.status !== "succeeded") return { ok: false as const, response: jsonError("Not found.", 404) };
  return { ok: true as const, ownerId: auth.user.id, supabase: auth.supabase };
}

/**
 * What reopening this page would do (T4), so the app can warn before he taps. Changes nothing.
 * `records`: how many of the page's figures would leave the khata. `closedDays`: the closed days
 * that hold the page; their closes keep the old figures. `reason` says why it can't be reopened.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/reopen">) {
  const { id: runId } = await ctx.params;
  const own = await ownReading(runId);
  if (!own.ok) return own.response;

  const { data, error } = await createServiceSupabase().rpc("scriba_reopen_preview", { p_owner_id: own.ownerId, p_run_id: runId });
  if (error) return error.code === "P0002" ? jsonError("Not found.", 404) : jsonError("Could not read this page.", 500);
  const preview = previewSchema.parse(data);
  const records = preview.record_ids.length;
  const reason = !preview.latest ? "not_latest" : records === 0 ? "not_confirmed" : null;
  return NextResponse.json({
    canReopen: reason === null,
    reason,
    records,
    businessDate: preview.business_date,
    closedDays: preview.closed_days,
    dayClosed: preview.closed_days.length > 0,
  });
}

/**
 * Reopen a confirmed page (T4), so it can be fixed and confirmed again.
 *
 * All at once in `scriba_reopen_page`: every record the page has leaves the khata (whichever of
 * its readings it was confirmed from), its confirmed lines become drafts, the page is back to
 * "extracted", and the audit trail keeps each record that left, as it was. His values and answers
 * stay. Confirming again goes through the confirm route and its approval rules, as the first time.
 *
 * Only from the page's latest reading, the one the check screen shows (409 `not_latest`), and only
 * when the page has something in the khata (409 `not_confirmed`). A closed day keeps its close;
 * `dayClosed` says the page was in one. The owner is checked through his own client, then again by
 * the database with the service role, as confirm does.
 *
 * Returns the review as it now is (`page`, `rows`: every line a draft again, with its new version),
 * so the check screen can go on without reloading (T5).
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/reopen">) {
  const { id: runId } = await ctx.params;
  const own = await ownReading(runId);
  if (!own.ok) return own.response;

  const { data, error } = await createServiceSupabase().rpc("scriba_reopen_page", { p_owner_id: own.ownerId, p_run_id: runId });
  if (error) {
    if (error.code === "P0002") return jsonError("Not found.", 404);
    if (error.code === "55000" && Object.hasOwn(REFUSED, error.hint)) return jsonError(REFUSED[error.hint]!, 409, { code: error.hint });
    if (error.code === "53400") return jsonError("Too many pages reopened just now.", 429, { code: "busy" });
    return jsonError("Reopening failed. Nothing was changed.", 500);
  }
  const result = resultSchema.parse(data);
  const review = await loadRunReview(own.supabase, runId);
  return NextResponse.json({
    page: review?.page ?? null,
    rows: review?.rows ?? null,
    reopened: result.records,
    lines: result.lines,
    businessDate: result.business_date,
    closedDays: result.closed_days,
    dayClosed: result.closed_days.length > 0,
  });
}
