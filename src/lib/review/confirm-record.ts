/**
 * The row `scriba_confirm_entries` stores for one approved line. Shared by the confirm route
 * and the demo-shop seed, so sample records are written exactly like real ones.
 */
import { partyLinkFor } from "@/lib/ledger/parties";
import type { PageValues, TransactionType } from "@/lib/ledger/types";
import { ackFingerprint, assessEntry } from "@/lib/review/approval";
import { type ReviewRow, wasCorrected } from "@/lib/review/state";
import { type Finding, type ValidationEntry, deriveNumbers } from "@/lib/validation/engine";

export function confirmRecordFor(
  row: ReviewRow,
  entry: ValidationEntry,
  findings: Finding[],
  page: PageValues,
  pageTypes: readonly TransactionType[],
) {
  const n = deriveNumbers(row.values);
  const ok = (p: typeof n.amount) => (p && p.ok ? p.value : null);
  const { needsAck, uncheckable } = assessEntry(entry, findings);
  const party = partyLinkFor(row.values, page, pageTypes);
  return {
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
    party_kind: party?.kind ?? null,
    party_key: party?.key ?? null,
    party_name: party?.name ?? null,
  };
}

/** Findings as `scriba_confirm_entries` and `scriba_complete_extraction` take them. */
export function findingRows(findings: Finding[]) {
  return findings.map((f) => ({
    finding_key: f.key,
    rule_id: f.ruleId,
    rule_version: f.ruleVersion,
    status: f.status,
    severity: f.severity,
    entry_refs: f.entryIds,
    expected_poisha: f.expected,
    observed_poisha: f.observed,
    message: f.message,
  }));
}
