import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { entryValuesSchema } from "@/lib/review/values";

const bodySchema = z.object({
  /** Insert after this review row; null inserts at the top. */
  afterId: z.string().regex(UUID_RE).nullable(),
  values: entryValuesSchema,
});

/** Add a line the model missed. It is clearly marked as added by the reviewer. */
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[id]/rows">) {
  const { id: runId } = await ctx.params;
  if (!UUID_RE.test(runId)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid line.", 400);

  const { data: run } = await supabase
    .from("extraction_runs")
    .select("id, document_id, status")
    .eq("id", runId)
    .maybeSingle();
  if (!run || run.status !== "succeeded") return jsonError("Not found.", 404);

  const { data: rows } = await supabase.from("entry_reviews").select("id, line_order").eq("run_id", runId).order("line_order");
  const orders = (rows ?? []).map((r) => ({ id: r.id as string, order: Number(r.line_order) }));
  let lineOrder: number;
  if (parsed.data.afterId == null) {
    lineOrder = (orders[0]?.order ?? 1) - 1;
  } else {
    const index = orders.findIndex((r) => r.id === parsed.data.afterId);
    if (index < 0) return jsonError("Unknown position.", 400);
    const next = orders[index + 1];
    lineOrder = next ? (orders[index]!.order + next.order) / 2 : orders[index]!.order + 1;
  }

  const { data: inserted, error } = await supabase
    .from("entry_reviews")
    .insert({
      run_id: runId,
      owner_id: user.id,
      document_id: run.document_id,
      line_order: lineOrder,
      entry_values: parsed.data.values,
      review_fields: [],
      status: "draft",
    })
    .select("id, line_order, entry_values, review_fields, status, version")
    .single();
  if (error || !inserted) return jsonError("The line could not be added.", 500);

  return NextResponse.json(
    {
      id: inserted.id,
      extractedEntryId: null,
      lineOrder: Number(inserted.line_order),
      values: inserted.entry_values,
      reviewFields: inserted.review_fields,
      status: inserted.status,
      version: inserted.version,
      candidate: null,
    },
    { status: 201 },
  );
}
