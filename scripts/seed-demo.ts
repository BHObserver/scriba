/**
 * Seeds the demo shop (নমুনা দোকান) into the Supabase project in .env.local.
 *
 *   bun scripts/seed-demo.ts            dry run: prints the plan, writes nothing
 *   bun scripts/seed-demo.ts --yes      wipe and reseed the demo user only
 *   … --photos                          also add S01 and S04 (the author's development pages,
 *                                       from private-test-data) as today's unchecked pages,
 *                                       with their stored prompt-4 readings: no Meta call
 *
 * The demo user is SCRIBA_DEMO_EMAIL (default demo-shop@example.com) with SCRIBA_DEMO_PASSWORD;
 * both are appended to .env.local when missing. Re-running deletes that user and everything
 * it owns, then creates it again. It refuses to touch a user that isn't marked as the demo.
 * Sample pages have no photo (`dataset_label = demo-sample`); every line is confirmed through
 * the same database functions and record builder as the app.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { parseModelResponse } from "@/lib/extraction/parse";
import type { EntryValues, PageValues } from "@/lib/ledger/types";
import { confirmRecordFor, findingRows } from "@/lib/review/confirm-record";
import { type ReviewRow, toValidationInput } from "@/lib/review/state";
import { DEMO_PROFILE, closeSnapshots, demoShop } from "@/lib/shop/demo";
import { DOCUMENT_COLUMNS, type DocumentRow, type PartyRow, RECORD_COLUMNS, type RecordRow, DEMO_PHOTO_DATASET, SAMPLE_PAGE_DATASET, toBookInput } from "@/lib/shop/rows";
import { VALIDATOR_VERSION, deriveNumbers, validateLedger } from "@/lib/validation/engine";

const args = new Set(process.argv.slice(2));
const write = args.has("--yes");
const withPhotos = args.has("--photos");
const PHOTO_PAGES = [
  { id: "S01", response: "S01.jpg.2026-10-31T18-03-12-935Z.private.json" },
  { id: "S04", response: "S04.jpg.2026-10-31T18-03-36-271Z.private.json" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (.env.local).");
const email = process.env.SCRIBA_DEMO_EMAIL ?? "demo-shop@example.com";
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
/** The data of a successful call (never read where a call returns none); throws on an error. */
const must = <R extends { data: unknown; error: { message: string } | null }>(r: R, what: string): NonNullable<R["data"]> => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as NonNullable<R["data"]>;
};
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

const now = new Date();
const shop = demoShop(now);
const lineCount = shop.pages.reduce((n, p) => n + p.lines.length, 0);
console.log(`Project ${new URL(url).hostname.split(".")[0]} · demo user ${email}`);
console.log(`Plan: ${shop.pages.length} sample pages, ${lineCount} lines, ${shop.closes.length} closed days, today ${shop.today}${withPhotos ? ", plus S01 and S04 unchecked" : ""}.`);
if (!write) {
  console.log("Dry run. Add --yes to wipe and reseed the demo user.");
  process.exit(0);
}

// 1. The demo user: delete it (and everything it owns) if it exists, then create it again.
async function findUser() {
  for (let page = 1; ; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 1000 }), "list users");
    const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found || users.length < 1000) return found ?? null;
  }
}
const existing = await findUser();
if (existing) {
  if (existing.user_metadata?.scriba_demo !== true) throw new Error(`${email} exists but is not the demo account. Nothing was changed.`);
  const docs = must(await db.from("ledger_documents").select("storage_path, dataset_label").eq("owner_id", existing.id), "list pages");
  const paths = (docs ?? []).filter((d) => d.dataset_label !== SAMPLE_PAGE_DATASET).map((d) => d.storage_path as string);
  if (paths.length > 0) must(await db.storage.from("scriba-originals").remove(paths), "remove photos");
  must(await db.auth.admin.deleteUser(existing.id), "delete demo user");
  console.log(`Deleted the old demo user and its ${docs?.length ?? 0} pages.`);
}
let password = process.env.SCRIBA_DEMO_PASSWORD;
if (!password) {
  password = randomBytes(15).toString("base64url");
  appendFileSync(".env.local", `\nSCRIBA_DEMO_EMAIL=${email}\nSCRIBA_DEMO_PASSWORD=${password}\n`);
  console.log("Wrote SCRIBA_DEMO_EMAIL and SCRIBA_DEMO_PASSWORD to .env.local.");
}
const { user } = must(
  await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { scriba_demo: true } }),
  "create demo user",
);
const owner = user!.id;
must(await db.from("shop_profiles").insert({ owner_id: owner, shop_name: DEMO_PROFILE.shopName, language: DEMO_PROFILE.language, opening_cash_poisha: DEMO_PROFILE.openingCashPoisha, is_sample: true }), "shop profile");

