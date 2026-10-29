/** Shared ledger vocabulary used by extraction, validation, review and evaluation. */

export const TRANSACTION_TYPES = [
  "credit_sale",
  "cash_sale",
  "repayment",
  "opening_balance",
  "closing_balance",
  "subtotal",
  "adjustment",
  "unknown",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const LEDGER_TYPES = ["customer_credit", "cash_sales", "mixed", "unknown"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const REVIEWABLE_FIELDS = [
  "text",
  "type",
  "customer",
  "item",
  "qty",
  "unit",
  "rate",
  "amount",
  "balance",
] as const;
export type ReviewableField = (typeof REVIEWABLE_FIELDS)[number];

/** Bounding box on Meta's normalized 0-1000 grid, origin top-left. */
export type BoundingBox = { x_min: number; y_min: number; x_max: number; y_max: number };

/**
 * The editable, human-facing form of one candidate entry. Numbers are kept as the
 * text that was written; normalized values are always re-derived from this text.
 */
export type EntryValues = {
  sourceText: string;
  type: TransactionType;
  customer: string | null;
  item: string | null;
  quantityText: string | null;
  unit: string | null;
  rateText: string | null;
  amountText: string | null;
  balanceText: string | null;
  crossedOut: boolean;
};

export type PageValues = {
  dateText: string | null;
  ledgerType: LedgerType;
  accountName: string | null;
};

export const SALE_TYPES: ReadonlySet<TransactionType> = new Set(["credit_sale", "cash_sale"]);
export const MARKER_TYPES: ReadonlySet<TransactionType> = new Set([
  "opening_balance",
  "closing_balance",
  "subtotal",
]);

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  credit_sale: "Credit sale",
  cash_sale: "Cash sale",
  repayment: "Repayment",
  opening_balance: "Opening balance",
  closing_balance: "Closing balance",
  subtotal: "Written total",
  adjustment: "Adjustment",
  unknown: "Unclassified",
};

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  customer_credit: "Customer credit account",
  cash_sales: "Cash sales",
  mixed: "Mixed",
  unknown: "Unknown convention",
};
