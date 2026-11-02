import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type PagePlace, dueBefore } from "@/lib/insights/accounts";
import { type QuarterTurns, turnsForProcessingMode } from "@/lib/images/orientation";
import { businessDateFor, dhakaDate } from "@/lib/ledger/dates";
import type { PartyKind } from "@/lib/ledger/parties";
import type { MemoForPage } from "@/lib/memo/match";
import { storedMemo } from "@/lib/memo/parse";
import { NEW_ROW_PREFIX, type ReviewState } from "@/lib/questions/answer";
import { bookPartiesOf } from "@/lib/questions/engine";
import type { KnownParty, QuestionInput } from "@/lib/questions/types";
import { entryValuesSchema, pageValuesSchema } from "@/lib/review/values";
import { type RunReview, loadRunReview } from "./review-data";
import { loadShop } from "./shop-data";

/**
 * A run's review plus what the questions need: the model's doubts, the shop's parties (merged
 * spellings too), the photo's day, the company memos photographed with the page (U4), and what
 * the khata showed just before this page for the parties the questions compare with (T3:
 * `bookPartiesOf`). That last part reads the whole book, so it is loaded only when such a party
 * is on the page. The answer route loads it too: the khata's due decides what an answer adds.
 */
export async function loadQuestionInput(
  supabase: SupabaseClient,
  runId: string,
  /** `review`: the run's review, when the caller has already loaded it. */
  o: { review?: RunReview } = {},
): Promise<{ review: RunReview; input: QuestionInput; memos: PageMemo[] } | null> {
  const review = o.review ?? (await loadRunReview(supabase, runId));
  if (!review || review.run.status !== "succeeded") return null;
  const [{ data: parties }, { data: doc }, pageMemos] = await Promise.all([
    supabase.from("parties").select("id, kind, display_name, normalized_key, merged_into").limit(5000),
    supabase.from("ledger_documents").select("uploaded_at, business_date, business_date_source").eq("id", review.run.documentId).maybeSingle(),
    loadMemos(supabase, review.run.documentId),
  ]);
  const known: KnownParty[] = (parties ?? []).map((p) => ({
    id: p.id as string,
    kind: p.kind as PartyKind,
    name: p.display_name as string,
    key: p.normalized_key as string,
    ...(p.merged_into ? { mergedInto: p.merged_into as string } : {}),
  }));
  const memos = pageMemos.map((m) => m.memo);
  const input: QuestionInput = {
    page: review.page.values,
    rows: review.rows,
    doubts: review.extraction?.doubts ?? [],
    parties: known,
    capturedOn: doc?.uploaded_at ? dhakaDate(new Date(doc.uploaded_at as string)) : null,
    ...(memos.length > 0 ? { memos } : {}),
  };
  const inBook = bookPartiesOf(input);
  if (inBook.length > 0 && doc?.uploaded_at) {
    const capturedAt = doc.uploaded_at as string;
    // The page's day as confirming will set it: his own choice, else the written date, else the photo's.
    const date = doc.business_date_source === "user" ? (doc.business_date as string) : businessDateFor(review.page.values.dateText, new Date(capturedAt)).iso;
    input.dues = await duesBefore(supabase, inBook, { documentId: review.run.documentId, date, capturedAt });
  }
  return { review, input, memos: pageMemos };
}

/** A company memo of the page with where its photo is, for the check screen's memo strip. */
export type PageMemo = { memo: MemoForPage; photo: { storagePath: string; width: number; height: number; turns: QuarterTurns } };