// 2. A page: document → reading (scriba_complete_extraction) → optionally confirm every line.
// `read`: what the reading said when he corrected the line (sample misreads for P3); else it read `values`.
type Entry = { values: EntryValues; read?: EntryValues; candidateId: string; line: number; bbox: unknown; reviewFields: string[]; uncertaintyReason: string | null };
async function addPage(p: {
  document: Record<string, unknown>;
  run: { model: string; promptVersion: string; schemaVersion: string; result: unknown; startedAt: string };
  page: PageValues;
  entries: Entry[];
  confirm: boolean;
}) {
  const doc = must(await db.from("ledger_documents").insert({ owner_id: owner, ...p.document }).select("id").single(), "page");
  const run = must(
    await db
      .from("extraction_runs")
      .insert({
        document_id: doc.id, owner_id: owner, request_id: randomUUID(), cache_key: sha(`demo:${randomUUID()}`), model_id: p.run.model,
        prompt_version: p.run.promptVersion, schema_version: p.run.schemaVersion, processing_mode: "baseline_original", started_at: p.run.startedAt,
      })
      .select("id")
      .single(),
    "reading",
  );
  const asRows = (ids: Array<{ id: string; version: number }>): ReviewRow[] =>
    p.entries.map((e, i) => ({ id: ids[i]!.id, extractedEntryId: null, lineOrder: e.line, values: e.values, reviewFields: [], status: "draft", version: ids[i]!.version, candidate: { candidateId: e.candidateId, values: e.read ?? e.values, bbox: null, reviewFields: [], uncertaintyReason: null } }));
  const draft = asRows(p.entries.map(() => ({ id: randomUUID(), version: 1 })));
  const findings = validateLedger(toValidationInput({ page: { values: p.page, version: 1, reviewStartedAt: null }, rows: draft }));
  const ok = (n: { ok: true; value: number } | { ok: false } | null) => (n && n.ok ? n.value : null);
  must(
    await db.rpc("scriba_complete_extraction", {
      p_owner_id: owner,
      p_run_id: run.id,
      p_run: { elapsed_ms: 0, estimated_cost_usd: 0, result: p.run.result, validator_version: VALIDATOR_VERSION },
      p_entries: p.entries.map((e) => {
        const r = e.read ?? e.values;
        const n = deriveNumbers(r);
        return {
          candidate_id: e.candidateId, line_order: e.line, source_text: r.sourceText, transaction_type: r.type, customer_alias: r.customer,
          item_name: r.item, quantity_text: r.quantityText, quantity_milli: ok(n.quantity), unit: r.unit, unit_rate_text: r.rateText,
          unit_rate_poisha: ok(n.rate), amount_text: r.amountText, amount_poisha: ok(n.amount), balance_text: r.balanceText,
          balance_poisha: ok(n.balance), crossed_out: r.crossedOut, bbox: e.bbox, review_fields: e.reviewFields,
          uncertainty_reason: e.uncertaintyReason, entry_values: e.values,
        };
      }),
      p_page: p.page,
      p_findings: findingRows(findings),
    }),
    "store reading",
  );
  if (!p.confirm) return;

  const stored = must(await db.from("entry_reviews").select("id, version").eq("run_id", run.id).order("line_order"), "lines");
  const rows = asRows(stored as Array<{ id: string; version: number }>);
  const input = toValidationInput({ page: { values: p.page, version: 1, reviewStartedAt: null }, rows });
  const checked = validateLedger(input);
  const types = rows.map((r) => r.values.type);
  must(
    await db.rpc("scriba_confirm_entries", {
      p_owner_id: owner,
      p_run_id: run.id,
      p_confirmation_id: randomUUID(),
      p_validator_version: VALIDATOR_VERSION,
      p_records: rows.map((r, i) => confirmRecordFor(r, input.entries[i]!, checked, p.page, types)),
      p_findings: findingRows(checked),
    }),
    "confirm",
  );
}

