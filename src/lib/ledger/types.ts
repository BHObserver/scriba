/** Shared ledger vocabulary used by extraction, validation, review and evaluation. */

export const TRANSACTION_TYPES = [
  "credit_sale",
  "cash_sale",
  "repayment",
  "purchase",
  "credit_purchase",
  "supplier_payment",
  "expense",
  "opening_balance",
  "closing_balance",
  "subtotal",
  "adjustment",
  "unknown",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const LEDGER_TYPES = ["customer_credit", "cash_sales", "mixed", "unknown"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/**
 * What a block of writing is (schema 3). A block is writing that belongs together wherever
 * it sits on the page; its kind, not the page's, decides the party kind and the checks.
 */
export const BLOCK_KINDS = ["day_sales", "customer_account", "supplier_visit", "supplier_account", "expenses", "other"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

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
  /** The id of the block this line belongs to (schema 3). Absent on readings without blocks. */
  block?: string | null;
};

/** The editable form of one block. Its box stays on the reading, like a line's box. */
export type BlockValues = {
  id: string;
  kind: BlockKind;
  /** The heading as written, e.g. "Praan (Selim)" or নগদ বিক্রি. */
  title: string | null;
  /** The company or customer, as written. The party of the block's lines. */
  party: string | null;
  /** The rep or contact, as written: a note on the records, never the party. */
  person: string | null;
  dateText: string | null;
};

/**
 * A question Scriba asked and the answer the shopkeeper gave (U2). Kept with the page, so the
 * audit trail records it and the question isn't asked again while its subject is unchanged.
 */
export type AnswerRecord = {
  /** The question, e.g. "meaning:b1". */
  q: string;
  /** What the question was about; when that changes, it is asked again. */
  fp: string;
  /** The option chosen, or "value" for a typed or spoken answer. */
  a: string;
  /** Problems this answer accepted, as approval fingerprints (`ackFingerprint`). */
  accepted?: string[];
  at: string;
};

export type PageValues = {
  dateText: string | null;
  ledgerType: LedgerType;
  accountName: string | null;
  /** Schema 3 readings only. Absent: the page-level rules apply, as for prompt 4. */
  blocks?: BlockValues[];
  /** Answers to Scriba's questions, latest per question. */
  answers?: AnswerRecord[];
};

export const SALE_TYPES: ReadonlySet<TransactionType> = new Set(["credit_sale", "cash_sale"]);
/**
 * Money going out of the shop: stock bought for cash or on credit, payments to
 * suppliers, and shop costs. Money in is cash_sale + repayment; a receivable is
 * credit_sale - repayment; a payable is credit_purchase - supplier_payment.
 */
export const MONEY_OUT_TYPES: ReadonlySet<TransactionType> = new Set([
  "purchase",
  "credit_purchase",
  "supplier_payment",
  "expense",
]);
export const MARKER_TYPES: ReadonlySet<TransactionType> = new Set([
  "opening_balance",
  "closing_balance",
  "subtotal",
]);

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  credit_sale: "Credit sale",
  cash_sale: "Cash sale",
  repayment: "Repayment",
  purchase: "Stock bought (cash)",
  credit_purchase: "Stock bought on credit",
  supplier_payment: "Paid to supplier",
  expense: "Expense",
  opening_balance: "Opening balance",
  closing_balance: "Closing balance",
  subtotal: "Written total",
  adjustment: "Adjustment",
  unknown: "Unclassified",
};

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  day_sales: "Day's sales",
  customer_account: "Customer account",
  supplier_visit: "Company visit",
  supplier_account: "Supplier account",
  expenses: "Expenses",
  other: "Other",
};

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  customer_credit: "Customer credit account",
  cash_sales: "Cash sales",
  mixed: "Mixed",
  unknown: "Unknown convention",
};
