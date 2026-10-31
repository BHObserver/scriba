/**
 * Parties: the customers and suppliers named in the khata.
 *
 * A confirmed line is linked to a party through a normalized key, so the common
 * spelling variants of one Bangla name land on the same party: long and short
 * vowel signs, শ/ষ/স, ণ/ন, the মোঃ prefix, and titles such as ভাই or সাহেব.
 * Anything subtler is a merge the shopkeeper makes by hand.
 */
import { toAsciiDigits } from "@/lib/numerals";
import type { EntryValues, PageValues, TransactionType } from "./types";

export const PARTY_KINDS = ["customer", "supplier"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

export type PartyLink = { kind: PartyKind; key: string; name: string };

const CUSTOMER_TYPES: ReadonlySet<TransactionType> = new Set(["credit_sale", "cash_sale", "repayment"]);
const SUPPLIER_TYPES: ReadonlySet<TransactionType> = new Set(["purchase", "credit_purchase", "supplier_payment"]);
const BALANCE_TYPES: ReadonlySet<TransactionType> = new Set(["opening_balance", "closing_balance"]);

const MAX_NAME = 200;

// Applied after NFC, which already splits য়, ড়, ঢ় into letter + nukta.
const FOLDS: Array<[RegExp, string]> = [
  [/ী/g, "ি"],
  [/ূ/g, "ু"],
  [/ঈ/g, "ই"],
  [/ঊ/g, "উ"],
  [/[শষ]/g, "স"],
  [/ণ/g, "ন"],
  [/ৎ/g, "ত"],
  [/ঁ/g, ""],
  [/[‌‍]/g, ""],
];

function fold(text: string): string {
  let s = toAsciiDigits(text.normalize("NFC")).toLowerCase();
  for (const [re, to] of FOLDS) s = s.replace(re, to);
  return s
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PREFIXES = new Set(["মো", "মোহাম্মদ", "মোহাম্মাদ", "মুহাম্মদ", "মুহাম্মাদ", "md", "mohammad", "muhammad", "mohammed"].map(fold));
// Forms of address and roles written after a name. Only stripped when a name remains.
const TITLES = new Set(
  ["ভাই", "ভাইয়া", "সাহেব", "সাব", "চাচা", "কাকা", "মামা", "ভাবী", "আপা", "দা", "দাদা", "দিদি", "বৌদি", "মহাজন"].map(fold),
);

/**
 * The key two spellings of the same name share, or null for a blank name.
 * মোঃ করিম ভাই, মো. করীম and করিম all give "করিম".
 */
export function normalizePartyName(name: string | null | undefined): string | null {
  if (!name) return null;
  const tokens = fold(name)
    .replace(/ঃ/g, " ")
    .split(" ")
    .filter(Boolean);
  while (tokens.length > 1 && PREFIXES.has(tokens[0]!)) tokens.shift();
  while (tokens.length > 1 && TITLES.has(tokens[tokens.length - 1]!)) tokens.pop();
  const key = tokens.join(" ").slice(0, MAX_NAME);
  return key === "" ? null : key;
}

/** The name as the shopkeeper wrote it, tidied for display. */
export function partyDisplayName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

/**
 * Which party a confirmed line belongs to, if any.
 *
 * Sales and repayments belong to a customer; purchases and supplier payments to a
 * supplier. Opening and closing balances belong to the page's account: a supplier
 * when the page has supplier lines and no customer lines, else a customer.
 * Expenses, subtotals and adjustments have no party.
 *
 * The name is the one written on the line, else the page's account name on an
 * account page (a customer credit page, or a page with only supplier lines),
 * because those pages write the name once at the top.
 */
export function partyLinkFor(values: EntryValues, page: PageValues, pageTypes: readonly TransactionType[]): PartyLink | null {
  const hasSupplierLines = pageTypes.some((t) => SUPPLIER_TYPES.has(t));
  const hasCustomerLines = pageTypes.some((t) => CUSTOMER_TYPES.has(t));

  let kind: PartyKind;
  if (CUSTOMER_TYPES.has(values.type)) kind = "customer";
  else if (SUPPLIER_TYPES.has(values.type)) kind = "supplier";
  else if (BALANCE_TYPES.has(values.type)) kind = hasSupplierLines && !hasCustomerLines ? "supplier" : "customer";
  else return null;

  const accountPage = page.ledgerType === "customer_credit" || (kind === "supplier" && !hasCustomerLines);
  const written = values.customer?.trim() || (accountPage ? page.accountName?.trim() : null) || null;
  const key = normalizePartyName(written);
  if (!written || !key) return null;
  return { kind, key, name: partyDisplayName(written) };
}
