import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { loadRunReview } from "@/lib/server/review-data";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ackFingerprint, assessEntry, decideApproval } from "@/lib/review/approval";
import { toValidationInput, wasCorrected } from "@/lib/review/state";
import { VALIDATOR_VERSION, deriveNumbers, validateLedger } from "@/lib/validation/engine";

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

  const input = toValidationInput(review);
  const findings = validateLedger(input);
  const byId = new Map(review.rows.map((r) => [r.id, r]));

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

    const n = deriveNumbers(row.values);
    const ok = (p: typeof n.amount) => (p && p.ok ? p.value : null);
    const { needsAck, uncheckable } = assessEntry(entry, findings);
    records.push({
      entry_review_id: row.id,
      expected_version: row.version,
      transaction_type: row.values.type,
      source_text: row.values.sourceText,
      customer_alias: row.values.customer,
      item_name: row.values.item,
      quantity_text: row.values.quantityText,
      quantity_milli: ok(n.quantity),
      unit: row.values.unit,
      unit_rate_text: row.values.rateText,
      unit_rate_poisha: ok(n.rate),
      amount_text: row.values.amountText,
      amount_poisha: ok(n.amount),
      balance_text: row.values.balanceText,
      balance_poisha: ok(n.balance),
      was_corrected: wasCorrected(row),
      acknowledgements: {
        accepted: needsAck.map((f) => ({ fingerprint: ackFingerprint(f), rule: f.ruleId, message: f.message })),
        uncheckable: uncheckable.length > 0 ? uncheckable.map((f) => f.ruleId) : [],
      },
    });
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
    p_findings: findings.map((f) => ({
      finding_key: f.key,
      rule_id: f.ruleId,
      rule_version: f.ruleVersion,
      status: f.status,
      severity: f.severity,
      entry_refs: f.entryIds,
      expected_poisha: f.expected,
      observed_poisha: f.observed,
      message: f.message,
    })),
  });
  if (error) {
    if (error.code === "40001") return jsonError("Lines changed while confirming. Nothing was saved; reload and try again.", 409);
    return jsonError("Confirmation failed. Nothing was saved.", 500);
  }
  return NextResponse.json({ confirmed: data, confirmationId });
}
