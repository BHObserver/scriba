import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { entryValuesSchema, remainingReviewFields, reviewableFieldSchema } from "@/lib/review/values";

const bodySchema = z.object({
  expectedVersion: z.number().int().min(1),
  values: entryValuesSchema.optional(),
  status: z.enum(["draft", "rejected"]).optional(),
  /** Fields the reviewer has checked against the photo without changing them. */
  markChecked: z.array(reviewableFieldSchema).optional(),
});

/**
 * Save a reviewer's correction to one line. Runs as the user (RLS); the database
 * records the previous and new values in the audit trail. Never calls Meta.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/reviews/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid correction.", 400);
  const { expectedVersion, values, status, markChecked } = parsed.data;

  const { data: current } = await supabase
    .from("entry_reviews")
    .select("id, entry_values, review_fields, status, version")
    .eq("id", id)
    .maybeSingle();
  if (!current) return jsonError("Not found.", 404);
  if (current.status === "confirmed") return jsonError("This line is already confirmed and can no longer be edited.", 409);
  if (current.version !== expectedVersion) {
    return jsonError("This line was changed elsewhere. Reload to see the latest version.", 409);
  }

  const before = entryValuesSchema.parse(current.entry_values);
  let reviewFields = current.review_fields ?? [];
  const patch: Record<string, unknown> = {};
  if (values) {
    patch.entry_values = values;
    reviewFields = remainingReviewFields(reviewFields, before, values);
  }
  if (markChecked) reviewFields = reviewFields.filter((f: string) => !markChecked.includes(f as never));
  patch.review_fields = reviewFields;
  if (status) patch.status = status;

  const { data: updated, error } = await supabase
    .from("entry_reviews")
    .update(patch)
    .eq("id", id)
    .eq("version", expectedVersion)
    .select("id, entry_values, review_fields, status, version")
    .maybeSingle();
  if (error) return jsonError("The correction could not be saved.", 500);
  if (!updated) return jsonError("This line was changed elsewhere. Reload to see the latest version.", 409);

  return NextResponse.json({
    id: updated.id,
    values: updated.entry_values,
    reviewFields: updated.review_fields,
    status: updated.status,
    version: updated.version,
  });
}
