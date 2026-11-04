/**
 * Clears the demo shop's data and keeps the account, to test from the first scan (F2, 4 Nov).
 *
 *   bun scripts/clear-shop.ts          dry run: counts what would go, deletes nothing
 *   bun scripts/clear-shop.ts --yes    delete it
 *
 * Goes: every page and memo with its photos, readings, lines, answers and khata records; the
 * customers and suppliers; closed days; evaluations; the shop profile (so the app opens its
 * welcome once and the sample badge is gone). Stays: the login (SCRIBA_DEMO_EMAIL, same password)
 * and its settings, such as the handwriting-learning switch. Refuses any user not marked as the
 * demo. To bring the sample shop back instead, use `bun scripts/seed-demo.ts --yes`.
 */
import { createClient } from "@supabase/supabase-js";

const write = process.argv.includes("--yes");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (.env.local).");
const email = (process.env.SCRIBA_DEMO_EMAIL ?? "demo-shop@example.com").toLowerCase();
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const must = <R extends { data: unknown; error: { message: string } | null }>(r: R, what: string): R["data"] => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function findUser() {
  for (let page = 1; ; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 1000 }), "list users")!;
    const found = users.find((u) => u.email?.toLowerCase() === email);
    if (found || users.length < 1000) return found ?? null;
  }
}

const user = await findUser();
if (!user) throw new Error(`No user ${email}. Nothing was changed.`);
if (user.user_metadata?.scriba_demo !== true) throw new Error(`${email} is not the demo account. Nothing was changed.`);
const owner = user.id;
console.log(`Project ${new URL(url).hostname.split(".")[0]} · ${email} (${owner.slice(0, 8)})`);

/** Tables cleared by owner. Deleting the pages takes their readings, lines, answers, findings and records with them. */
const TABLES = ["ledger_documents", "day_closes", "evaluation_runs", "parties", "shop_profiles"] as const;
const count = async (table: string) => (await db.from(table).select("*", { count: "exact", head: true }).eq("owner_id", owner)).count ?? 0;
for (const table of [...TABLES, "confirmed_records"]) console.log(`  ${table}: ${await count(table)}`);

const docs = (must(await db.from("ledger_documents").select("storage_path, camera_path, dataset_label").eq("owner_id", owner), "list pages") ?? []) as Array<{
  storage_path: string;
  camera_path: string | null;
  dataset_label: string | null;
}>;
// Sample pages have no photo; the rest have the page (and maybe the camera original) in storage.
const photos = docs.filter((d) => d.dataset_label !== "demo-sample").flatMap((d) => [d.storage_path, ...(d.camera_path ? [d.camera_path] : [])]);
console.log(`  photos: ${photos.length}`);
if (!write) {
  console.log("Dry run. Add --yes to delete it; the login stays.");
  process.exit(0);
}

for (let i = 0; i < photos.length; i += 100) must(await db.storage.from("scriba-originals").remove(photos.slice(i, i + 100)), "remove photos");
for (const table of TABLES) must(await db.from(table).delete().eq("owner_id", owner), `clear ${table}`);
const left = (await Promise.all([...TABLES, "confirmed_records"].map(count))).reduce((a, b) => a + b, 0);
console.log(left === 0 ? "Cleared. Sign in as before: the app opens its welcome." : `Something was left: ${left} rows.`);
