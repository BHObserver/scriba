/**
 * Deterministic accounting checks. Pure TypeScript: no Meta, no Supabase, no I/O.
 *
 * Every rule reports pass, fail or unverifiable. A check that cannot run is never
 * reported as passing, and no rule changes, repairs or invents a value. A passing
 * check shows arithmetic consistency only; it does not prove the handwriting was
 * read correctly.
 */
import { blockPartyKind, groupByBlock, isUnpricedGoods, pageBlocks } from "@/lib/ledger/blocks";
import type { PartyKind } from "@/lib/ledger/parties";
import {
  type BlockValues,
  type EntryValues,
  type PageValues,
  type ReviewableField,
  type TransactionType,
  MONEY_OUT_TYPES,
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

/** Version 3: on a page read in blocks, the balance, total and running-balance rules run per block. */
export const VALIDATOR_VERSION = "scriba-validator-3";

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
  /** The block the finding is about, on a page read in blocks. */
  block?: string;
  /** Why a check could not run, for the questions Scriba asks (U2). */
  reason?: UnverifiableReason;
};

export type UnverifiableReason =
  | "unknown_convention"
  | "no_opening"
  | "several_openings"
  | "several_closings"
  | "unreadable_amount"
  | "undefined_effect"
  | "unpriced_goods"
  | "no_closing";

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

function finding(f: Omit<Finding, "ruleVersion" | "key" | "block"> & { keySuffix?: string }): Finding {
  const { keySuffix, ...rest } = f;
  const key = `${f.ruleId}:${f.entryIds.join(",")}${keySuffix ? `:${keySuffix}` : ""}`;
  return { ...rest, key, ruleVersion: RULE_VERSION };
}

/** Which itemized lines a written subtotal may add up; null for every other type. */
function itemizedFamily(type: TransactionType): "sale" | "money_out" | null {
  if (SALE_TYPES.has(type)) return "sale";
  if (MONEY_OUT_TYPES.has(type)) return "money_out";
  return null;
}

/**
 * Sign of a transaction in an account, or null if its effect is not defined. A customer's due
 * grows with credit sales and shrinks with repayments; what the shop owes a supplier grows
 * with goods taken on credit and shrinks with payments.
 */
export function accountSign(convention: PartyKind | null, type: TransactionType): 1 | -1 | null {
  if (convention === "customer") return type === "credit_sale" ? 1 : type === "repayment" ? -1 : null;
  if (convention === "supplier") return type === "credit_purchase" ? 1 : type === "supplier_payment" ? -1 : null;
  return null;
}

const ACCOUNT_WORDS: Record<PartyKind, { added: string; paid: string }> = {
  customer: { added: "sales", paid: "repayments" },
  supplier: { added: "goods taken", paid: "payments" },
};

/**
 * The lines the balance rules read together: the whole page, or one block. The convention is
 * whose account it is (null: not an account, or unknown); `isAccount` says the balance
 * equation runs even when no balance is written.
 */
type Group = { block: BlockValues | null; convention: PartyKind | null; isAccount: boolean; entries: Derived[] };

