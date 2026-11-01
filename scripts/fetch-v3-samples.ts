/**
 * Download the demo account's 1 Nov test photos (the Pran page, PLAN_V3) into the git-ignored
 * private-test-data/v3/ folder. Read-only: lists the documents and downloads the originals.
 * The user agreed on 2 Nov that these two photos can be test samples.
 *
 *   bun scripts/fetch-v3-samples.ts            # list what would be fetched
 *   bun scripts/fetch-v3-samples.ts --download
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

const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 200 });
if (usersError) throw usersError;
const demo = users.users.find((u) => u.email === demoEmail);
if (!demo) throw new Error("The demo account was not found.");

const { data: docs, error } = await db
  .from("ledger_documents")
  .select("id, storage_path, mime_type, width, height, byte_size, uploaded_at")
  .eq("owner_id", demo.id)
  .gte("uploaded_at", "2026-11-01T18:00:00Z")
  .lt("uploaded_at", "2026-11-01T19:30:00Z")
  .order("uploaded_at");
if (error) throw error;
for (const d of docs ?? []) console.log(`${d.id}  ${d.width}x${d.height}  ${d.byte_size} bytes  ${d.uploaded_at}`);

if (process.argv.includes("--download")) {
  const dir = join("private-test-data", "v3");
  mkdirSync(dir, { recursive: true });
  for (const [i, d] of (docs ?? []).entries()) {
    const { data, error: dlError } = await db.storage.from(STORAGE_BUCKET).download(d.storage_path);
    if (dlError || !data) throw dlError ?? new Error("download failed");
    const ext = d.mime_type === "image/png" ? "png" : d.mime_type === "image/webp" ? "webp" : "jpg";
    const file = join(dir, `V${String(i + 1).padStart(2, "0")}.${ext}`);
    writeFileSync(file, new Uint8Array(await data.arrayBuffer()));
    console.log(`Saved ${file}`);
  }
}
