/**
 * Safety rules for approving a candidate entry into a Scriba record.
 * Used by the review UI to explain what is needed, and re-run on the server
 * at confirmation time so the client is never trusted.
 */
import type { Finding, ValidationEntry } from "@/lib/validation/engine";
import { deriveNumbers, findingsForEntry } from "@/lib/validation/engine";

export type Acknowledgements = {
  /** Fingerprints (see ackFingerprint) of individual problems the reviewer accepted. */
  findings: string[];
  /** The reviewer accepts that some checks could not be run for this entry. */
  uncheckable: boolean;
};

export type ApprovalAssessment = {
  /** Hard stops. These must be fixed by editing; they cannot be acknowledged away. */
  blockers: string[];
  /** Problems the reviewer must look at and accept one by one. */
  needsAck: Finding[];
  /** Informational "could not check" results, accepted with a single acknowledgement. */
  uncheckable: Finding[];
};

/**
 * An acknowledgement is bound to the exact values it was given for, so editing an
 * amount after acknowledging a mismatch requires acknowledging the new state again.
 */
export function ackFingerprint(f: Finding): string {
  return `${f.key}|${f.status}|${f.expected ?? "-"}|${f.observed ?? "-"}`;
}

export function assessEntry(entry: ValidationEntry, allFindings: Finding[]): ApprovalAssessment {
  const blockers: string[] = [];
  const v = entry.values;

  if (entry.excluded) blockers.push("This line was rejected. Restore it before approving.");
  if (v.crossedOut) blockers.push("Crossed-out lines are excluded. Clear the crossed-out mark or reject the line.");
  if (v.type === "unknown") blockers.push("Choose a transaction type.");

  const numbers = deriveNumbers(v);
  if (!numbers.amount) {
    blockers.push("No amount is recorded. A missing amount cannot be approved as zero.");
  } else if (!numbers.amount.ok) {
    blockers.push("The amount could not be read as a number. Correct it first.");
  }

  const own = findingsForEntry(allFindings, entry.id);
  const needsAck = own.filter(
    (f) => f.status === "fail" || f.severity === "warning" || f.severity === "error",
  );
  const uncheckable = own.filter((f) => f.status === "unverifiable" && f.severity === "info");
  return { blockers, needsAck, uncheckable };
}

export type ApprovalDecision = { ok: true } | { ok: false; reasons: string[] };

export function decideApproval(
  entry: ValidationEntry,
  allFindings: Finding[],
  acks: Acknowledgements,
): ApprovalDecision {
  const { blockers, needsAck, uncheckable } = assessEntry(entry, allFindings);
  const reasons = [...blockers];
  const accepted = new Set(acks.findings);
  for (const f of needsAck) {
    if (!accepted.has(ackFingerprint(f))) reasons.push(`Not acknowledged: ${f.message}`);
  }
  if (uncheckable.length > 0 && !acks.uncheckable) {
    reasons.push("Acknowledge that some checks could not be run for this line.");
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