let done = 0;
for (const p of shop.pages) {
  await addPage({
    document: {
      storage_path: `${owner}/sample/${p.key}.jpg`, sha256: sha(`${owner}:${p.key}`), mime_type: "image/jpeg", byte_size: 1, width: 1000, height: 1414,
      uploaded_at: p.capturedAt, business_date: p.date, business_date_source: "written", dataset_label: SAMPLE_PAGE_DATASET, sample_label: "Sample page",
    },
    run: { model: "sample", promptVersion: "sample", schemaVersion: "sample", result: { sample: true, page: p.page }, startedAt: p.capturedAt },
    page: p.page,
    entries: p.lines.map((values, i) => ({ values, read: p.readAs?.[i], candidateId: `L${i + 1}`, line: i + 1, bbox: null, reviewFields: [], uncertaintyReason: null })),
    confirm: true,
  });
  if (++done % 10 === 0) console.log(`  ${done}/${shop.pages.length} pages`);
}

// 3. Day closes, computed by the engine from the records just stored.
const [records, documents, parties] = await Promise.all([
  db.from("confirmed_records").select(RECORD_COLUMNS).eq("owner_id", owner).range(0, 4999),
  db.from("ledger_documents").select(DOCUMENT_COLUMNS).eq("owner_id", owner).range(0, 4999),
  db.from("parties").select("id, kind, display_name, normalized_key, merged_into").eq("owner_id", owner),
]);
const input = toBookInput({
  records: must(records, "records") as RecordRow[],
  documents: must(documents, "pages") as DocumentRow[],
  parties: must(parties, "parties") as PartyRow[],
  closes: [],
  profile: { ...DEMO_PROFILE, isSample: true },
});
for (const s of closeSnapshots(input, shop.closes)) {
  must(
    await db.from("day_closes").insert({
      owner_id: owner, business_date: s.businessDate, opening_cash_poisha: s.openingCashPoisha, expected_cash_poisha: s.expectedCashPoisha,
      counted_cash_poisha: s.countedCashPoisha, breakdown: s.breakdown, record_ids: s.recordIds, closed_at: `${s.businessDate}T21:00:00+06:00`,
    }),
    "day close",
  );
}

// 4. Optional: the author's development pages, read but not checked, so the deck can be shown on real handwriting.
if (withPhotos) {
  for (const [i, { id, response }] of PHOTO_PAGES.entries()) {
    const bytes = new Uint8Array(readFileSync(`private-test-data/ledger-snippets/${id}.jpg`));
    const saved = JSON.parse(readFileSync(`private-test-data/responses/${response}`, "utf8"));
    const parsed = parseModelResponse(saved.result.summary);
    if (!parsed.ok) throw new Error(`${id}: the stored reading doesn't parse`);
    const { width = 0, height = 0 } = await sharp(bytes).rotate().metadata().then((m) => (m.orientation && m.orientation >= 5 ? { width: m.height, height: m.width } : m));
    const path = `${owner}/demo/${id}.jpg`;
    must(await db.storage.from("scriba-originals").upload(path, bytes, { contentType: "image/jpeg", upsert: true }), `upload ${id}`);
    const at = new Date(now.getTime() - (PHOTO_PAGES.length - i) * 60_000).toISOString();
    await addPage({
      document: { storage_path: path, sha256: sha(bytes), original_filename: `${id}.jpg`, mime_type: "image/jpeg", byte_size: bytes.length, width, height, uploaded_at: at, dataset_label: DEMO_PHOTO_DATASET, sample_label: id },
      run: { model: saved.model, promptVersion: saved.promptVersion, schemaVersion: saved.schemaVersion, result: parsed.extraction, startedAt: at },
      page: { dateText: parsed.extraction.page.dateText, ledgerType: parsed.extraction.page.ledgerType, accountName: parsed.extraction.page.accountName },
      entries: parsed.extraction.entries.map((e) => ({ values: e.values, candidateId: e.candidateId, line: e.line, bbox: e.bbox, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason })),
      confirm: false,
    });
  }
}

console.log(`Done: ${shop.pages.length} pages, ${input.records.length} confirmed lines, ${input.parties.length} parties, ${shop.closes.length} closes${withPhotos ? ", S01 and S04 waiting" : ""}.`);
console.log(`Sign in as ${email} (password in .env.local).`);
