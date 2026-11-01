import type { ComponentProps } from "react";
import { notFound } from "next/navigation";
import { readingFromRun } from "@/components/capture/problems";
import { checkBackHref, checkHref } from "@/components/check/back-href";
import { CheckScreen } from "@/components/check/check-screen";
import { STORAGE_BUCKET, getLimitsConfig } from "@/lib/config";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import { UUID_RE, requireUser } from "@/lib/server/auth";
import { RUN_SUMMARY_COLUMNS, loadRunReview, toRunSummary } from "@/lib/server/review-data";

export const metadata = { title: "Check" };

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Pages captured together arrive as `?pages=id1,id2,…` so the screen can say "page 2 of 3". */
function pageQueue(param: string | string[] | undefined, documentId: string): string[] {
  const ids = (typeof param === "string" ? param.split(",") : []).filter((id) => UUID_RE.test(id)).slice(0, 20);
  return ids.includes(documentId) ? ids : [documentId];
}

/** Everything the screen needs, read through the user's own client (RLS). Reads only. */
async function loadCheck(supabase: Supabase, documentId: string, queue: string[], backHref: string): Promise<ComponentProps<typeof CheckScreen> | null> {
  const { data: doc } = await supabase.from("ledger_documents").select("id, storage_path, width, height, uploaded_at").eq("id", documentId).maybeSingle();
  if (!doc) return null;

  const [{ data: signed }, { data: runRows }] = await Promise.all([
    supabase.storage.from(STORAGE_BUCKET).createSignedUrl(doc.storage_path, 600),
    supabase.from("extraction_runs").select(RUN_SUMMARY_COLUMNS).eq("document_id", documentId).order("started_at", { ascending: false }),
  ]);
  const runs = (runRows ?? []).map(toRunSummary);
  const succeeded = runs.find((r) => r.status === "succeeded") ?? null;
  const review = succeeded ? await loadRunReview(supabase, succeeded.id) : null;
  const latest = runs[0] ?? null;

  const index = queue.indexOf(documentId);
  const nextId = queue[index + 1];
  return {
    documentId,
    photo: {
      src: signed?.signedUrl ?? null,
      width: doc.width,
      height: doc.height,
      turns: turnsForProcessingMode((succeeded ?? latest)?.processingMode),
    },
    review: review && succeeded ? { runId: succeeded.id, page: review.page, rows: review.rows } : null,
    serverReading: review ? null : readingFromRun(latest, Date.now(), getLimitsConfig().stalePendingMs),
    capturedAt: doc.uploaded_at,
    readTurns: turnsForProcessingMode(latest?.processingMode),
    pageNumber: index + 1,
    pageCount: queue.length,
    nextHref: nextId ? checkHref(nextId, { pages: queue, from: backHref }) : null,
    backHref,
    detailsHref: `/documents/${documentId}`,
  };
}

/**
 * Opening this page only reads stored data. It never sends the photo to be read.
 * `?from=` names the screen back returns to (History, Close the day); otherwise Today.
 */
export default async function CheckPage({ params, searchParams }: PageProps<"/check/[documentId]">) {
  const { documentId } = await params;
  const { pages, from } = await searchParams;
  if (!UUID_RE.test(documentId)) notFound();
  const { supabase } = await requireUser(`/check/${documentId}`);
  const props = await loadCheck(supabase, documentId, pageQueue(pages, documentId), checkBackHref(from));
  if (!props) notFound();
  return <CheckScreen key={documentId} {...props} />;
}
