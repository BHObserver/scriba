/**
 * Database rows → the insights engine's inputs, and each page's check state. Pure, so the
 * mapping the money screens rely on is tested without a database.
 */
import type { DayPage } from "@/lib/insights/note";
import type { BookInput, InsightDayClose, InsightParty, InsightRecord, RecordType } from "@/lib/insights/types";
import type { PartyKind } from "@/lib/ledger/parties";

/** Demo-shop pages that have no photo: their records are sample data and show "no photo". */
export const SAMPLE_PAGE_DATASET = "demo-sample";
/** The author's development photos copied into the demo shop with their stored readings. */
export const DEMO_PHOTO_DATASET = "demo-photo";

export const RECORD_COLUMNS =
  "id, document_id, run_id, extracted_entry_id, line_order, transaction_type, party_id, customer_alias, item_name, source_text, quantity_text, unit, unit_rate_text, amount_text, amount_poisha, was_corrected, confirmed_at";
export type RecordRow = {
  id: string;
  document_id: string;
  run_id: string;
  extracted_entry_id: string | null;
  line_order: number | string;
  transaction_type: RecordType;
  party_id: string | null;
  customer_alias: string | null;
  item_name: string | null;
  source_text: string;
  quantity_text: string | null;
  unit: string | null;
  unit_rate_text: string | null;
  amount_text: string;
  amount_poisha: number | string;
  was_corrected: boolean;
  confirmed_at: string;
};

export const DOCUMENT_COLUMNS =
  "id, storage_path, width, height, uploaded_at, status, business_date, business_date_source, dataset_label, sample_label";
export type DocumentRow = {
  id: string;
  storage_path: string;
  width: number;
  height: number;
  uploaded_at: string;
  status: "uploaded" | "extracted" | "partially_confirmed" | "confirmed";
  business_date: string;
  business_date_source: "capture" | "written" | "user";
  dataset_label: string | null;
  sample_label: string | null;
};

export type PartyRow = { id: string; kind: PartyKind; display_name: string; normalized_key: string; merged_into: string | null };
export type DayCloseRow = {
  business_date: string;
  opening_cash_poisha: number | string;
  expected_cash_poisha: number | string;
  counted_cash_poisha: number | string;
  note: string | null;
  closed_at: string;
};
export type ShopProfileRow = { shop_name: string; language: "bn" | "en"; opening_cash_poisha: number | string; is_sample: boolean };

export type ShopProfile = { shopName: string; language: "bn" | "en"; openingCashPoisha: number; isSample: boolean };

/** bigint and numeric columns can arrive as strings; money and line order must be numbers. */
const num = (v: number | string) => (typeof v === "number" ? v : Number(v));

export function toShopProfile(row: ShopProfileRow): ShopProfile {
  return { shopName: row.shop_name, language: row.language, openingCashPoisha: num(row.opening_cash_poisha), isSample: row.is_sample };
}

export function hasPhoto(doc: Pick<DocumentRow, "dataset_label">): boolean {
  return doc.dataset_label !== SAMPLE_PAGE_DATASET;
}

/** Pages the demo seed wrote, with readings that were never sent to Meta. */
export function isSeededPage(doc: Pick<DocumentRow, "dataset_label">): boolean {
  return doc.dataset_label === SAMPLE_PAGE_DATASET || doc.dataset_label === DEMO_PHOTO_DATASET;
}

/** Records whose page is missing (deleted) are left out: they have no business date. */
export function toBookInput(input: {
  records: readonly RecordRow[];
  documents: readonly DocumentRow[];
  parties: readonly PartyRow[];
  closes: readonly DayCloseRow[];
  profile: ShopProfile | null;
}): BookInput {
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const records: InsightRecord[] = [];
  for (const r of input.records) {
    const doc = docs.get(r.document_id);
    if (!doc) continue;
    records.push({
      id: r.id,
      documentId: r.document_id,
      runId: r.run_id,
      businessDate: doc.business_date,
      capturedAt: doc.uploaded_at,
      lineOrder: num(r.line_order),
      type: r.transaction_type,
      partyId: r.party_id,
      itemName: r.item_name,
      amountPoisha: num(r.amount_poisha),
      wasCorrected: r.was_corrected,
      confirmedAt: r.confirmed_at,
    });
  }
  const parties: InsightParty[] = input.parties.map((p) => ({ id: p.id, kind: p.kind, displayName: p.display_name, mergedInto: p.merged_into }));
  const closes: InsightDayClose[] = input.closes.map((c) => ({
    businessDate: c.business_date,
    openingCashPoisha: num(c.opening_cash_poisha),
    expectedCashPoisha: num(c.expected_cash_poisha),
    countedCashPoisha: num(c.counted_cash_poisha),
  }));
  return { records, parties, closes, usualOpeningCashPoisha: input.profile?.openingCashPoisha ?? 0 };
}

/** unread: no reading yet (or it failed); waiting: lines still to check; checked: none left. */
export type PageState = "unread" | "waiting" | "checked";

export type PageInfo = {
  documentId: string;
  businessDate: string;
  capturedAt: string;
  state: PageState;
  waitingLines: number;
  /** Lines confirmed from this page's reading. */
  confirmedLines: number;
  hasPhoto: boolean;
};

/**
 * `drafts` counts draft lines per page in the page's latest successful reading; `read` holds
 * the pages that have one. Pages come out in capture order.
 */
export function pageInfos(
  documents: readonly DocumentRow[],
  read: ReadonlySet<string>,
  drafts: ReadonlyMap<string, number>,
  confirmed: ReadonlyMap<string, number>,
): PageInfo[] {
  return [...documents]
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? -1 : a.uploaded_at > b.uploaded_at ? 1 : a.id < b.id ? -1 : 1))
    .map((d) => {
      const waitingLines = drafts.get(d.id) ?? 0;
      const state: PageState = !read.has(d.id) ? "unread" : waitingLines > 0 ? "waiting" : "checked";
      return {
        documentId: d.id,
        businessDate: d.business_date,
        capturedAt: d.uploaded_at,
        state,
        waitingLines,
        confirmedLines: confirmed.get(d.id) ?? 0,
        hasPhoto: hasPhoto(d),
      };
    });
}

export function dayPages(pages: readonly PageInfo[], date: string): DayPage[] {
  return pages
    .filter((p) => p.businessDate === date)
    .map((p) => ({ documentId: p.documentId, checked: p.state === "checked", waitingLines: p.waitingLines }));
}
