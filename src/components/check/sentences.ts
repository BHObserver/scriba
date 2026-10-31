import type { I18n } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/messages";
import type { EntryValues, ReviewableField } from "@/lib/ledger/types";
import type { ReviewRow } from "@/lib/review/state";
import { deriveNumbers, type Finding } from "@/lib/validation/engine";

/**
 * The deck's check sentences (COPY.md part 2, "D2 check sentences"): every finding on a line in
 * one plain sentence, numbers inserted by code from the finding and the lines it covers. `look`
 * needs a decision, `ok` passed, `info` could not be checked (never claimed as checked).
 */
export type CheckSentence = { kind: "look" | "ok" | "info"; text: string };
export type LineSentences = { checks: CheckSentence[]; hint: string | null };

const FIELD_KEY: Record<ReviewableField, MessageKey> = {
  text: "field.text",
  type: "field.type",
  customer: "field.customer",
  item: "field.item",
  qty: "eq.qty",
  unit: "field.unit",
  rate: "eq.rate",
  amount: "eq.amount",
  balance: "field.balance",
};

const ORDER = { look: 0, info: 1, ok: 2 } as const;

/** Taka from poisha without the ৳ sign, in the locale's digits: 102000 → "১,০২০". */
function taka(i18n: I18n, poisha: number): string {
  return i18n.money(poisha).replace("৳", "");
}

function amountOf(values: EntryValues | undefined): number | null {
  const a = values ? deriveNumbers(values).amount : null;
  return a && a.ok ? a.value : null;
}

/** "৩ × ৬০" from the parsed quantity (milli units) and rate (poisha). */
function product(i18n: I18n, values: EntryValues): string | null {
  const n = deriveNumbers(values);
  if (!n.quantity?.ok || !n.rate?.ok) return null;
  const q = n.quantity.value / 1000;
  const qty = Number.isInteger(q) ? i18n.count(q) : i18n.digits(String(q));
  return `${qty} × ${taka(i18n, n.rate.value)}`;
}

/** "৮০০ + ৩২০ − ১০০ = ১,০২০": the opening balance, each line's effect, and the computed close. */
function balanceEquation(i18n: I18n, f: Finding, values: Map<string, EntryValues>): string | null {
  if (f.expected == null) return null;
  const ids = f.entryIds;
  const opening = amountOf(values.get(ids[0]!));
  if (opening == null) return null;
  const terms = [taka(i18n, opening)];
  for (const id of ids.slice(1, -1)) {
    const v = values.get(id);
    const a = amountOf(v);
    if (!v || a == null) return null;
    terms.push(`${v.type === "repayment" ? "−" : "+"} ${taka(i18n, a)}`);
  }
  return `${terms.join(" ")} = ${taka(i18n, f.expected)}`;
}

/** What this line's amount would need to be for the balance to close (only on its two ends). */
function balanceNeed(f: Finding, rowId: string, values: Map<string, EntryValues>): number | null {
  if (f.expected == null || f.observed == null) return null;
  if (rowId === f.entryIds.at(-1)) return f.expected;
  if (rowId === f.entryIds[0]) {
    const opening = amountOf(values.get(rowId));
    return opening == null ? null : opening + (f.observed - f.expected);
  }
  return null;
}

function sentenceFor(i18n: I18n, f: Finding, row: ReviewRow, values: Map<string, EntryValues>): { s: CheckSentence; hint?: string } | null {
  const { t } = i18n;
  const ids = f.entryIds;
  const isLast = row.id === ids.at(-1);
  const isEnd = isLast || row.id === ids[0];
  switch (f.ruleId) {
    case "qty_x_rate": {
      if (f.status === "unverifiable") {
        const v = row.values;
        const key: MessageKey =
          row.reviewFields.some((x) => x === "qty" || x === "rate" || x === "unit") ? "chk.qr.unsure" : v.quantityText && !v.rateText ? "chk.qr.noRate" : "chk.qr.missing";
        return { s: { kind: "info", text: t(key) } };
      }
      const p = product(i18n, row.values);
      if (!p || f.expected == null || f.observed == null) return null;
      return f.status === "pass"
        ? { s: { kind: "ok", text: t("chk.qr.ok", p, taka(i18n, f.expected)) } }
        : { s: { kind: "look", text: t("chk.qr.fail", p, taka(i18n, f.expected), taka(i18n, f.observed)) }, hint: t("chk.khataWrong") };
    }
    case "written_total": {
      // A line inside a failed sum must still be accepted with it (approval.ts), so it says why.
      if (!isLast) return f.status === "fail" ? { s: { kind: "info", text: t("chk.tot.inFail") } } : null;
      if (f.status === "unverifiable" || f.expected == null || f.observed == null) return { s: { kind: "info", text: t("chk.tot.na") } };
      if (f.status === "fail") {
        return { s: { kind: "look", text: t("chk.tot.fail", ids.length - 1, taka(i18n, f.expected), taka(i18n, f.observed)) }, hint: t("chk.khataWrong") };
      }
      const parts = ids.slice(0, -1).map((id) => amountOf(values.get(id)));
      const sum = parts.every((p) => p != null) ? parts.map((p) => taka(i18n, p!)).join(" + ") : null;
      return { s: { kind: "ok", text: sum ? t("chk.tot.ok", sum, taka(i18n, f.expected)) : t("chk.tot.okShort") } };
    }
    case "balance_equation": {
      if (!isEnd) {
        if (f.status === "fail") return { s: { kind: "info", text: t("chk.bal.inFail") } };
        if (f.status !== "pass") return null;
        return { s: { kind: "ok", text: t(row.values.type === "repayment" ? "chk.bal.out" : "chk.bal.in") } };
      }
      if (f.status === "unverifiable") return { s: { kind: "info", text: t("chk.bal.na") } };
      const eq = balanceEquation(i18n, f, values);
      if (!eq || f.observed == null) return null;
      if (f.status === "pass") return { s: { kind: "ok", text: t("chk.bal.ok", eq) } };
      const need = balanceNeed(f, row.id, values);
      return { s: { kind: "look", text: t("chk.bal.fail", eq, taka(i18n, f.observed)) }, hint: need != null && need >= 0 ? t("chk.bal.need", taka(i18n, need)) : undefined };
    }
    case "running_balance": {
      if (!isLast) return null;
      if (f.status === "pass") return { s: { kind: "ok", text: t("chk.run.ok") } };
      if (f.status === "fail" && f.expected != null && f.observed != null) {
        return { s: { kind: "look", text: t("chk.run.fail", taka(i18n, f.expected), taka(i18n, f.observed)) }, hint: t("chk.khataWrong") };
      }
      return { s: { kind: "info", text: t("chk.run.na") } };
    }
    case "numeral_format":
      return { s: { kind: "look", text: t("chk.num") } };
    case "classification":
      return { s: { kind: "look", text: t("chk.type") } };
    default:
      return null;
  }
}

