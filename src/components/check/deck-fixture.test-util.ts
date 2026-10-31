import type { BoundingBox, EntryValues, LedgerType, TransactionType } from "@/lib/ledger/types";
import type { PageState, ReviewRow } from "@/lib/review/state";

/** Test helper: a page of review rows as the deck receives them. */
export type Line = Partial<EntryValues> & { type: TransactionType; status?: ReviewRow["status"]; review?: ReviewRow["reviewFields"]; reason?: string; box?: BoundingBox | null };

export function reviewOf(ledgerType: LedgerType, lines: Line[], accountName: string | null = null): { page: PageState; rows: ReviewRow[] } {
  const rows: ReviewRow[] = lines.map((l, i) => {
    const values: EntryValues = {
      sourceText: l.sourceText ?? "",
      type: l.type,
      customer: l.customer ?? null,
      item: l.item ?? null,
      quantityText: l.quantityText ?? null,
      unit: l.unit ?? null,
      rateText: l.rateText ?? null,
      amountText: l.amountText ?? null,
      balanceText: l.balanceText ?? null,
      crossedOut: l.crossedOut ?? false,
    };
    return {
      id: `r${i + 1}`,
      extractedEntryId: null,
      lineOrder: i + 1,
      values,
      reviewFields: l.review ?? [],
      status: l.status ?? "draft",
      version: 1,
      candidate: { candidateId: `e${i + 1}`, values, bbox: l.box ?? null, reviewFields: l.review ?? [], uncertaintyReason: l.reason ?? null },
    };
  });
  return { page: { values: { dateText: null, ledgerType, accountName }, version: 1, reviewStartedAt: null }, rows };
}

/** S04 as read: the opening ৮০০ misread as ৪০০, so the balance fails on its two ends. */
export const s04Lines = (opening = "৪০০"): Line[] => [
  { type: "opening_balance", amountText: opening },
  { type: "credit_sale", item: "চাল", quantityText: "৩", unit: "কেজি", rateText: "৬০", amountText: "১৮০" },
  { type: "credit_sale", item: "ডাল", quantityText: "১", unit: "কেজি", rateText: "১৪০", amountText: "১৪০" },
  { type: "subtotal", amountText: "৩২০" },
  { type: "repayment", amountText: "১০০" },
  { type: "closing_balance", amountText: "১,০২০" },
];

/** The same page with one line's values replaced, as a saved edit would leave it (the candidate keeps the reading). */
export function edited(review: { page: PageState; rows: ReviewRow[] }, id: string, patch: Partial<EntryValues> & { status?: ReviewRow["status"] }) {
  const { status, ...values } = patch;
  return {
    ...review,
    rows: review.rows.map((r) => (r.id === id ? { ...r, values: { ...r.values, ...values }, status: status ?? r.status, version: r.version + 1 } : r)),
  };
}
