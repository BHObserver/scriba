import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/config";
import { type PartyAccount, duesList, partyAccount } from "@/lib/insights/accounts";
import { type Book, prepareBook, rootPartyId } from "@/lib/insights/book";
import { addDays } from "@/lib/insights/calendar";
import { type DayCloseSnapshot, dayCloseSnapshot, daySummary } from "@/lib/insights/day";
import { todayInsights } from "@/lib/insights/today";
import { salesByDay } from "@/lib/insights/trends";
import type { RecordType } from "@/lib/insights/types";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import type { PartyKind } from "@/lib/ledger/parties";
import type { BoundingBox } from "@/lib/ledger/types";
import { type MergeProblem, historyDays, mergeProblem, searchLines } from "@/lib/shop/history";
import {
  DOCUMENT_COLUMNS,
  type DayCloseRow,
  type DocumentRow,
  type PageInfo,
  type PartyRow,
  RECORD_COLUMNS,
  type RecordRow,
  type ShopProfile,
  type ShopProfileRow,
  dayPages,
  hasPhoto,
  pageInfos,
  toBookInput,
  toShopProfile,
} from "@/lib/shop/rows";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * Data for the money and shop screens (Today, close the day, dues, party ledger, history,
 * settings). Reads go through the signed-in user's own client, so Row Level Security scopes
 * every row to their shop. Every figure is computed by the insights engine from confirmed
 * records; nothing here trusts a number from the client.
 */
type Supabase = SupabaseClient;
type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** PostgREST returns at most 1,000 rows per request; read on until a short page. */
async function selectAll<T>(page: (from: number, to: number) => Result<T>): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