function groupsOf(page: PageValues, active: Derived[]): Group[] {
  const inBlocks = pageBlocks(page).length > 0;
  return groupByBlock(page, active).map(({ block, entries }) => {
    if (block) {
      const convention = blockPartyKind(block.kind);
      return { block, convention, isAccount: convention != null, entries };
    }
    if (inBlocks) return { block: null, convention: null, isAccount: false, entries };
    const customer = page.ledgerType === "customer_credit";
    return { block: null, convention: customer ? "customer" : null, isAccount: customer, entries };
  });
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

    // The block is the run of itemized lines of one family directly above the
    // total: sales (cash or credit), or money out (purchases, supplier payments, expenses).
    const block: Derived[] = [];
    let boundary: Derived | null = null;
    const blockFamily = index > 0 ? itemizedFamily(active[index - 1]!.values.type) : null;
    for (let i = index - 1; i >= 0; i--) {
      const candidate = active[i]!;
      if (blockFamily != null && itemizedFamily(candidate.values.type) === blockFamily) block.unshift(candidate);
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
          message: "No sale or money-out lines directly above this total, so there is nothing to add up.",
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

function ruleBalanceEquation(g: Group): Finding | null {
  const active = g.entries;
  if (active.length === 0) return null;
  const openings = active.filter((e) => e.values.type === "opening_balance");
  const closings = active.filter((e) => e.values.type === "closing_balance");
  if (!g.isAccount && openings.length === 0 && closings.length === 0) return null;

  // Block findings carry the block id in their key; page findings keep their old keys, so
  // acknowledgements given before blocks existed still match.
  const base = { ruleId: "balance_equation" as const, ...(g.block ? { keySuffix: g.block.id } : {}) };
  const unverifiable = (entryIds: string[], message: string, reason: UnverifiableReason, expected: number | null = null): Finding =>
    finding({
      ...base,
      entryIds,
      status: "unverifiable",
      severity: "info",
      expected,
      observed: closings.length === 1 ? valueOf(closings[0]!.numbers.amount) : null,
      message,
      reason,
    });

  const markerIds = [...openings, ...closings].map((e) => e.id);
  const convention = g.convention;
  if (convention == null) {
    return unverifiable(
      markerIds,
      g.block
        ? "This part of the page is not an account, so its balance cannot be checked. Say whose account it is if it tracks a customer's or a supplier's dues."
        : "The account convention is not known, so the balance cannot be checked. Set the ledger type to customer credit if this page tracks one customer's dues.",
      "unknown_convention",
    );
  }
  if (openings.length !== 1) {
    return openings.length === 0
      ? unverifiable(markerIds, "No opening balance is written.", "no_opening")
      : unverifiable(markerIds, "More than one opening balance is written.", "several_openings");
  }
  if (closings.length > 1) return unverifiable(markerIds, "More than one closing balance is written.", "several_closings");

  const opening = openings[0]!;
  const closing = closings[0] ?? null;
  const openingValue = valueOf(opening.numbers.amount);
  if (openingValue == null) return unverifiable(markerIds, "The opening balance has no readable amount.", "unreadable_amount");

  const endLine = closing ? closing.line : Number.POSITIVE_INFINITY;
  const between = active.filter(
    (e) => e.line > opening.line && e.line < endLine && e.values.type !== "subtotal",
  );
  const ids = [opening.id, ...between.map((e) => e.id), ...(closing ? [closing.id] : [])];
  const words = ACCOUNT_WORDS[convention];
  const whose = convention === "customer" ? "this customer's balance" : "what the shop owes this supplier";

  let running = openingValue;
  const unpriced: Derived[] = [];
  for (const e of between) {
    const sign = accountSign(convention, e.values.type);
    if (sign == null) {
      return unverifiable(
        ids,
        e.values.type === "unknown"
          ? `Line ${e.line} has no transaction type yet, so its effect on ${whose} is not known.`
          : `Line ${e.line} is a ${e.values.type.replaceAll("_", " ")}, and its effect on ${whose} is not defined.`,
        "undefined_effect",
      );
    }
    // Goods with no price are a gap to fill, never a zero.
    if (sign === 1 && isUnpricedGoods(e.values)) {
      unpriced.push(e);
      continue;
    }
    const amount = valueOf(e.numbers.amount);
    if (amount == null) return unverifiable(ids, `Line ${e.line} has no readable amount.`, "unreadable_amount");
    running += sign * amount;
  }

  if (unpriced.length > 0) {
    const lines = unpriced.map((e) => e.line).join(", ");
    return unverifiable(
      ids,
      `Opening ${formatTaka(openingValue)} plus ${words.added} minus ${words.paid} gives ${formatTaka(running)} so far. The goods on line${unpriced.length === 1 ? "" : "s"} ${lines} ${unpriced.length === 1 ? "has" : "have"} no price yet, so the balance is ${formatTaka(running)} plus their price.`,
      "unpriced_goods",
    );
  }
  if (!closing) {
    return unverifiable(
      ids,
      `No closing balance is written. Opening balance and transactions give ${formatTaka(running)}.`,
      "no_closing",
      running,
    );
  }
  const closingValue = valueOf(closing.numbers.amount);
  if (closingValue == null) return unverifiable(ids, "The closing balance has no readable amount.", "unreadable_amount", running);

  const ok = running === closingValue;
  return finding({
    ...base,
    entryIds: ids,
    status: ok ? "pass" : "fail",
    severity: ok ? "info" : "error",
    expected: running,
    observed: closingValue,
    message: ok
      ? `Opening ${formatTaka(openingValue)} plus ${words.added} minus ${words.paid} gives the written closing balance ${formatTaka(closingValue)}.`
      : `Opening ${formatTaka(openingValue)} plus ${words.added} minus ${words.paid} gives ${formatTaka(running)}, but the closing balance is written as ${formatTaka(closingValue)}.`,
  });
}

// ---------------------------------------------------------------------------
// Rule D: running balances written on transaction lines
// ---------------------------------------------------------------------------

function ruleRunningBalance(g: Group): Finding[] {
  const active = g.entries;
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

    if (g.convention != null) {
      const sign = accountSign(g.convention, type);
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
              g.convention != null
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
  for (const g of groupsOf(input.page, active)) {
    const tag = (f: Finding): Finding => (g.block ? { ...f, block: g.block.id } : f);
    findings.push(...ruleWrittenTotals(g.entries).map(tag));
    const b = ruleBalanceEquation(g);
    if (b) findings.push(tag(b));
    findings.push(...ruleRunningBalance(g).map(tag));
  }
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
