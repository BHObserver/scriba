import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyzePanel } from "@/components/analyze-panel";
import { DeleteDocumentButton } from "@/components/delete-document-button";
import { OrientationProvider, PhotoPreview } from "@/components/photo-orientation";
import { ReviewWorkspace } from "@/components/review-workspace";
import { Card, CardHeader, Notice, Pill, formatBytes, formatDateTime } from "@/components/ui";
import { STORAGE_BUCKET } from "@/lib/config";
import { describeTurns, turnsForProcessingMode } from "@/lib/images/orientation";
import { UUID_RE, requireUser } from "@/lib/server/auth";
import { RUN_SUMMARY_COLUMNS, loadRunReview, toRunSummary } from "@/lib/server/review-data";

const RUN_TONE: Record<string, "pass" | "fail" | "warn" | "neutral"> = {
  succeeded: "pass",
  failed: "fail",
  invalid_output: "fail",
  incomplete: "warn",
  uncertain: "warn",
  pending: "neutral",
};

/** Opening this page only reads stored data. It never triggers an extraction. */
export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const { run: runParam, duplicate } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireUser(`/documents/${id}`);

  const { data: doc } = await supabase
    .from("ledger_documents")
    .select("id, storage_path, sha256, original_filename, mime_type, byte_size, width, height, has_gps_metadata, uploaded_at, status, sample_label")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const [{ data: signed }, { data: runRows }] = await Promise.all([
    supabase.storage.from(STORAGE_BUCKET).createSignedUrl(doc.storage_path, 600),
    supabase.from("extraction_runs").select(RUN_SUMMARY_COLUMNS).eq("document_id", id).order("started_at", { ascending: false }),
  ]);
  const runs = (runRows ?? []).map(toRunSummary);
  const succeeded = runs.filter((r) => r.status === "succeeded");
  const chosen =
    (typeof runParam === "string" && succeeded.find((r) => r.id === runParam)) || succeeded[0] || null;
  const review = chosen ? await loadRunReview(supabase, chosen.id) : null;
  const latest = runs[0] ?? null;
  const lastFailure =
    latest && latest.status !== "succeeded" && latest.status !== "pending"
      ? { status: latest.status, message: latest.errorMessage }
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/documents" className="text-sm text-accent hover:underline">← Documents</Link>
          <h1 className="mt-1 text-xl font-semibold">{doc.sample_label ?? doc.original_filename ?? "Ledger photo"}</h1>
          <p className="text-xs text-ink-soft">
            Uploaded {formatDateTime(doc.uploaded_at)} · {doc.width}×{doc.height} · {formatBytes(doc.byte_size)} · {doc.mime_type} ·
            SHA-256 <span className="font-mono">{doc.sha256.slice(0, 12)}…</span>
          </p>
        </div>
        <DeleteDocumentButton documentId={doc.id} />
      </div>

      {duplicate ? <Notice tone="info">You had already uploaded this exact photo, so the existing document was opened.</Notice> : null}
      {doc.has_gps_metadata ? (
        <Notice tone="warn">
          This original contains GPS location metadata. It is stored privately. Analyzing it as uploaded sends it to Meta unchanged; a turned copy carries no metadata.
        </Notice>
      ) : null}

      <OrientationProvider key={chosen?.id ?? "none"} initialTurns={turnsForProcessingMode(chosen?.processingMode)}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {review ? (
              <ReviewWorkspace
                key={review.run.id}
                runId={review.run.id}
                imageUrl={signed?.signedUrl ?? null}
                imageSize={{ width: doc.width, height: doc.height }}
                imageTurns={turnsForProcessingMode(review.run.processingMode)}
                initialRows={review.rows}
                initialPage={review.page}
                warnings={review.extraction?.warnings ?? []}
                legibility={review.extraction?.page.legibility ?? null}
              />
            ) : (
              <Card>
                <CardHeader title="Original photograph" subtitle="Not analyzed yet. Nothing has been sent to Meta. Turn it upright with the buttons beside Analyze." />
                <div className="p-3">
                  {signed?.signedUrl ? <PhotoPreview src={signed.signedUrl} size={{ width: doc.width, height: doc.height }} /> : null}
                </div>
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader title="Extraction" subtitle="One request per photo. Edits never call the model." />
              <div className="p-4">
                <AnalyzePanel documentId={doc.id} hasSuccessfulRun={succeeded.length > 0} lastRunFailed={lastFailure} />
              </div>
            </Card>

            {runs.length > 0 ? (
              <Card>
                <CardHeader title="Run history" subtitle="Every real request to Meta, including failures." />
                <ul className="divide-y divide-rule text-xs">
                  {runs.map((r) => (
                    <li key={r.id} className={r.id === chosen?.id ? "bg-paper px-4 py-2" : "px-4 py-2"}>
                      <div className="flex items-center justify-between gap-2">
                        <Pill tone={RUN_TONE[r.status] ?? "neutral"}>{r.status.replaceAll("_", " ")}</Pill>
                        {r.status === "succeeded" && r.id !== chosen?.id ? (
                          <Link href={`/documents/${doc.id}?run=${r.id}`} className="text-accent hover:underline">View</Link>
                        ) : null}
                      </div>
                      <p className="mt-1 text-ink-soft">
                        {formatDateTime(r.startedAt)}
                        {r.isFreshRequest ? " · re-analysis" : ""}
                        {turnsForProcessingMode(r.processingMode) !== 0 ? ` · photo ${describeTurns(turnsForProcessingMode(r.processingMode))}` : ""}
                      </p>
                      <p className="text-ink-soft">
                        {r.modelId} · {r.promptVersion}
                        {r.elapsedMs != null ? ` · ${(r.elapsedMs / 1000).toFixed(1)} s` : ""}
                      </p>
                      {r.inputTokens != null ? (
                        <p className="text-ink-soft">
                          {r.inputTokens} in / {r.outputTokens} out tokens ({r.reasoningTokens ?? 0} reasoning)
                          {r.estimatedCostUsd != null ? ` · ≈ $${r.estimatedCostUsd.toFixed(4)}` : ""}
                        </p>
                      ) : null}
                      {r.errorMessage ? <p className="mt-1 text-fail">{r.errorMessage}</p> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </aside>
        </div>
      </OrientationProvider>
    </div>
  );
}
