import { NextResponse } from "next/server";
import { z } from "zod";
import { groundTruthSchema } from "@/lib/evaluation/ground-truth";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";

const bodySchema = z.object({ documentId: z.string().regex(UUID_RE), annotation: z.unknown() });

/**
 * Store a new version of the ground truth for one photograph. Versions are
 * immutable; a correction is a new version, so earlier evaluations stay reproducible.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Invalid request.", 400);
  const annotation = groundTruthSchema.safeParse(body.data.annotation);
  if (!annotation.success) {
    const issues = annotation.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return jsonError("The ground truth does not match the expected format.", 400, { issues });
  }

  const { data: doc } = await supabase.from("ledger_documents").select("id").eq("id", body.data.documentId).maybeSingle();
  if (!doc) return jsonError("Not found.", 404);

  const { data: latest } = await supabase
    .from("ground_truth_annotations")
    .select("gt_version")
    .eq("document_id", doc.id)
    .order("gt_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("ground_truth_annotations")
    .insert({ owner_id: user.id, document_id: doc.id, gt_version: (latest?.gt_version ?? 0) + 1, annotation: annotation.data })
    .select("id, gt_version")
    .single();
  if (error || !data) return jsonError("The ground truth could not be saved.", 500);
  return NextResponse.json({ id: data.id, version: data.gt_version }, { status: 201 });
}
