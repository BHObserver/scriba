import { describe, expect, test } from "bun:test";
import type { EntryValues } from "@/lib/ledger/types";
import { type ValidationEntry, validateLedger } from "@/lib/validation/engine";
import { ackFingerprint, assessEntry, decideApproval } from "./approval";

function entry(id: string, line: number, values: Partial<EntryValues>, extra: Partial<ValidationEntry> = {}): ValidationEntry {
  return {
    id,
    line,
    values: {
      sourceText: "",
      type: "credit_sale",
      customer: null,
      item: null,
      quantityText: null,
      unit: null,
      rateText: null,
      amountText: null,
      balanceText: null,
      crossedOut: false,
      ...values,
    },
    reviewFields: [],
    uncertaintyReason: null,
    excluded: false,
    ...extra,
  };
}

const page = { ledgerType: "customer_credit" as const, dateText: null, accountName: null };

describe("approval safety rules", () => {
  test("a clean, fully checked line can be approved without acknowledgements", () => {
    const e = entry("e1", 1, { quantityText: "২", rateText: "৬০", amountText: "১২০" });
    const findings = validateLedger({ page: { ...page, ledgerType: "cash_sales" }, entries: [{ ...e, values: { ...e.values, type: "cash_sale" } }] });
    const decision = decideApproval({ ...e, values: { ...e.values, type: "cash_sale" } }, findings, { findings: [], uncheckable: false });
    expect(decision.ok).toBe(true);
  });

  test("a missing amount is a hard blocker, never zero", () => {
    const e = entry("e1", 1, { amountText: null });
    const { blockers } = assessEntry(e, []);
    expect(blockers.join(" ")).toContain("cannot be approved as zero");
  });

  test("an unreadable amount blocks approval even with acknowledgements", () => {
    const e = entry("e1", 1, { amountText: "১৮?" });
    const findings = validateLedger({ page, entries: [e] });
    const all = findings.map(ackFingerprint);
    expect(decideApproval(e, findings, { findings: all, uncheckable: true }).ok).toBe(false);
  });

  test("an unknown type blocks approval", () => {
    const e = entry("e1", 1, { type: "unknown", amountText: "50" });
    expect(assessEntry(e, []).blockers).toContain("Choose a transaction type.");
  });

  test("a failing check requires an explicit acknowledgement bound to its values", () => {
    const entries = [
      entry("e1", 1, { amountText: "180" }),
      entry("e2", 2, { amountText: "140" }),
      entry("e3", 3, { type: "subtotal", amountText: "310" }),
    ];
    const findings = validateLedger({ page, entries });
    const subtotal = entries[2]!;
    const { needsAck } = assessEntry(subtotal, findings);
    expect(needsAck).toHaveLength(1);

    expect(decideApproval(subtotal, findings, { findings: [], uncheckable: true }).ok).toBe(false);
    const ack = { findings: needsAck.map(ackFingerprint), uncheckable: true };
    expect(decideApproval(subtotal, findings, ack).ok).toBe(true);

    // Editing the amount changes the mismatch; the old acknowledgement no longer applies.
    const edited = entries.map((e) => (e.id === "e1" ? { ...e, values: { ...e.values, amountText: "190" } } : e));
    const newFindings = validateLedger({ page, entries: edited });
    expect(decideApproval(edited[2]!, newFindings, ack).ok).toBe(false);
  });

  test("unverifiable checks need the single 'could not check' acknowledgement", () => {
    const e = entry("e1", 1, { quantityText: "২", amountText: "১২০" }); // no rate
    const findings = validateLedger({ page, entries: [e] });
    expect(assessEntry(e, findings).uncheckable.length).toBeGreaterThan(0);
    expect(decideApproval(e, findings, { findings: [], uncheckable: false }).ok).toBe(false);
    expect(decideApproval(e, findings, { findings: [], uncheckable: true }).ok).toBe(true);
  });

  test("rejected and crossed-out lines cannot be approved", () => {
    expect(assessEntry(entry("e1", 1, { amountText: "5" }, { excluded: true }), []).blockers.length).toBe(1);
    expect(assessEntry(entry("e1", 1, { amountText: "5", crossedOut: true }), []).blockers.length).toBe(1);
  });
});
