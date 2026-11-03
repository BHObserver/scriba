/**
 * T6: the five pages the user scanned on 2 Nov ("Page 1"–"Page 5"), as test samples in the
 * git-ignored private-test-data/. Read-only: lists the pages and their readings, and downloads.
 * The user agreed on 3 Nov that these five pages can be test samples.
 *
 *   bun scripts/fetch-t6-samples.ts             # list the pages, their runs and his lines
 *   bun scripts/fetch-t6-samples.ts --download  # also save them, see below
 *
 * --download writes, per page n (1-5):
 *   v3/Pn.jpg             the stored page, as the model saw it (flattened since C2)
 *   v3/Pn.camera.jpg      the camera original, when there is one
 *   v3/Pn.lines.json      his lines as they stand (entry_reviews), for the draft ground truth
 *   responses/Pn.jpg.<run start>.stored.private.json
 *                         each succeeded reading, in live:extract's format, so the scorer reads it
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const demoEmail = process.env.SCRIBA_DEMO_EMAIL;
if (!url || !key || !demoEmail) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and SCRIBA_DEMO_EMAIL must be set (.env.local).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const download = process.argv.includes("--download");

/** The five documents, by the id prefixes noted in the 2 Nov test, in page order. */
const PAGES = ["b6a9cbba", "157e7df4", "b4aea1e6", "5ceb678e", "7449002b"];

const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 200 });
if (usersError) throw usersError;
const demo = users.users.find((u) => u.email === demoEmail);
if (!demo) throw new Error("The demo account was not found.");

const { data: docs, error } = await db
  .from("ledger_documents")
  .select("id, storage_path, camera_path, mime_type, width, height, original_filename, uploaded_at, status")
  .eq("owner_id", demo.id)
  .gte("uploaded_at", "2026-11-02T00:00:00Z")
  .lt("uploaded_at", "2026-11-03T00:00:00Z")
  .order("uploaded_at");
if (error) throw error;

const ext = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");
const save = (file: string, bytes: Uint8Array | string) => {
  writeFileSync(file, bytes);
  console.log(`  saved ${file}`);
};
async function fetchFile(path: string): Promise<Uint8Array> {
  const { data, error: dlError } = await db.storage.from(STORAGE_BUCKET).download(path);
  if (dlError || !data) throw dlError ?? new Error(`download failed: ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

if (download) {
  mkdirSync(join("private-test-data", "v3"), { recursive: true });
  mkdirSync(join("private-test-data", "responses"), { recursive: true });
}

for (const [i, prefix] of PAGES.entries()) {
  const doc = (docs ?? []).find((d) => d.id.startsWith(prefix));
  const name = `P${i + 1}`;
  if (!doc) {
    console.log(`${name}  ${prefix}: not found`);
    continue;
  }
  console.log(`${name}  ${doc.id}  ${doc.width}x${doc.height}  ${doc.status}  ${doc.original_filename ?? "—"}  ${doc.uploaded_at}`);

  const { data: runs, error: runsError } = await db
    .from("extraction_runs")
    .select("id, status, model_id, prompt_version, schema_version, processing_mode, started_at, elapsed_ms, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens, estimated_cost_usd, raw_output_text")
    .eq("document_id", doc.id)
    .order("started_at");
  if (runsError) throw runsError;
  for (const r of runs ?? []) {
    console.log(`  run ${r.id.slice(0, 8)}  ${r.status}  ${r.model_id}  ${r.prompt_version}  ${r.schema_version}  ${r.elapsed_ms ?? "?"} ms  $${r.estimated_cost_usd ?? "?"}  ${r.started_at}`);
  }

  const latest = (runs ?? []).filter((r) => r.status === "succeeded").at(-1);
  const { data: lines, error: linesError } = latest
    ? await db.from("entry_reviews").select("line_order, status, entry_values, extracted_entry_id").eq("run_id", latest.id).order("line_order")
    : { data: [], error: null };
  if (linesError) throw linesError;
  const byStatus = (lines ?? []).reduce<Record<string, number>>((n, l) => ({ ...n, [l.status]: (n[l.status] ?? 0) + 1 }), {});
  console.log(`  lines ${Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(", ") || "none"}`);

  if (!download) continue;
  save(join("private-test-data", "v3", `${name}.${ext(doc.mime_type)}`), await fetchFile(doc.storage_path));
  if (doc.camera_path) save(join("private-test-data", "v3", `${name}.camera.jpg`), await fetchFile(doc.camera_path));
  save(join("private-test-data", "v3", `${name}.lines.json`), JSON.stringify({ documentId: doc.id, runId: latest?.id ?? null, status: doc.status, lines }, null, 2));
  for (const r of (runs ?? []).filter((x) => x.status === "succeeded")) {
    const usage =
      r.input_tokens == null
        ? null
        : { inputTokens: r.input_tokens, cachedInputTokens: r.cached_input_tokens ?? 0, outputTokens: r.output_tokens ?? 0, reasoningTokens: r.reasoning_tokens ?? 0, totalTokens: r.total_tokens ?? 0 };
    const result = { ok: true, summary: { status: "completed", incompleteReason: null, outputText: r.raw_output_text, refusal: null }, usage, elapsedMs: r.elapsed_ms ?? 0 };
    const stamp = String(r.started_at).replace(/[:.+]/g, "-");
    const saved = { runId: r.id, model: r.model_id, promptVersion: r.prompt_version, schemaVersion: r.schema_version, processingMode: r.processing_mode, result };
    save(join("private-test-data", "responses", `${name}.jpg.${stamp}.stored.private.json`), JSON.stringify(saved, null, 2));
  }
}
