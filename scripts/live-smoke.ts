/**
 * Explicit live smoke test of the whole server path: hosted Supabase plus Meta.
 * Never run by tests or builds. Each run makes 2 paid Meta calls (about 2 cents).
 *
 *   bun run dev                                   # in another terminal
 *   bun run live:smoke                            # against http://localhost:3000
 *   SCRIBA_APP_URL=https://<deployment> bun run live:smoke
 *
 * Creates two throwaway confirmed users with the secret key, uploads S01 and S03 as
 * user A exactly like the browser does, analyzes them through the real API routes
 * (S03 turned 270°), confirms one page, checks cross-user isolation as user B, then
 * deletes the documents through the app and both users through the admin API.
 * Needs private-test-data/ledger-snippets/S01.jpg and S03.jpg. On a deployment with
 * SCRIBA_EXTRACTION_ALLOWED_EMAILS set, the throwaway users cannot analyze.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SNIPPETS = process.argv[2] ?? join("private-test-data", "ledger-snippets");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const APP = (process.env.SCRIBA_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const REF = new URL(SUPABASE_URL).hostname.split(".")[0]!;
const BUCKET = "scriba-originals";
const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SECRET, noPersist);

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

type TestUser = { id: string; client: SupabaseClient; session: Session; cookie: string };

function cookieFor(session: Session): string {
  // @supabase/ssr default: "base64-" + base64url(JSON session), chunked above 3180 chars.
  const name = `sb-${REF}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const size = 3180;
  if (value.length <= size) return `${name}=${value}`;
  const parts: string[] = [];
  for (let i = 0; i * size < value.length; i++) parts.push(`${name}.${i}=${value.slice(i * size, (i + 1) * size)}`);
  return parts.join("; ");
}

async function makeUser(tag: string): Promise<TestUser> {
  const email = `scriba-smoke-${tag}-${Date.now()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${tag}: ${error?.message}`);
  const client = createClient(SUPABASE_URL, PUB, noPersist);
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw new Error(`signIn ${tag}: ${signInError?.message}`);
  return { id: data.user.id, client, session: signedIn.session, cookie: cookieFor(signedIn.session) };
}

async function api(user: TestUser, method: string, path: string, body?: unknown) {
  const res = await fetch(`${APP}${path}`, {
    method,
    redirect: "manual",
    headers: { Cookie: user.cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // pages return HTML
  }
  return { status: res.status, json, text };
}

async function uploadAndRegister(user: TestUser, file: string) {
  const bytes = new Uint8Array(readFileSync(join(SNIPPETS, file)));
  const storagePath = `${user.id}/${randomUUID()}.jpg`;
  const up = await user.client.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "image/jpeg" });
  check(`upload ${file} into own folder`, !up.error, up.error?.message);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const reg = await api(user, "POST", "/api/documents", { storagePath, originalFilename: file, clientSha256: sha });
  check(`register ${file}`, reg.status === 201, `HTTP ${reg.status} ${reg.json.error ?? ""}`);
  return { documentId: reg.json.documentId as string, storagePath };
}

const created: TestUser[] = [];
try {
  const a = await makeUser("a");
  const b = await makeUser("b");
  created.push(a, b);
  check("two throwaway users created and signed in", true);

  // --- A: upload and analyze S01 as uploaded ---------------------------------
  const s01 = await uploadAndRegister(a, "S01.jpg");
  const req1 = randomUUID();
  const an1 = await api(a, "POST", `/api/documents/${s01.documentId}/analyze`, { requestId: req1, mode: "use_cache", processingMode: "baseline_original" });
  check("analyze S01 (paid call)", an1.json.kind === "completed", `HTTP ${an1.status} ${an1.json.kind ?? ""} ${an1.json.message ?? an1.json.error ?? ""}`);
  const replay = await api(a, "POST", `/api/documents/${s01.documentId}/analyze`, { requestId: req1, mode: "use_cache" });
  check("same request id is de-duplicated, no new call", replay.json.kind === "duplicate_request", String(replay.json.kind));
  const cached = await api(a, "POST", `/api/documents/${s01.documentId}/analyze`, { requestId: randomUUID(), mode: "use_cache" });
  check("second click reuses the cached result, no new call", cached.json.kind === "cached", String(cached.json.kind));

  // --- A: upload sideways S03 and analyze it turned upright --------------------
  const s03 = await uploadAndRegister(a, "S03.jpg");
  const an3 = await api(a, "POST", `/api/documents/${s03.documentId}/analyze`, { requestId: randomUUID(), mode: "use_cache", processingMode: "rotate_270" });
  check("analyze S03 turned 270° (paid call)", an3.json.kind === "completed", `HTTP ${an3.status} ${an3.json.kind ?? ""} ${an3.json.message ?? an3.json.error ?? ""}`);

  const { data: runs } = await admin
    .from("extraction_runs")
    .select("id, document_id, status, processing_mode, input_tokens, output_tokens, reasoning_tokens, estimated_cost_usd, elapsed_ms")
    .eq("owner_id", a.id)
    .order("started_at");
  console.log("      runs:", JSON.stringify(runs));
  check("exactly 2 paid runs recorded", runs?.length === 2 && runs.every((r) => r.status === "succeeded"));
  const run3 = runs?.find((r) => r.document_id === s03.documentId);
  check("S03 run records rotate_270", run3?.processing_mode === "rotate_270");

  const { data: entries3 } = await admin.from("extracted_entries").select("line_order, transaction_type, source_text, amount_text").eq("run_id", run3!.id).order("line_order");
  console.log("      S03 entries:", JSON.stringify(entries3));
  const { data: findings3 } = await admin.from("validation_findings").select("rule_id, status").eq("run_id", run3!.id);
  console.log("      S03 findings:", JSON.stringify(findings3));

  // --- A: the pages render ----------------------------------------------------
  const page = await api(a, "GET", `/documents/${s03.documentId}`);
  check("document page renders for the owner", page.status === 200 && page.text.includes("turned 270° clockwise"), `HTTP ${page.status}`);

  // --- A: confirm the S03 lines that pass every check -------------------------
  const { data: rows3 } = await admin.from("entry_reviews").select("id, version, line_order").eq("run_id", run3!.id).order("line_order");
  const confirm = await api(a, "POST", `/api/runs/${run3!.id}/confirm`, {
    entries: (rows3 ?? []).map((r) => ({ id: r.id, expectedVersion: r.version, acknowledgements: { findings: [], uncheckable: false } })),
  });
  console.log("      confirm:", confirm.status, JSON.stringify(confirm.json).slice(0, 600));
  const { count: confirmedCount } = await admin.from("confirmed_records").select("id", { count: "exact", head: true }).eq("run_id", run3!.id);
  check("confirmation writes records", confirm.status < 300 && (confirmedCount ?? 0) > 0, `HTTP ${confirm.status}, ${confirmedCount} records`);

  // --- B: isolation -----------------------------------------------------------
  const bDocs = await b.client.from("ledger_documents").select("id");
  check("B sees none of A's documents", !bDocs.error && bDocs.data?.length === 0, `${bDocs.data?.length} rows`);
  const bRuns = await b.client.from("extraction_runs").select("id");
  check("B sees none of A's runs", !bRuns.error && bRuns.data?.length === 0, `${bRuns.data?.length} rows`);
  const bSigned = await b.client.storage.from(BUCKET).createSignedUrl(s01.storagePath, 60);
  check("B cannot sign a URL for A's photo", Boolean(bSigned.error) || !bSigned.data?.signedUrl);
  const bDownload = await b.client.storage.from(BUCKET).download(s01.storagePath);
  check("B cannot download A's photo", Boolean(bDownload.error));
  const bUpload = await b.client.storage.from(BUCKET).upload(`${a.id}/${randomUUID()}.jpg`, new Uint8Array([1, 2, 3]), { contentType: "image/jpeg" });
  check("B cannot upload into A's folder", Boolean(bUpload.error));
  const bPage = await api(b, "GET", `/documents/${s01.documentId}`);
  check("B gets 404 for A's document page", bPage.status === 404, `HTTP ${bPage.status}`);
  const bAnalyze = await api(b, "POST", `/api/documents/${s01.documentId}/analyze`, { requestId: randomUUID(), mode: "fresh" });
  check("B cannot analyze A's document", bAnalyze.status === 404, `HTTP ${bAnalyze.status}`);
  const bForge = await b.client.from("extraction_runs").insert({
    document_id: s01.documentId, owner_id: b.id, request_id: randomUUID(), cache_key: "0".repeat(64),
    model_id: "m", prompt_version: "p", schema_version: "s", processing_mode: "baseline_original",
  });
  check("a user cannot forge an extraction run", Boolean(bForge.error), bForge.error?.code);
  const aForge = await a.client.from("extraction_runs").insert({
    document_id: s01.documentId, owner_id: a.id, request_id: randomUUID(), cache_key: "0".repeat(64),
    model_id: "m", prompt_version: "p", schema_version: "s", processing_mode: "baseline_original",
  });
  check("even the owner cannot write runs directly", Boolean(aForge.error), aForge.error?.code);

  // --- A: delete through the app ----------------------------------------------
  for (const doc of [s01, s03]) {
    const del = await api(a, "DELETE", `/api/documents/${doc.documentId}`);
    check(`delete document via the app`, del.status === 200 && del.json.originalRemoved === true, `HTTP ${del.status} ${JSON.stringify(del.json)}`);
  }
} catch (err) {
  failures++;
  console.log("ERROR", err instanceof Error ? err.message : err);
} finally {
  for (const u of created) {
    const { data: leftovers } = await admin.storage.from(BUCKET).list(u.id);
    if (leftovers?.length) await admin.storage.from(BUCKET).remove(leftovers.map((o) => `${u.id}/${o.name}`));
    const { error } = await admin.auth.admin.deleteUser(u.id);
    console.log(`cleanup user ${u.id.slice(0, 8)}: ${error ? `FAILED ${error.message}` : "deleted"}${leftovers?.length ? ` (removed ${leftovers.length} leftover objects)` : ""}`);
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
}
