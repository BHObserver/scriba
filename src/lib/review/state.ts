/** Review state shared by the server loader and the client review screen. */
import type { BoundingBox, EntryValues, PageValues, ReviewableField } from "@/lib/ledger/types";
import type { ValidationEntry, ValidationInput } from "@/lib/validation/engine";

export type CandidateSnapshot = {
  candidateId: string;
  values: EntryValues;
  bbox: BoundingBox | null;
  reviewFields: ReviewableField[];
  uncertaintyReason: string | null;
};

export type ReviewRow = {
  id: string;
  extractedEntryId: string | null;
  lineOrder: number;
  values: EntryValues;
  reviewFields: ReviewableField[];
  status: "draft" | "rejected" | "confirmed";
  version: number;
  candidate: CandidateSnapshot | null;
};

export type PageState = { values: PageValues; version: number; reviewStartedAt: string | null };

/** The reviewer's current state as validator input. Rejected rows are excluded from every rule. */
export function toValidationInput(review: { page: PageState; rows: ReviewRow[] }): ValidationInput {
  const entries: ValidationEntry[] = review.rows.map((r, index) => ({
    id: r.id,
    line: index + 1,
    values: r.values,
    reviewFields: r.reviewFields,
    uncertaintyReason: r.candidate?.uncertaintyReason ?? null,
    excluded: r.status === "rejected",
  }));
  return { page: review.page.values, entries };
}

/** True when the reviewer's values differ from what the model read (or the row was added). */
export function wasCorrected(row: ReviewRow): boolean {
  if (!row.candidate) return true;
  const a = row.candidate.values;
  const b = row.values;
  return (Object.keys(a) as Array<keyof EntryValues>).some((k) => a[k] !== b[k]);
}
