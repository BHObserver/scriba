import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { partyAccount } from "@/lib/insights/accounts";
import { dhakaDate } from "@/lib/ledger/dates";
import type { PartyKind } from "@/lib/ledger/parties";
import type { MemoForPage } from "@/lib/memo/match";
import { storedMemo } from "@/lib/memo/parse";
import { NEW_ROW_PREFIX, type ReviewState } from "@/lib/questions/answer";
import { buildQuestions, partiesToExplain } from "@/lib/questions/engine";
import type { KnownParty, QuestionInput } from "@/lib/questions/types";
import { entryValuesSchema, pageValuesSchema } from "@/lib/review/values";
import { type RunReview, loadRunReview } from "./review-data";
import { loadShop } from "./shop-data";

/**
 * A run's review plus what the questions need: the model's doubts, the shop's parties, the
 * photo's day, the company memos photographed with the page (U4), and the last due of a party a
 * "same party?" question names. That last part reads the whole book, so it is loaded only when
 * such a question is asked, and `dues: false` skips it where only the answer is checked (the
 * sentences aren't shown).
 */
export async function loadQuestionInput(
  supabase: SupabaseClient,
  runId: string,
  o: { dues?: boolean } = {},
): Promise<{ review: RunReview; input: QuestionInput } | null> {
  const review = await loadRunReview(supabase, runId);
  if (!review || review.run.status !== "succeeded") return null;
  const [{ data: parties }, { data: doc }, memos] = await Promise.all([
    supabase.from("parties").select("id, kind, display_name, normalized_key").is("merged_into", null).limit(5000),
    supabase.from("ledger_documents").select("uploaded_at").eq("id", review.run.documentId).maybeSingle(),
    loadMemos(supabase, review.run.documentId),
  ]);
  const known: KnownParty[] = (parties ?? []).map((p) => ({ id: p.id as string, kind: p.kind as PartyKind, name: p.display_name as string, key: p.normalized_key as string }));
  const input: QuestionInput = {
    page: review.page.values,
    rows: review.rows,
    doubts: review.extraction?.doubts ?? [],
    parties: known,
    capturedOn: doc?.uploaded_at ? dhakaDate(new Date(doc.uploaded_at as string)) : null,
    ...(memos.length > 0 ? { memos } : {}),
  };
  const explain = o.dues === false ? [] : partiesToExplain(buildQuestions(input));
  if (explain.length > 0) input.dues = await lastDues(supabase, explain, input.capturedOn ?? dhakaDate(new Date()));
  return { review, input };
}

/** The company memos photographed with a page, oldest first, each with its latest reading. A memo not read yet is left out. */
async function loadMemos(supabase: SupabaseClient, documentId: string): Promise<MemoForPage[]> {
  const { data: docs } = await supabase.from("ledger_documents").select("id").eq("memo_for", documentId).order("uploaded_at").limit(20);
  if (!docs || docs.length === 0) return [];
  const { data: runs } = await supabase
    .from("extraction_runs")
    .select("id, document_id, result")
    .in("document_id", docs.map((d) => d.id as string))
    .eq("status", "succeeded")
    .order("started_at", { ascending: false });
  const latest = new Map<string, { id: string; result: unknown }>();
  for (const r of runs ?? []) if (!latest.has(r.document_id as string)) latest.set(r.document_id as string, { id: r.id as string, result: r.result });
  return docs.flatMap((d) => {
    const run = latest.get(d.id as string);
    const memo = run ? storedMemo(run.result) : null;
    return run && memo ? [{ documentId: d.id as string, runId: run.id, memo }] : [];
  });
}

/** What the khata showed for these parties on the photo's day, from confirmed records, worked out as the dues screen does. */
async function lastDues(supabase: SupabaseClient, partyIds: readonly string[], asOf: string): Promise<Map<string, number>> {
  const { book } = await loadShop(supabase);
  const dues = new Map<string, number>();
  for (const id of partyIds) {
    const account = partyAccount(book, id, asOf);
    if (account && account.entries.length > 0) dues.set(id, account.balancePoisha);
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