/** Every check sentence for one line, problems first, plus one hint for the first problem that has one. */
export function lineSentences(i18n: I18n, row: ReviewRow, rows: readonly ReviewRow[], findings: readonly Finding[]): LineSentences {
  const values = new Map(rows.filter((r) => r.status !== "rejected").map((r) => [r.id, r.values]));
  const checks: CheckSentence[] = [];
  let hint: string | null = null;
  const own = findings.filter((f) => f.entryIds.includes(row.id));
  for (const f of own) {
    if (f.ruleId === "model_uncertainty") continue;
    const out = sentenceFor(i18n, f, row, values);
    if (!out) continue;
    if (!checks.some((c) => c.text === out.s.text)) checks.push(out.s);
    if (out.hint && !hint && out.s.kind === "look") hint = out.hint;
  }
  // One sentence for the model's doubt: its own reason when it gave one, else the fields it named.
  if (own.some((f) => f.ruleId === "model_uncertainty")) {
    const reason = row.candidate?.uncertaintyReason?.trim();
    const fields = row.reviewFields.map((f) => i18n.t(FIELD_KEY[f])).join(", ");
    checks.push({ kind: "look", text: reason ? i18n.t("chk.unsure", reason) : i18n.t("chk.unsure.field", fields) });
  }
  if (row.values.crossedOut) checks.push({ kind: "look", text: i18n.t("chk.crossed") });
  if (row.values.amountText == null || row.values.amountText.trim() === "") checks.push({ kind: "look", text: i18n.t("chk.noAmount") });
  if (checks.length === 0) checks.push({ kind: "info", text: i18n.t("chk.plain") });
  checks.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  return { checks, hint };
}

export function fieldLabel(i18n: I18n, field: ReviewableField): string {
  return i18n.t(FIELD_KEY[field]);
}

/**
 * The page's own figure for the summary hero: the closing balance with its equation, or else the
 * last written total with its sum. Null when the page has neither (or neither could be checked).
 */
export function pageSentence(i18n: I18n, rows: readonly ReviewRow[], findings: readonly Finding[]): { label: "closing" | "total"; amount: number; kind: "ok" | "look"; text: string } | null {
  const values = new Map(rows.filter((r) => r.status !== "rejected").map((r) => [r.id, r.values]));
  const balance = findings.find((f) => f.ruleId === "balance_equation" && f.status !== "unverifiable" && f.observed != null);
  if (balance) {
    const eq = balanceEquation(i18n, balance, values);
    if (eq) {
      const ok = balance.status === "pass";
      return { label: "closing", amount: balance.observed!, kind: ok ? "ok" : "look", text: ok ? i18n.t("chk.bal.ok", eq) : i18n.t("chk.bal.fail", eq, taka(i18n, balance.observed!)) };
    }
  }
  const total = findings.filter((f) => f.ruleId === "written_total" && f.status !== "unverifiable" && f.observed != null && f.expected != null).at(-1);
  if (!total) return null;
  const ok = total.status === "pass";
  const text = ok ? i18n.t("chk.tot.okShort") : i18n.t("chk.tot.fail", total.entryIds.length - 1, taka(i18n, total.expected!), taka(i18n, total.observed!));
  return { label: "total", amount: total.observed!, kind: ok ? "ok" : "look", text };
}
