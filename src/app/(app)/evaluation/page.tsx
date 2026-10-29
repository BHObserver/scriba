import Link from "next/link";
import { GroundTruthEditor } from "@/components/ground-truth-editor";
import { RunEvaluationButton } from "@/components/run-evaluation-button";
import { Card, CardHeader, Notice, Pill, formatDateTime } from "@/components/ui";
import { type EvaluationSummary, type Ratio, SCORED_FIELDS, formatRatio } from "@/lib/evaluation/metrics";
import { PRICING_SOURCE } from "@/lib/pricing";
import { requireUser } from "@/lib/server/auth";

function Metric({ label, ratio, help }: { label: string; ratio: Ratio; help: string }) {
  return (
    <div className="rounded-md border border-rule p-3">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{formatRatio(ratio)}</p>
      <p className="mt-1 text-xs text-ink-soft">{help}</p>
    </div>
  );
}

export default async function EvaluationPage() {
  const { supabase } = await requireUser("/evaluation");
  const [{ data: runs }, { count: cacheHits }, { data: docs }, { data: truths }, { data: evaluations }] = await Promise.all([
    supabase.from("extraction_runs").select("status, model_id, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, elapsed_ms, estimated_cost_usd"),
    supabase.from("extraction_cache_hits").select("id", { count: "exact", head: true }),
    supabase.from("ledger_documents").select("id, original_filename, sample_label, uploaded_at").order("uploaded_at"),
    supabase.from("ground_truth_annotations").select("document_id, gt_version").order("gt_version", { ascending: false }),
    supabase.from("evaluation_runs").select("id, created_at, label, model_id, prompt_version, schema_version, validator_version, metrics_version, processing_mode, sample_count, summary").order("created_at", { ascending: false }).limit(10),
  ]);

  const all = runs ?? [];
  const byStatus = all.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  const withUsage = all.filter((r) => r.input_tokens != null);
  const sum = (k: "input_tokens" | "cached_input_tokens" | "output_tokens" | "reasoning_tokens") => withUsage.reduce((s, r) => s + (r[k] ?? 0), 0);
  const cost = all.reduce((s, r) => s + (r.estimated_cost_usd != null ? Number(r.estimated_cost_usd) : 0), 0);
  const timed = all.filter((r) => r.status === "succeeded" && r.elapsed_ms != null);
  const avgSeconds = timed.length ? timed.reduce((s, r) => s + r.elapsed_ms!, 0) / timed.length / 1000 : null;
  const latestGt = new Map<string, number>();
  for (const t of truths ?? []) if (!latestGt.has(t.document_id)) latestGt.set(t.document_id, t.gt_version);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Evaluation &amp; usage</h1>
        <p className="text-sm text-ink-soft">Measured values only, always with their counts. Small samples are exploratory.</p>
      </div>

      <Card>
        <CardHeader title="Meta API usage" subtitle={`Estimated with published prices (${PRICING_SOURCE.retrieved}); image input is billed through the reported input tokens.`} />
        <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Requests sent" value={String(all.length)} />
          <Stat label="Succeeded" value={String(byStatus.succeeded ?? 0)} />
          <Stat label="Failed / incomplete / uncertain" value={`${(byStatus.failed ?? 0) + (byStatus.invalid_output ?? 0)} / ${byStatus.incomplete ?? 0} / ${byStatus.uncertain ?? 0}`} />
          <Stat label="Cache hits (no request)" value={String(cacheHits ?? 0)} />
          <Stat label="Tokens in / out (reasoning)" value={`${sum("input_tokens")} / ${sum("output_tokens")} (${sum("reasoning_tokens")})`} />
          <Stat label="Estimated cost" value={`$${cost.toFixed(4)}`} />
        </div>
        <p className="px-4 pb-4 text-xs text-ink-soft">
          Average model wait for successful runs: {avgSeconds != null ? `${avgSeconds.toFixed(1)} s (n = ${timed.length})` : "N/A"}. Usage is missing for requests where Meta returned none.
        </p>
      </Card>

      <Card>
        <CardHeader title="Ground truth" subtitle="Written by a person from each photo, independently of the model. Stored privately." action={<RunEvaluationButton />} />
        <ul className="divide-y divide-rule">
          {(docs ?? []).map((d, i) => (
            <li key={d.id} className="px-4 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/documents/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {d.sample_label ?? d.original_filename ?? `Photo ${i + 1}`}
                </Link>
                {latestGt.has(d.id) ? <Pill tone="pass">ground truth v{latestGt.get(d.id)}</Pill> : <Pill>no ground truth</Pill>}
              </div>
              <GroundTruthEditor documentId={d.id} sampleId={d.sample_label ?? `S${String(i + 1).padStart(2, "0")}`} currentVersion={latestGt.get(d.id) ?? null} />
            </li>
          ))}
          {(docs ?? []).length === 0 ? <li className="px-4 py-6 text-sm text-ink-soft">Upload photos first.</li> : null}
        </ul>
      </Card>

      {(evaluations ?? []).length === 0 ? (
        <Notice tone="info">No evaluation yet. Add ground truth for analyzed photos, then run an evaluation. It reuses stored results and makes no API calls.</Notice>
      ) : (
        (evaluations ?? []).map((e) => {
          const s = e.summary as EvaluationSummary;
          return (
            <Card key={e.id}>
              <CardHeader
                title={`Evaluation · ${formatDateTime(e.created_at)}`}
                subtitle={`${e.sample_count} photo(s) · ${e.label} · ${e.model_id} · ${e.processing_mode} · ${e.prompt_version} · ${e.schema_version} · ${e.validator_version} · ${e.metrics_version}`}
                action={<Pill tone="warn">{e.label}</Pill>}
              />
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Field accuracy" ratio={s.fieldAccuracy} help="Labelled fields read exactly right (types, items, numbers after normalization)." />
                <Metric label="Exact amount accuracy" ratio={s.exactAmountAccuracy} help="Labelled amounts read exactly right." />
                <Metric label="Wrong-amount escape rate" ratio={s.wrongAmountEscapeRate} help={`Wrong amounts that a check could test but nothing flagged. ${s.incorrectAmountsOutsideChecks} more wrong amount(s) had no applicable check.`} />
                <Metric label="Error rate among unflagged amounts" ratio={s.errorRateAmongAccepted} help="Of the amounts that would pass without any warning, how many are wrong." />
                <Metric label="Review rate" ratio={s.reviewRate} help="Extracted lines needing human attention (blocker or warning)." />
                <Metric label="False-alarm rate" ratio={s.falseAlarmRate} help="Correctly read lines that were still flagged." />
                <Metric label="Intentional errors caught" ratio={s.expectedFlagRecall} help="Lines that are wrong on purpose in the source (e.g. a wrong written total) and were flagged." />
                <div className="rounded-md border border-rule p-3 text-xs text-ink-soft">
                  <p className="font-medium text-ink">Per field</p>
                  <ul className="mt-1 space-y-0.5">
                    {SCORED_FIELDS.map((f) => (
                      <li key={f} className="flex justify-between gap-2"><span>{f}</span><span className="tabular-nums">{formatRatio(s.fieldAccuracyByField[f])}</span></li>
                    ))}
                  </ul>
                  <p className="mt-1">Photos with a different number of lines than the ground truth: {s.entryCountMismatches}</p>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-rule p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}
