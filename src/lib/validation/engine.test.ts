import { describe, expect, test } from "bun:test";
import type { EntryValues, LedgerType, TransactionType } from "@/lib/ledger/types";
import {
  type Finding,
  type ValidationEntry,
  checkContinuity,
  diffFindings,
  validateLedger,
} from "./engine";

type Row = Partial<EntryValues> & { type: TransactionType; review?: ValidationEntry["reviewFields"] };

function ledger(ledgerType: LedgerType, rows: Row[]) {
  const entries: ValidationEntry[] = rows.map((r, i) => ({
    id: `e${i + 1}`,
    line: i + 1,
    values: {
      sourceText: r.sourceText ?? "",
      type: r.type,
      customer: r.customer ?? null,
      item: r.item ?? null,
      quantityText: r.quantityText ?? null,
      unit: r.unit ?? null,
      rateText: r.rateText ?? null,
      amountText: r.amountText ?? null,
      balanceText: r.balanceText ?? null,
      crossedOut: r.crossedOut ?? false,
    },
    reviewFields: r.review ?? [],
    uncertaintyReason: null,
    excluded: false,
  }));
  return { page: { ledgerType, dateText: null, accountName: null }, entries };
}

function byRule(findings: Finding[], ruleId: Finding["ruleId"]) {
  return findings.filter((f) => f.ruleId === ruleId);
}

// The five development samples from the Master Prompt, written as text-only fixtures.
// These test the arithmetic, not the model: they say nothing about reading accuracy.
const sample1 = ledger("customer_credit", [
  { type: "opening_balance", amountText: "১,০০০" },
  { type: "credit_sale", item: "চাল", quantityText: "২", unit: "কেজি", rateText: "৬০", amountText: "১২০" },
  { type: "credit_sale", item: "সাবান", quantityText: "১", unit: "টা", rateText: "৫০", amountText: "৫০" },
  { type: "subtotal", amountText: "১৭০" },
  { type: "repayment", amountText: "২০০" },
  { type: "closing_balance", amountText: "৯৭০" },
]);

const sample4 = ledger("customer_credit", [
  { type: "opening_balance", amountText: "৮০০" },
  { type: "credit_sale", item: "চাল", quantityText: "৩", unit: "কেজি", rateText: "৬০", amountText: "১৮০" },
  { type: "credit_sale", item: "ডাল", quantityText: "১", unit: "কেজি", rateText: "১৪০", amountText: "১৪০" },
  { type: "subtotal", amountText: "৩১০" },
  { type: "repayment", amountText: "১০০" },
  { type: "closing_balance", amountText: "১,০২০" },
]);

const sample5 = ledger("customer_credit", [
  { type: "opening_balance", amountText: "560" },
  { type: "credit_sale", item: "চিনি", quantityText: "২", unit: "কেজি", rateText: "85", amountText: "১৭০" },
  { type: "credit_sale", item: "বিস্কুট", quantityText: "5", unit: "প্যাকেট", rateText: "২০", amountText: "100" },
  { type: "subtotal", amountText: "২৭০" },
  { type: "repayment", amountText: "১০০" },
  { type: "closing_balance", amountText: "৭৩০" },
]);

describe("Rule A: quantity × rate", () => {
  test("correct products pass", () => {
    const f = byRule(validateLedger(sample1), "qty_x_rate");
    expect(f).toHaveLength(2);
    expect(f.every((x) => x.status === "pass")).toBe(true);
    expect(f[0]!.expected).toBe(12000);
  });

  test("an incorrect product fails and keeps the written amount", () => {
    const f = byRule(
      validateLedger(
        ledger("cash_sales", [{ type: "cash_sale", quantityText: "১২", rateText: "১২", amountText: "১৪০" }]),
      ),
      "qty_x_rate",
    );
    expect(f[0]!.status).toBe("fail");
    expect(f[0]!.expected).toBe(14400);
    expect(f[0]!.observed).toBe(14000);
  });

  test("missing rate is unverifiable, never pass", () => {
    const f = byRule(
      validateLedger(ledger("cash_sales", [{ type: "cash_sale", quantityText: "২", amountText: "১২০" }])),
      "qty_x_rate",
    );
    expect(f[0]!.status).toBe("unverifiable");
  });

  test("an uncertain unit makes the check unverifiable", () => {
    const f = byRule(
      validateLedger(
        ledger("cash_sales", [
          { type: "cash_sale", quantityText: "২", rateText: "৬০", amountText: "১২০", review: ["unit"] },
        ]),
      ),
      "qty_x_rate",
    );
    expect(f[0]!.status).toBe("unverifiable");
  });

  test("fractional products may be written rounded to a whole taka", () => {
    const f = byRule(
      validateLedger(ledger("cash_sales", [{ type: "cash_sale", quantityText: "1.5", rateText: "85", amountText: "128" }])),
      "qty_x_rate",
    );
    expect(f[0]!.status).toBe("pass");
    expect(f[0]!.expected).toBe(12750);
  });

  test("lines without quantity or rate produce no quantity check at all", () => {
    expect(byRule(validateLedger(sample1), "qty_x_rate").map((f) => f.entryIds[0])).toEqual(["e2", "e3"]);
  });
});