/** The company memos photographed with a page, oldest first, each with its latest reading. A memo not read yet is left out. */
async function loadMemos(supabase: SupabaseClient, documentId: string): Promise<PageMemo[]> {
  const { data: docs } = await supabase.from("ledger_documents").select("id, storage_path, width, height").eq("memo_for", documentId).order("uploaded_at").limit(20);
  if (!docs || docs.length === 0) return [];
  const { data: runs } = await supabase
    .from("extraction_runs")
    .select("id, document_id, result, processing_mode")
    .in("document_id", docs.map((d) => d.id as string))
    .eq("status", "succeeded")
    .order("started_at", { ascending: false });
  const latest = new Map<string, { id: string; result: unknown; mode: string | null }>();
  for (const r of runs ?? []) if (!latest.has(r.document_id as string)) latest.set(r.document_id as string, { id: r.id as string, result: r.result, mode: r.processing_mode as string | null });
  return docs.flatMap((d) => {
    const run = latest.get(d.id as string);
    const memo = run ? storedMemo(run.result) : null;
    if (!run || !memo) return [];
    const photo = { storagePath: d.storage_path as string, width: d.width as number, height: d.height as number, turns: turnsForProcessingMode(run.mode) };
    return [{ memo: { documentId: d.id as string, runId: run.id, memo }, photo }];
  });
}

/**
 * What the khata showed for these parties just before the page, from confirmed records, worked out
 * as the dues screen does. A party with nothing in the book before the page is left out.
 */
async function duesBefore(supabase: SupabaseClient, partyIds: readonly string[], page: PagePlace): Promise<Map<string, number>> {
  const { book } = await loadShop(supabase);
  const dues = new Map<string, number>();
  for (const id of partyIds) {
    const due = dueBefore(book, id, page);
    if (due != null) dues.set(id, due);
  }
  return dues;
}

export type SaveResult = { ok: true } | { ok: false; status: number; message: string };

const CHANGED_ELSEWHERE = "This page was changed elsewhere. Reload to see the latest version.";

/**
 * Save an answer: the review as it is after the answer (`after`), written as the user (RLS) with
 * the same version checks as a manual edit. Added lines first, then edited lines, then the page
 * with the answer recorded, so the answer is only recorded once its changes are in.
 *
 * Not one transaction: if a later write finds the page changed, the writes before it stay (each
 * one is complete and audited) and the caller reloads. The questions are worked out from what is
 * saved, so a half-saved answer shows up as the question asked again, never as a wrong figure.
 */
export async function saveAnswer(supabase: SupabaseClient, ownerId: string, review: RunReview, after: ReviewState): Promise<SaveResult> {
  const before = new Map(review.rows.map((r) => [r.id, r]));

  for (const row of after.rows.filter((r) => r.id.startsWith(NEW_ROW_PREFIX))) {
    const { error } = await supabase.from("entry_reviews").insert({
      run_id: review.run.id,
      owner_id: ownerId,
      document_id: review.run.documentId,
      line_order: row.lineOrder,
      entry_values: entryValuesSchema.parse(row.values),
      review_fields: [],
      status: "draft",
    });
    if (error) return { ok: false, status: 500, message: "The answer could not be saved." };
  }

  for (const row of after.rows) {
    const old = before.get(row.id);
    if (!old) continue;
    const valuesChanged = JSON.stringify(old.values) !== JSON.stringify(row.values);
    const fieldsChanged = JSON.stringify(old.reviewFields) !== JSON.stringify(row.reviewFields);
    if (!valuesChanged && !fieldsChanged && old.status === row.status) continue;
    if (old.status !== "draft") return { ok: false, status: 409, message: "This line is already confirmed or rejected." };
    const { data, error } = await supabase
      .from("entry_reviews")
      .update({ entry_values: entryValuesSchema.parse(row.values), review_fields: row.reviewFields, status: row.status })
      .eq("id", row.id)
      .eq("version", old.version)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, status: 500, message: "The answer could not be saved." };
    if (!data) return { ok: false, status: 409, message: CHANGED_ELSEWHERE };
  }

  const { data, error } = await supabase
    .from("page_reviews")
    .update({ page_values: pageValuesSchema.parse(after.page) })
    .eq("run_id", review.run.id)
    .eq("version", review.page.version)
    .select("run_id")
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: "The answer could not be saved." };
  if (!data) return { ok: false, status: 409, message: CHANGED_ELSEWHERE };
  return { ok: true };
}