function chunks<T>(items: readonly T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadShopProfile(supabase: Supabase): Promise<ShopProfile | null> {
  const { data, error } = await supabase.from("shop_profiles").select("shop_name, language, opening_cash_poisha, is_sample").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toShopProfile(data as ShopProfileRow) : null;
}

type RunRow = { id: string; document_id: string; status: string; started_at: string; processing_mode: string };

export type Shop = {
  profile: ShopProfile | null;
  book: Book;
  documents: Map<string, DocumentRow>;
  records: Map<string, RecordRow>;
  pages: PageInfo[];
  /** Each page's latest successful reading. */
  readings: Map<string, RunRow>;
};

/** The whole shop, read once per request: every screen's figures come from this. */
export async function loadShop(supabase: Supabase): Promise<Shop> {
  const [profile, documents, records, parties, closes, runs, drafts] = await Promise.all([
    loadShopProfile(supabase),
    selectAll<DocumentRow>((a, b) => supabase.from("ledger_documents").select(DOCUMENT_COLUMNS).order("id").range(a, b)),
    selectAll<RecordRow>((a, b) => supabase.from("confirmed_records").select(RECORD_COLUMNS).order("id").range(a, b)),
    selectAll<PartyRow>((a, b) => supabase.from("parties").select("id, kind, display_name, normalized_key, merged_into").order("id").range(a, b)),
    selectAll<DayCloseRow>((a, b) =>
      supabase.from("day_closes").select("business_date, opening_cash_poisha, expected_cash_poisha, counted_cash_poisha, note, closed_at").order("business_date").range(a, b),
    ),
    selectAll<RunRow>((a, b) =>
      supabase.from("extraction_runs").select("id, document_id, status, started_at, processing_mode").eq("status", "succeeded").order("id").range(a, b),
    ),
    selectAll<{ run_id: string }>((a, b) => supabase.from("entry_reviews").select("run_id").eq("status", "draft").order("id").range(a, b)),
  ]);

  const readings = new Map<string, RunRow>();
  for (const r of runs) {
    const seen = readings.get(r.document_id);
    if (!seen || r.started_at > seen.started_at) readings.set(r.document_id, r);
  }
  const latestRuns = new Map([...readings.values()].map((r) => [r.id, r.document_id]));
  const draftsByDoc = new Map<string, number>();
  for (const d of drafts) {
    const doc = latestRuns.get(d.run_id);
    if (doc) draftsByDoc.set(doc, (draftsByDoc.get(doc) ?? 0) + 1);
  }
  const confirmedByDoc = new Map<string, number>();
  for (const r of records) confirmedByDoc.set(r.document_id, (confirmedByDoc.get(r.document_id) ?? 0) + 1);

  return {
    profile,
    book: prepareBook(toBookInput({ records, documents, parties, closes, profile })),
    documents: new Map(documents.map((d) => [d.id, d])),
    records: new Map(records.map((r) => [r.id, r])),
    pages: pageInfos(documents, new Set(readings.keys()), draftsByDoc, confirmedByDoc),
    readings,
  };
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export function todayData(shop: Shop, asOf: string) {
  return {
    profile: shop.profile,
    insights: todayInsights(shop.book, asOf, dayPages(shop.pages, asOf)),
    /** The seven days ending today, oldest first, for the bars. */
    week: salesByDay(shop.book, addDays(asOf, -6), asOf),
    pages: shop.pages.filter((p) => p.businessDate === asOf),
  };
}

export function closeData(shop: Shop, date: string) {
  return { profile: shop.profile, day: daySummary(shop.book, date), pages: shop.pages.filter((p) => p.businessDate === date) };
}

export function duesData(shop: Shop, kind: PartyKind, asOf: string) {
  return { profile: shop.profile, dues: duesList(shop.book, kind, asOf) };
}

export type PartyView =
  | { kind: "merged"; intoId: string }
  | {
      kind: "party";
      account: PartyAccount;
      /** Other spellings merged into this party. */
      aliases: Array<{ id: string; name: string }>;
      /** Parties of the same kind this one could be merged into. */
      mergeTargets: Array<{ id: string; name: string }>;
    };

/** A merged party's page points to the party it was merged into. Null when it isn't his. */
export function partyData(shop: Shop, partyId: string, asOf: string): PartyView | null {
  const party = shop.book.parties.get(partyId);
  if (!party) return null;
  const root = rootPartyId(shop.book.parties, partyId);
  if (root !== partyId) return { kind: "merged", intoId: root };
  const account = partyAccount(shop.book, partyId, asOf);
  if (!account) return null;
  const all = [...shop.book.parties.values()];
  return {
    kind: "party",
    account,
    aliases: all.filter((p) => p.id !== partyId && rootPartyId(shop.book.parties, p.id) === partyId).map((p) => ({ id: p.id, name: p.displayName })),
    mergeTargets: all
      .filter((p) => p.kind === party.kind && p.id !== partyId && !p.mergedInto)
      .map((p) => ({ id: p.id, name: p.displayName }))
      .sort((a, b) => a.name.localeCompare(b.name, "bn")),
  };
}

export function historyData(shop: Shop) {
  return { profile: shop.profile, days: historyDays(shop.book, shop.pages) };
}

export function searchData(shop: Shop, query: string): string[] {
  const texts = new Map([...shop.records.values()].map((r) => [r.id, { itemName: r.item_name, customerAlias: r.customer_alias, sourceText: r.source_text }]));
  return searchLines(shop.book, texts, query);
}

// ---------------------------------------------------------------------------
// Lines behind a figure (drill-down, ledger timeline, search results)
// ---------------------------------------------------------------------------

export type LineStrip = { src: string; width: number; height: number; turns: 0 | 1 | 2 | 3; box: BoundingBox };

export type LineDetail = {
  id: string;
  documentId: string;
  date: string;
  type: RecordType;
  /** The party's current name (after merges), else the name as written. */
  name: string | null;
  partyId: string | null;
  item: string | null;
  quantityText: string | null;
  unit: string | null;
  rateText: string | null;
  amountText: string;
  amountPoisha: number;
  sourceText: string;
  wasCorrected: boolean;
  /** Sample pages and lines without a box have no strip; the UI says so. */
  strip: LineStrip | null;
  samplePage: boolean;
};

/** Details for up to 300 records, in the order asked; ids that aren't his are left out. */
export async function lineDetails(supabase: Supabase, shop: Shop, ids: readonly string[]): Promise<LineDetail[]> {
  const rows = [...new Set(ids)].slice(0, 300).flatMap((id) => {
    const r = shop.records.get(id);
    return r ? [r] : [];
  });
  const entryIds = rows.map((r) => r.extracted_entry_id).filter((id): id is string => id !== null);
  const boxes = new Map<string, BoundingBox | null>();
  for (const part of chunks(entryIds)) {
    const { data, error } = await supabase.from("extracted_entries").select("id, bbox").in("id", part);
    if (error) throw new Error(error.message);
    for (const e of data ?? []) boxes.set(e.id as string, (e.bbox as BoundingBox | null) ?? null);
  }

  const paths = [...new Set(rows.map((r) => shop.documents.get(r.document_id)).filter((d) => d && hasPhoto(d)).map((d) => d!.storage_path))];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const byId = new Map(shop.book.records.map((r) => [r.id, r]));
  return rows.map((r) => {
    const doc = shop.documents.get(r.document_id)!;
    const box = r.extracted_entry_id ? (boxes.get(r.extracted_entry_id) ?? null) : null;
    const src = signed.get(doc.storage_path);
    const partyId = byId.get(r.id)?.partyId ?? (r.party_id ? rootPartyId(shop.book.parties, r.party_id) : null);
    return {
      id: r.id,
      documentId: r.document_id,
      date: doc.business_date,
      type: r.transaction_type,
      name: (partyId && shop.book.parties.get(partyId)?.displayName) || r.customer_alias,
      partyId,
      item: r.item_name,
      quantityText: r.quantity_text,
      unit: r.unit,
      rateText: r.unit_rate_text,
      amountText: r.amount_text,
      amountPoisha: Number(r.amount_poisha),
      sourceText: r.source_text,
      wasCorrected: r.was_corrected,
      strip:
        src && box
          ? { src, width: doc.width, height: doc.height, turns: turnsForProcessingMode(shop.readings.get(doc.id)?.processing_mode), box }
          : null,
      samplePage: !hasPhoto(doc),
    };
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Close a day: the expected cash is recomputed here from his confirmed lines, never taken from
 * the client. Closing again (after more lines were confirmed) replaces the earlier close.
 * `day_closes` are server-written, so the insert uses the service client for this owner only.
 */
export async function saveDayClose(
  supabase: Supabase,
  ownerId: string,
  input: { date: string; countedCashPoisha: number; note: string | null },
): Promise<DayCloseSnapshot> {
  const shop = await loadShop(supabase);
  const withoutOwn = prepareBook({
    records: shop.book.records,
    parties: [...shop.book.parties.values()],
    closes: [...shop.book.closes.values()].filter((c) => c.businessDate !== input.date),
    usualOpeningCashPoisha: shop.book.usualOpeningCashPoisha,
  });
  const snapshot = dayCloseSnapshot(daySummary(withoutOwn, input.date), input.countedCashPoisha);
  const { error } = await createServiceSupabase()
    .from("day_closes")
    .upsert(
      {
        owner_id: ownerId,
        business_date: snapshot.businessDate,
        opening_cash_poisha: snapshot.openingCashPoisha,
        expected_cash_poisha: snapshot.expectedCashPoisha,
        counted_cash_poisha: snapshot.countedCashPoisha,
        breakdown: snapshot.breakdown,
        record_ids: snapshot.recordIds,
        note: input.note,
        closed_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,business_date" },
    );
  if (error) throw new Error(error.message);
  return snapshot;
}

/** Merge one spelling into another. Records keep their party; the engine follows the merge. */
export async function mergeParty(
  supabase: Supabase,
  ownerId: string,
  sourceId: string,
  targetId: string,
): Promise<{ ok: true } | { ok: false; problem: MergeProblem }> {
  const parties = await selectAll<PartyRow>((a, b) => supabase.from("parties").select("id, kind, display_name, normalized_key, merged_into").order("id").range(a, b));
  const map = new Map(parties.map((p) => [p.id, { id: p.id, kind: p.kind, displayName: p.display_name, mergedInto: p.merged_into }]));
  const problem = mergeProblem(map, sourceId, targetId);
  if (problem) return { ok: false, problem };
  const { data, error } = await createServiceSupabase()
    .from("parties")
    .update({ merged_into: targetId })
    .eq("id", sourceId)
    .eq("owner_id", ownerId)
    .is("merged_into", null)
    .select("id");
  if (error) throw new Error(error.message);
  return data && data.length === 1 ? { ok: true } : { ok: false, problem: "source_merged" };
}

/** Undo a merge: the party's lines count under its own name again. */
export async function unmergeParty(ownerId: string, partyId: string): Promise<boolean> {
  const { data, error } = await createServiceSupabase()
    .from("parties")
    .update({ merged_into: null })
    .eq("id", partyId)
    .eq("owner_id", ownerId)
    .not("merged_into", "is", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) === 1;
}

/** Create or change the shop profile (`is_sample` is never written here). */
export async function saveShopProfile(supabase: Supabase, ownerId: string, profile: Omit<ShopProfile, "isSample">): Promise<void> {
  const values = { shop_name: profile.shopName, language: profile.language, opening_cash_poisha: profile.openingCashPoisha };
  const { data, error } = await supabase.from("shop_profiles").update(values).eq("owner_id", ownerId).select("owner_id");
  if (error) throw new Error(error.message);
  if (data && data.length > 0) return;
  const inserted = await supabase.from("shop_profiles").insert({ owner_id: ownerId, ...values });
  if (inserted.error) throw new Error(inserted.error.message);
}
