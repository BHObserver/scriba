import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { loadRunReview } from "@/lib/server/review-data";
import { createServiceSupabase } from "@/lib/supabase/server";
import { businessDateFor } from "@/lib/ledger/dates";
import { decideApproval } from "@/lib/review/approval";
import { confirmRecordFor, findingRows } from "@/lib/review/confirm-record";
import { toValidationInput } from "@/lib/review/state";
import { VALIDATOR_VERSION, validateLedger } from "@/lib/validation/engine";

const ackSchema = z.object({ findings: z.array(z.string().max(400)).max(50), uncheckable: z.boolean() });
const bodySchema = z.object({
  entries: z
    .array(z.object({ id: z.string().regex(UUID_RE), expectedVersion: z.number().int().min(1), acknowledgements: ackSchema }))
    .min(1)
    .max(200),
});

/**
 * Explicitly approve reviewed lines into Scriba records.
 *
 * Nothing from the client is trusted except which lines the reviewer chose and
 * what they acknowledged: the server reloads the current values, re-runs every
 * validation rule and the approval safety rules, and only then writes the
 * records, atomically and only for the exact versions that were assessed.
 * Each record is linked to its customer or supplier (created on first sight),
 * and the page's business date follows its reviewed written date.
 * A page is counted from one reading only: once lines of one reading are confirmed, lines of
 * another reading of the same page are refused (409 `page_already_confirmed`).
 * A Scriba confirmation is not an accounting journal posting.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[id]/confirm">) {
  const { id: runId } = await ctx.params;
  if (!UUID_RE.test(runId)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid confirmation request.", 400);

  const review = await loadRunReview(supabase, runId);
  if (!review || review.run.status !== "succeeded") return jsonError("Not found.", 404);

  const { data: earlier } = await supabase
    .from("confirmed_records")
    .select("id")
    .eq("document_id", review.run.documentId)
    .neq("run_id", runId)
    .limit(1);
  if (earlier && earlier.length > 0) {
    return jsonError("This page was already confirmed from an earlier reading. Its lines are counted from that reading.", 409, {
      code: "page_already_confirmed",
    });
  }

  const input = toValidationInput(review);
  const findings = validateLedger(input);
  const byId = new Map(review.rows.map((r) => [r.id, r]));
  const pageTypes = review.rows.filter((r) => r.status !== "rejected").map((r) => r.values.type);

  const problems: Array<{ id: string; reasons: string[] }> = [];
  const records = [];
  for (const requested of parsed.data.entries) {
    const row = byId.get(requested.id);
    const entry = input.entries.find((e) => e.id === requested.id);
    if (!row || !entry) {
      problems.push({ id: requested.id, reasons: ["This line does not belong to this extraction."] });
      continue;
    }
    if (row.status !== "draft") {
      problems.push({ id: row.id, reasons: [row.status === "confirmed" ? "Already confirmed." : "This line was rejected."] });
      continue;
    }
    if (row.version !== requested.expectedVersion) {
      problems.push({ id: row.id, reasons: ["This line changed since you checked it. Review it again."] });
      continue;
    }
    const decision = decideApproval(entry, findings, requested.acknowledgements);
    if (!decision.ok) {
      problems.push({ id: row.id, reasons: decision.reasons });
      continue;
    }

    records.push(confirmRecordFor(row, entry, findings, review.page.values, pageTypes));
  }

  if (problems.length > 0) {
    return NextResponse.json({ error: "Some lines cannot be confirmed yet.", problems }, { status: 422 });
  }

  const confirmationId = randomUUID();
  const { data, error } = await createServiceSupabase().rpc("scriba_confirm_entries", {
    p_owner_id: user.id,
    p_run_id: runId,
    p_confirmation_id: confirmationId,
    p_validator_version: VALIDATOR_VERSION,
    p_records: records,
    p_findings: findingRows(findings),
  });
  if (error) {
    if (error.code === "40001") return jsonError("Lines changed while confirming. Nothing was saved; reload and try again.", 409);
    return jsonError("Confirmation failed. Nothing was saved.", 500);
  }

  // Best effort: a failure leaves the capture date, which the shopkeeper can change.
  const { data: doc } = await supabase.from("ledger_documents").select("uploaded_at").eq("id", review.run.documentId).maybeSingle();
  if (doc) {
    const date = businessDateFor(review.page.values.dateText, new Date(doc.uploaded_at as string));
    await supabase
      .from("ledger_documents")
      .update({ business_date: date.iso, business_date_source: date.source })
      .eq("id", review.run.documentId)
      .neq("business_date_source", "user");
  }
  return NextResponse.json({ confirmed: data, confirmationId });
}
