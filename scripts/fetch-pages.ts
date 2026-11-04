/**
 * F2 fix 6: the demo account's pages uploaded since a time, saved as test samples in the
 * git-ignored private-test-data/. Read-only. The user said on 4 Nov to fix the line pictures on
 * the pages he scanned for the video, so these are measured with `bun scripts/measure-boxes.ts`.
 *
 *   bun scripts/fetch-pages.ts --since 2026-11-04T12:00:00Z              # list
 *   bun scripts/fetch-pages.ts --since 2026-11-04T12:00:00Z --download f2  # save, see below
 *
 * --download <name> writes to private-test-data/<name>/, per page n in upload order:
 *   Pn.jpg              the stored page, as the model saw it (flattened since C2)
 *   Pn.camera.jpg       the camera original, when there is one
 *   Pn.reading.private.json  the latest succeeded reading: run id, prompt, schema, the model's raw output
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
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const since = arg("--since");
const folder = arg("--download");
if (!since || Number.isNaN(Date.parse(since))) {
  console.error("Give --since <ISO time>.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 200 });
if (usersError) throw usersError;
const demo = users.users.find((u) => u.email === demoEmail);
if (!demo) throw new Error("The demo account was not found.");

const { data: docs, error } = await db
  .from("ledger_documents")
  .select("id, kind, storage_path, camera_path, mime_type, width, height, original_filename, uploaded_at, status")
  .eq("owner_id", demo.id)
  .gte("uploaded_at", since)
  .order("uploaded_at");
if (error) throw error;

async function fetchFile(path: string): Promise<Uint8Array> {
  const { data, error: dlError } = await db.storage.from(STORAGE_BUCKET).download(path);
  if (dlError || !data) throw dlError ?? new Error(`download failed: ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}
const out = folder ? join("private-test-data", folder) : null;
if (out) mkdirSync(out, { recursive: true });
const save = (file: string, bytes: Uint8Array | string) => {
  writeFileSync(file, bytes);
  console.log(`  saved ${file}`);
};

for (const [i, doc] of (docs ?? []).entries()) {
  const name = `P${i + 1}`;
  console.log(`${name}  ${doc.id}  ${doc.kind ?? "page"}  ${doc.width}x${doc.height}  ${doc.status}  ${doc.uploaded_at}  camera:${doc.camera_path ? "yes" : "no"}`);
  const { data: runs, error: runsError } = await db
    .from("extraction_runs")
    .select("id, status, model_id, prompt_version, schema_version, processing_mode, started_at, elapsed_ms, estimated_cost_usd, raw_output_text")
    .eq("document_id", doc.id)
    .order("started_at");
  if (runsError) throw runsError;
  for (const r of runs ?? []) console.log(`  run ${r.id.slice(0, 8)}  ${r.status}  ${r.prompt_version}  ${r.processing_mode}  ${r.elapsed_ms ?? "?"} ms  $${r.estimated_cost_usd ?? "?"}`);
  const latest = (runs ?? []).filter((r) => r.status === "succeeded").at(-1);
  if (!out) continue;
  const ext = doc.mime_type === "image/png" ? "png" : doc.mime_type === "image/webp" ? "webp" : "jpg";
  save(join(out, `${name}.${ext}`), await fetchFile(doc.storage_path));
  if (doc.camera_path) save(join(out, `${name}.camera.jpg`), await fetchFile(doc.camera_path));
  if (latest) {
    const reading = {
      documentId: doc.id,
      runId: latest.id,
      promptVersion: latest.prompt_version,
      schemaVersion: latest.schema_version,
      processingMode: latest.processing_mode,
      width: doc.width,
      height: doc.height,
      rawOutputText: latest.raw_output_text,
    };
    save(join(out, `${name}.reading.private.json`), JSON.stringify(reading, null, 2));
  }
}
