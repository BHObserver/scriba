/**
 * Deterministic accounting checks. Pure TypeScript: no Meta, no Supabase, no I/O.
 *
 * Every rule reports pass, fail or unverifiable. A check that cannot run is never
 * reported as passing, and no rule changes, repairs or invents a value. A passing
 * check shows arithmetic consistency only; it does not prove the handwriting was
 * read correctly.
 */
import {
  type EntryValues,
  type PageValues,
  type ReviewableField,
  type TransactionType,
  SALE_TYPES,
} from "@/lib/ledger/types";
import {
  type ParsedNumber,
  formatTaka,
  multiplyQuantityByRate,
  parseMoney,
  parseQuantity,
  parseRate,
} from "@/lib/numerals";

export const VALIDATOR_VERSION = "scriba-validator-1";

export const RULE_IDS = [
  "qty_x_rate",
  "balance_equation",
  "written_total",
  "running_balance",
  "cross_record_continuity",
  "numeral_format",
  "model_uncertainty",
  "classification",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const RULE_LABELS: Record<RuleId, string> = {
  qty_x_rate: "Quantity × rate",
  balance_equation: "Opening → closing balance",
  written_total: "Written total",
  running_balance: "Running balance",
  cross_record_continuity: "Continuity between pages",
  numeral_format: "Number format",
  model_uncertainty: "Model uncertainty",
  classification: "Transaction type",
};

/** Rules that are arithmetic checks (as opposed to reading/uncertainty flags). */
export const ARITHMETIC_RULES: ReadonlySet<RuleId> = new Set([
  "qty_x_rate",
  "balance_equation",
  "written_total",
  "running_balance",
]);

export type FindingStatus = "pass" | "fail" | "unverifiable";
export type Severity = "info" | "warning" | "error";

export type Finding = {
  /** Stable identity across recomputation, used to diff findings after an edit. */
  key: string;
  ruleId: RuleId;
  ruleVersion: number;
  status: FindingStatus;
  severity: Severity;
  entryIds: string[];
  /** Values in poisha when the rule compares money. */
  expected: number | null;
  observed: number | null;
  message: string;
};

export type ValidationEntry = {
  id: string;
  line: number;
  values: EntryValues;
  /** Fields the model said it could not read confidently (cleared by human edits). */
  reviewFields: ReviewableField[];
  uncertaintyReason: string | null;
  /** Rejected by the reviewer: ignored by every rule. */
  excluded: boolean;
};

export type ValidationInput = {
  page: PageValues;
  entries: ValidationEntry[];
};

const RULE_VERSION = 1;

export type EntryNumbers = {
  quantity: ParsedNumber | null;
  rate: ParsedNumber | null;
  amount: ParsedNumber | null;
  balance: ParsedNumber | null;
};

/** Derive normalized numbers from the written text. Null means nothing was written. */
export function deriveNumbers(values: EntryValues): EntryNumbers {
  const has = (t: string | null) => t != null && t.trim().length > 0;
  return {
    quantity: has(values.quantityText) ? parseQuantity(values.quantityText) : null,
    rate: has(values.rateText) ? parseRate(values.rateText) : null,
    amount: has(values.amountText) ? parseMoney(values.amountText) : null,
    balance: has(values.balanceText) ? parseMoney(values.balanceText) : null,
  };
}

function valueOf(p: ParsedNumber | null): number | null {
  return p && p.ok ? p.value : null;
}

type Derived = ValidationEntry & { numbers: EntryNumbers };

function finding(f: Omit<Finding, "ruleVersion" | "key"> & { keySuffix?: string }): Finding {
  const { keySuffix, ...rest } = f;
  const key = `${f.ruleId}:${f.entryIds.join(",")}${keySuffix ? `:${keySuffix}` : ""}`;
  return { ...rest, key, ruleVersion: RULE_VERSION };
}

/** Sign of a transaction in a conventional customer-credit account, or null if unknown. */
function creditAccountSign(type: TransactionType): 1 | -1 | null {
  if (type === "credit_sale") return 1;
  if (type === "repayment") return -1;
  return null;
}

// ---------------------------------------------------------------------------
// Reading checks: number format, model uncertainty, classification
// ---------------------------------------------------------------------------

const NUMERIC_FIELDS: Array<{ field: ReviewableField; key: keyof EntryNumbers; label: string }> = [
  { field: "qty", key: "quantity", label: "Quantity" },
  { field: "rate", key: "rate", label: "Rate" },
  { field: "amount", key: "amount", label: "Amount" },
  { field: "balance", key: "balance", label: "Balance" },
];

const TEXT_OF: Record<keyof EntryNumbers, keyof EntryValues> = {
  quantity: "quantityText",
  rate: "rateText",
  amount: "amountText",
  balance: "balanceText",
};

function readingChecks(e: Derived): Finding[] {
  const out: Finding[] = [];
  for (const { field, key, label } of NUMERIC_FIELDS) {
    const parsed = e.numbers[key];
    if (!parsed) continue;
    const written = String(e.values[TEXT_OF[key]] ?? "");
    if (!parsed.ok) {
      out.push(
        finding({
          ruleId: "numeral_format",
          status: "fail",
          severity: key === "amount" ? "error" : "warning",
          entryIds: [e.id],
          expected: null,
          observed: null,
          keySuffix: field,
          message: `${label} "${written}" could not be read as a single number (${parsed.reason.replaceAll("_", " ")}).`,
        }),
      );
    } else if (parsed.digitStyle === "mixed") {
      out.push(
        finding({
          ruleId: "numeral_format",
          status: "fail",
          severity: "warning",
          entryIds: [e.id],
          expected: null,
          observed: parsed.value,
          keySuffix: field,
          message: `${label} "${written}" mixes Bangla and Arabic digits inside one number; confirm it against the photo.`,
        }),
      );
    }
  }
  for (const field of e.reviewFields) {
    out.push(
      finding({
        ruleId: "model_uncertainty",
        status: "unverifiable",
        severity: "warning",
        entryIds: [e.id],
        expected: null,
        observed: null,
        keySuffix: field,
        message: `The model was unsure about ${field}${e.uncertaintyReason ? `: ${e.uncertaintyReason}` : "."}`,
      }),
    );
  }
  if (e.values.type === "unknown") {
    out.push(
      finding({
        ruleId: "classification",
        status: "unverifiable",
        severity: "warning",
        entryIds: [e.id],
        expected: null,
        observed: null,
        message: "Transaction type is unclear. Choose one before approving.",
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule A: quantity x rate = written amount
// ---------------------------------------------------------------------------

function ruleQuantityTimesRate(e: Derived): Finding | null {
  const { quantity, rate, amount } = e.numbers;
  if (!quantity && !rate) return null; // nothing to multiply on this line
  const base = { ruleId: "qty_x_rate" as const, entryIds: [e.id] };

  const missing: string[] = [];
  if (!quantity) missing.push("quantity");
  else if (!quantity.ok) missing.push("a readable quantity");
  if (!rate) missing.push("rate");
  else if (!rate.ok) missing.push("a readable rate");
  if (!amount) missing.push("amount");
  else if (!amount.ok) missing.push("a readable amount");
  if (missing.length > 0) {
    return finding({
      ...base,
      status: "unverifiable",
      severity: "info",
      expected: null,
      observed: valueOf(amount),
      message: `Cannot check quantity × rate: missing ${missing.join(", ")}.`,
    });
  }
  if (e.reviewFields.includes("unit") || e.reviewFields.includes("qty") || e.reviewFields.includes("rate")) {
    return finding({
      ...base,
      status: "unverifiable",
      severity: "info",
      expected: null,
      observed: valueOf(amount),
      message: "Cannot check quantity × rate until the uncertain quantity, unit or rate is confirmed.",
    });
  }

  const q = valueOf(quantity)!;
  const r = valueOf(rate)!;
  const a = valueOf(amount)!;
  const { poisha: expected, exact } = multiplyQuantityByRate(q, r);
  if (expected === a) {
    return finding({
      ...base,
      status: "pass",
      severity: "info",
      expected,
      observed: a,
      message: `${formatTaka(expected)} matches the written amount${exact ? "" : " (rounded to the nearest poisha)"}.`,
    });
  }
  // A result with a fraction of a taka written rounded to a whole taka is a common,
  // legitimate way of writing. The rounding is stated in the message, never hidden.
  const fractionalTaka = expected % 100 !== 0 || !exact;
  if (fractionalTaka && (Math.floor(expected / 100) * 100 === a || Math.ceil(expected / 100) * 100 === a)) {
    return finding({
      ...base,
      status: "pass",
      severity: "info",
      expected,
      observed: a,
      message: `${formatTaka(expected)} rounds to the written ${formatTaka(a)}.`,
    });
  }
  return finding({
    ...base,
    status: "fail",
    severity: "error",
    expected,
    observed: a,
    message: `Quantity × rate = ${formatTaka(expected)}, but ${formatTaka(a)} is written.`,
  });
}

// ---------------------------------------------------------------------------
// Rule C: a written subtotal equals the contiguous sale lines directly above it
// ---------------------------------------------------------------------------

function ruleWrittenTotals(active: Derived[]): Finding[] {
  const out: Finding[] = [];
  active.forEach((total, index) => {
    if (total.values.type !== "subtotal") return;
    const base = { ruleId: "written_total" as const };
    const observed = valueOf(total.numbers.amount);

    const block: Derived[] = [];
    let boundary: Derived | null = null;
    for (let i = index - 1; i >= 0; i--) {
      const candidate = active[i]!;
      if (SALE_TYPES.has(candidate.values.type)) block.unshift(candidate);
      else {
        boundary = candidate;
        break;
      }
    }
    const ids = [...block.map((b) => b.id), total.id];

    if (observed == null) {
      out.push(
        finding({
          ...base,
          entryIds: ids,
          status: "unverifiable",
          severity: "info",
          expected: null,
          observed: null,
          message: "The written total has no readable amount.",
        }),
      );
      return;
    }
    if (boundary?.values.type === "unknown") {
      out.push(
        finding({
          ...base,
          entryIds: [boundary.id, ...ids],
          status: "unverifiable",
          severity: "info",
          expected: null,
          observed,
          message: "An unclassified line sits directly above this total, so the lines it covers are unclear.",
        }),
      );
      return;
    }
    if (block.length === 0) {
      out.push(
        finding({
          ...base,
          entryIds: ids,
          status: "unverifiable",
          severity: "info",
          expected: null,
          observed,
          message: "No sale lines directly above this total, so there is nothing to add up.",
        }),
      );
      return;
    }
    const unreadable = block.filter((b) => valueOf(b.numbers.amount) == null);
    if (unreadable.length > 0) {
      out.push(
        finding({
          ...base,
          entryIds: ids,
          status: "unverifiable",
          severity: "info",
          expected: null,
          observed,
          message: `${unreadable.length} of the ${block.length} lines above this total have no readable amount.`,
        }),
      );
      return;
    }
    const expected = block.reduce((sum, b) => sum + valueOf(b.numbers.amount)!, 0);
    out.push(
      finding({
        ...base,
        entryIds: ids,
        status: expected === observed ? "pass" : "fail",
        severity: expected === observed ? "info" : "error",
        expected,
        observed,
        message:
          expected === observed
            ? `The ${block.length} lines above add up to the written ${formatTaka(observed)}.`
            : `The ${block.length} lines above add up to ${formatTaka(expected)}, but the total is written as ${formatTaka(observed)}.`,
      }),
    );
  });
  return out;
}

// ---------------------------------------------------------------------------
// Rule B: opening balance + signed transactions = closing balance
// ---------------------------------------------------------------------------

function ruleBalanceEquation(page: PageValues, active: Derived[]): Finding | null {
  const openings = active.filter((e) => e.values.type === "opening_balance");
  const closings = active.filter((e) => e.values.type === "closing_balance");
  if (page.ledgerType !== "customer_credit" && openings.length === 0 && closings.length === 0) return null;

  const base = { ruleId: "balance_equation" as const };
  const unverifiable = (entryIds: string[], message: string, expected: number | null = null): Finding =>
    finding({
      ...base,
      entryIds,
      status: "unverifiable",
      severity: "info",
      expected,
      observed: closings.length === 1 ? valueOf(closings[0]!.numbers.amount) : null,
      message,
    });

  const markerIds = [...openings, ...closings].map((e) => e.id);
  if (page.ledgerType !== "customer_credit") {
    return unverifiable(
      markerIds,
      "The account convention is not known, so the balance cannot be checked. Set the ledger type to customer credit if this page tracks one customer's dues.",
    );
  }
  if (openings.length !== 1) {
    return unverifiable(
      markerIds,
      openings.length === 0 ? "No opening balance is written." : "More than one opening balance is written.",
    );
  }
  if (closings.length > 1) return unverifiable(markerIds, "More than one closing balance is written.");

  const opening = openings[0]!;
  const closing = closings[0] ?? null;
  const openingValue = valueOf(opening.numbers.amount);
  if (openingValue == null) return unverifiable(markerIds, "The opening balance has no readable amount.");

  const endLine = closing ? closing.line : Number.POSITIVE_INFINITY;
  const between = active.filter(
    (e) => e.line > opening.line && e.line < endLine && e.values.type !== "subtotal",
  );
  const ids = [opening.id, ...between.map((e) => e.id), ...(closing ? [closing.id] : [])];

  let running = openingValue;
  for (const e of between) {
    const sign = creditAccountSign(e.values.type);
    if (sign == null) {
      return unverifiable(
        ids,
        `Line ${e.line} is a ${e.values.type.replaceAll("_", " ")}, and its effect on this customer's balance is not defined.`,
      );
    }
    const amount = valueOf(e.numbers.amount);
    if (amount == null) return unverifiable(ids, `Line ${e.line} has no readable amount.`);
    running += sign * amount;
  }

  if (!closing) {
    return unverifiable(
      ids,
      `No closing balance is written. Opening balance and transactions give ${formatTaka(running)}.`,
      running,
    );
  }
  const closingValue = valueOf(closing.numbers.amount);
  if (closingValue == null) return unverifiable(ids, "The closing balance has no readable amount.", running);

  const ok = running === closingValue;
  return finding({
    ...base,
    entryIds: ids,
    status: ok ? "pass" : "fail",
    severity: ok ? "info" : "error",
    expected: running,
    observed: closingValue,
    message: ok
      ? `Opening ${formatTaka(openingValue)} plus sales minus repayments gives the written closing balance ${formatTaka(closingValue)}.`
      : `Opening ${formatTaka(openingValue)} plus sales minus repayments gives ${formatTaka(running)}, but the closing balance is written as ${formatTaka(closingValue)}.`,
  });
}

// ---------------------------------------------------------------------------
// Rule D: running balances written on transaction lines
// ---------------------------------------------------------------------------

function ruleRunningBalance(page: PageValues, active: Derived[]): Finding[] {
  const out: Finding[] = [];
  let current: number | null = null;
  let previousId: string | null = null;

  for (const e of active) {
    const type = e.values.type;
    if (type === "subtotal") continue;
    const recorded = e.numbers.balance ? valueOf(e.numbers.balance) : undefined; // undefined: none written

    if (type === "opening_balance" || type === "closing_balance") {
      current = valueOf(e.numbers.amount);
      previousId = e.id;
      continue;
    }

    if (page.ledgerType === "customer_credit") {
      const sign = creditAccountSign(type);
      const amount = valueOf(e.numbers.amount);
      current = current != null && sign != null && amount != null ? current + sign * amount : null;
    } else {
      current = null;
    }

    if (recorded !== undefined) {
      const ids = previousId ? [previousId, e.id] : [e.id];
      if (recorded == null) {
        out.push(
          finding({
            ruleId: "running_balance",
            entryIds: ids,
            status: "unverifiable",
            severity: "info",
            expected: current,
            observed: null,
            message: "The balance written on this line could not be read.",
          }),
        );
      } else if (current == null) {
        out.push(
          finding({
            ruleId: "running_balance",
            entryIds: ids,
            status: "unverifiable",
            severity: "info",
            expected: null,
            observed: recorded,
            message:
              page.ledgerType === "customer_credit"
                ? "The previous balance or this line's effect is unknown, so the running balance cannot be checked."
                : "The account convention is not known, so the running balance cannot be checked.",
          }),
        );
      } else {
        const ok = current === recorded;
        out.push(
          finding({
            ruleId: "running_balance",
            entryIds: ids,
            status: ok ? "pass" : "fail",
            severity: ok ? "info" : "error",
            expected: current,
            observed: recorded,
            message: ok
              ? `Running balance ${formatTaka(recorded)} follows from the previous balance.`
              : `The previous balance and this line give ${formatTaka(current)}, but ${formatTaka(recorded)} is written.`,
          }),
        );
      }
      // Continue from what is written so each line is judged on its own.
      current = recorded;
      previousId = e.id;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule E: continuity between two records (only when explicitly linked)
// ---------------------------------------------------------------------------

export function checkContinuity(input: {
  previousClosingPoisha: number | null;
  nextOpeningPoisha: number | null;
  sameAccountConfirmed: boolean;
  orderConfirmed: boolean;
  entryIds: string[];
}): Finding {
  const base = { ruleId: "cross_record_continuity" as const, entryIds: input.entryIds };
  if (!input.sameAccountConfirmed || !input.orderConfirmed) {
    return finding({
      ...base,
      status: "unverifiable",
      severity: "info",
      expected: null,
      observed: null,
      message: "These records are not confirmed to be consecutive pages of the same account.",
    });
  }
  if (input.previousClosingPoisha == null || input.nextOpeningPoisha == null) {
    return finding({
      ...base,
      status: "unverifiable",
      severity: "info",
      expected: input.previousClosingPoisha,
      observed: input.nextOpeningPoisha,
      message: "A closing or opening balance is missing.",
    });
  }
  const ok = input.previousClosingPoisha === input.nextOpeningPoisha;
  return finding({
    ...base,
    status: ok ? "pass" : "fail",
    severity: ok ? "info" : "error",
    expected: input.previousClosingPoisha,
    observed: input.nextOpeningPoisha,
    message: ok
      ? "The opening balance carries forward the previous closing balance."
      : `The previous page closes at ${formatTaka(input.previousClosingPoisha)}, but this page opens at ${formatTaka(input.nextOpeningPoisha)}.`,
  });
}

// ---------------------------------------------------------------------------

export function validateLedger(input: ValidationInput): Finding[] {
  const derived: Derived[] = [...input.entries]
    .sort((a, b) => a.line - b.line)
    .map((e) => ({ ...e, numbers: deriveNumbers(e.values) }));
  // Rejected and crossed-out lines take no part in any calculation.
  const active = derived.filter((e) => !e.excluded && !e.values.crossedOut);

  const findings: Finding[] = [];
  for (const e of active) {
    findings.push(...readingChecks(e));
    const a = ruleQuantityTimesRate(e);
    if (a) findings.push(a);
  }
  findings.push(...ruleWrittenTotals(active));
  const b = ruleBalanceEquation(input.page, active);
  if (b) findings.push(b);
  findings.push(...ruleRunningBalance(input.page, active));
  return findings;
}

export type FindingChange = {
  key: string;
  before: Finding | null;
  after: Finding | null;
};

/** Which findings appeared, disappeared or changed status/values after an edit. */
export function diffFindings(before: Finding[], after: Finding[]): FindingChange[] {
  const b = new Map(before.map((f) => [f.key, f]));
  const a = new Map(after.map((f) => [f.key, f]));
  const changes: FindingChange[] = [];
  for (const [key, f] of a) {
    const prev = b.get(key) ?? null;
    if (!prev || prev.status !== f.status || prev.expected !== f.expected || prev.observed !== f.observed) {
      changes.push({ key, before: prev, after: f });
    }
  }
  for (const [key, f] of b) if (!a.has(key)) changes.push({ key, before: f, after: null });
  return changes;
}

export function findingsForEntry(findings: Finding[], entryId: string): Finding[] {
  return findings.filter((f) => f.entryIds.includes(entryId));
}