describe("Rule C: written totals", () => {
  test("a correct subtotal passes (sample 1)", () => {
    const [f] = byRule(validateLedger(sample1), "written_total");
    expect(f!.status).toBe("pass");
    expect(f!.entryIds).toEqual(["e2", "e3", "e4"]);
  });

  test("the intentionally wrong subtotal in sample 4 fails and stays 310", () => {
    const [f] = byRule(validateLedger(sample4), "written_total");
    expect(f!.status).toBe("fail");
    expect(f!.expected).toBe(32000);
    expect(f!.observed).toBe(31000);
    // The subtotal row itself is untouched.
    expect(sample4.entries[3]!.values.amountText).toBe("৩১০");
  });

  test("cash sales total (sample 3)", () => {
    const sample3 = ledger("cash_sales", [
      { type: "cash_sale", item: "ডিম", quantityText: "১২", rateText: "১২", amountText: "১৪৪" },
      { type: "cash_sale", item: "রুটি", quantityText: "৮", rateText: "১৫", amountText: "১২০" },
      { type: "cash_sale", item: "দুধ", quantityText: "৪", rateText: "৪০", amountText: "১৬০" },
      { type: "subtotal", amountText: "৪২৪" },
    ]);
    const findings = validateLedger(sample3);
    expect(byRule(findings, "written_total")[0]!.status).toBe("pass");
    expect(byRule(findings, "qty_x_rate").every((f) => f.status === "pass")).toBe(true);
    // No opening/closing on a cash page: no balance finding is produced at all.
    expect(byRule(findings, "balance_equation")).toHaveLength(0);
  });

  test("a total only covers the contiguous sale lines above it", () => {
    const f = byRule(
      validateLedger(
        ledger("customer_credit", [
          { type: "credit_sale", amountText: "50" },
          { type: "repayment", amountText: "20" },
          { type: "credit_sale", amountText: "30" },
          { type: "credit_sale", amountText: "40" },
          { type: "subtotal", amountText: "70" },
        ]),
      ),
      "written_total",
    );
    expect(f[0]!.status).toBe("pass");
    expect(f[0]!.entryIds).toEqual(["e3", "e4", "e5"]);
  });

  test("an unclassified line above a total makes it unverifiable", () => {
    const f = byRule(
      validateLedger(
        ledger("customer_credit", [
          { type: "unknown", amountText: "50" },
          { type: "subtotal", amountText: "50" },
        ]),
      ),
      "written_total",
    );
    expect(f[0]!.status).toBe("unverifiable");
  });
});

describe("Rule B: opening and closing balance", () => {
  test("sample 1 balances: 1000 + 170 - 200 = 970", () => {
    const [f] = byRule(validateLedger(sample1), "balance_equation");
    expect(f!.status).toBe("pass");
    expect(f!.expected).toBe(97000);
  });

  test("sample 4 closing balance is consistent with item amounts despite the wrong subtotal", () => {
    const [f] = byRule(validateLedger(sample4), "balance_equation");
    expect(f!.status).toBe("pass");
    expect(f!.expected).toBe(102000);
  });

  test("sample 5 with mixed digit styles across fields balances", () => {
    const findings = validateLedger(sample5);
    expect(byRule(findings, "balance_equation")[0]!.status).toBe("pass");
    expect(byRule(findings, "written_total")[0]!.status).toBe("pass");
    expect(byRule(findings, "numeral_format")).toHaveLength(0);
  });

  test("subtotal rows are excluded from transaction sums", () => {
    // If the 310 subtotal were counted, the expected closing would be 1330, not 1020.
    const [f] = byRule(validateLedger(sample4), "balance_equation");
    expect(f!.entryIds).not.toContain("e4");
  });

  test("wrong closing balance fails", () => {
    const rows = structuredClone(sample1);
    rows.entries[5]!.values.amountText = "৯০০";
    const [f] = byRule(validateLedger(rows), "balance_equation");
    expect(f!.status).toBe("fail");
    expect(f!.expected).toBe(97000);
    expect(f!.observed).toBe(90000);
  });

  test("missing closing balance is unverifiable and reports the computed value", () => {
    const rows = structuredClone(sample1);
    rows.entries.pop();
    const [f] = byRule(validateLedger(rows), "balance_equation");
    expect(f!.status).toBe("unverifiable");
    expect(f!.expected).toBe(97000);
  });

  test("missing opening balance is unverifiable", () => {
    const rows = structuredClone(sample1);
    rows.entries.shift();
    const [f] = byRule(validateLedger(rows), "balance_equation");
    expect(f!.status).toBe("unverifiable");
  });

  test("unknown account convention is unverifiable, never pass", () => {
    const rows = structuredClone(sample1);
    rows.page.ledgerType = "unknown";
    const [f] = byRule(validateLedger(rows), "balance_equation");
    expect(f!.status).toBe("unverifiable");
  });

  test("an unknown transaction type between balances is unverifiable", () => {
    const rows = structuredClone(sample1);
    rows.entries[4]!.values.type = "unknown";
    const [f] = byRule(validateLedger(rows), "balance_equation");
    expect(f!.status).toBe("unverifiable");
    expect(byRule(validateLedger(rows), "classification")).toHaveLength(1);
  });

  test("rejected and crossed-out lines take no part", () => {
    const rows = structuredClone(sample1);
    rows.entries.splice(4, 0, {
      id: "x",
      line: 4.5,
      values: { ...rows.entries[4]!.values, amountText: "৫০০", crossedOut: true },
      reviewFields: [],
      uncertaintyReason: null,
      excluded: false,
    });
    expect(byRule(validateLedger(rows), "balance_equation")[0]!.status).toBe("pass");
  });
});

describe("Rule D: running balance", () => {
  const rows = ledger("customer_credit", [
    { type: "opening_balance", amountText: "450" },
    { type: "credit_sale", amountText: "360", balanceText: "810" },
    { type: "credit_sale", amountText: "360", balanceText: "1170" },
    { type: "repayment", amountText: "500", balanceText: "600" },
  ]);

  test("correct balances pass and a discontinuity fails", () => {
    const f = byRule(validateLedger(rows), "running_balance");
    expect(f.map((x) => x.status)).toEqual(["pass", "pass", "fail"]);
    expect(f[2]!.expected).toBe(67000);
    expect(f[2]!.observed).toBe(60000);
  });

  test("unknown convention makes running balances unverifiable", () => {
    const copy = structuredClone(rows);
    copy.page.ledgerType = "unknown";
    expect(byRule(validateLedger(copy), "running_balance").every((f) => f.status === "unverifiable")).toBe(true);
  });
});

describe("Reading checks", () => {
  test("an unreadable amount is flagged as an error", () => {
    const f = byRule(
      validateLedger(ledger("cash_sales", [{ type: "cash_sale", amountText: "১৮?" }])),
      "numeral_format",
    );
    expect(f[0]!.severity).toBe("error");
  });

  test("mixed digit styles inside one number are flagged", () => {
    const f = byRule(validateLedger(ledger("cash_sales", [{ type: "cash_sale", amountText: "১2০" }])), "numeral_format");
    expect(f[0]!.severity).toBe("warning");
  });

  test("model uncertainty becomes a warning per field", () => {
    const f = byRule(
      validateLedger(ledger("cash_sales", [{ type: "cash_sale", amountText: "১২০", review: ["amount", "item"] }])),
      "model_uncertainty",
    );
    expect(f.map((x) => x.key)).toEqual(["model_uncertainty:e1:amount", "model_uncertainty:e1:item"]);
  });
});

describe("Rule E: continuity", () => {
  test("unlinked records are unverifiable even if the numbers agree", () => {
    const f = checkContinuity({
      previousClosingPoisha: 97000,
      nextOpeningPoisha: 97000,
      sameAccountConfirmed: false,
      orderConfirmed: true,
      entryIds: ["a", "b"],
    });
    expect(f.status).toBe("unverifiable");
  });

  test("linked records compare balances", () => {
    const base = { sameAccountConfirmed: true, orderConfirmed: true, entryIds: ["a", "b"] };
    expect(checkContinuity({ ...base, previousClosingPoisha: 97000, nextOpeningPoisha: 97000 }).status).toBe("pass");
    expect(checkContinuity({ ...base, previousClosingPoisha: 97000, nextOpeningPoisha: 90000 }).status).toBe("fail");
  });
});

describe("diffFindings", () => {
  test("editing the subtotal to 320 changes only the written-total finding", () => {
    const before = validateLedger(sample4);
    const edited = structuredClone(sample4);
    edited.entries[3]!.values.amountText = "৩২০";
    const after = validateLedger(edited);
    const changes = diffFindings(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.before!.status).toBe("fail");
    expect(changes[0]!.after!.status).toBe("pass");
  });
});
