/**
 * Copies Scriba's server and public settings from an env file into the linked Vercel project,
 * through the Vercel CLI. Values go to the CLI on stdin and are never printed.
 *
 *   bun scripts/vercel-env.ts                         dry run: lists the keys it would set
 *   bun scripts/vercel-env.ts --yes                   set them for Production (overwrites)
 *   … --env-file .env.production.local                read another file
 *   … --environment preview                           another Vercel environment
 *   … SCRIBA_EXTRACTION_ALLOWED_EMAILS=a@x.com,b@y.com  extra or overriding values
 *
 * Needs `npx vercel login` and `npx vercel link` first. Keys used only by local scripts
 * (the demo login, the Supabase access token) are skipped, and so are VERCEL_* keys: `vercel
 * link` writes its own VERCEL_OIDC_TOKEN into .env.local, and Vercel sets those itself. The
 * two API secrets are stored as Vercel secrets; everything else as readable config. A change
 * needs a redeploy.
 */
import { readFileSync } from "node:fs";

const VERCEL = ["npx", "--yes", "vercel@65.9.0"];
const SECRETS = new Set(["SUPABASE_SECRET_KEY", "META_MODEL_API_KEY"]);
const LOCAL_ONLY = new Set(["SCRIBA_DEMO_EMAIL", "SCRIBA_DEMO_PASSWORD", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SCRIBA_APP_URL"]);

const argv = process.argv.slice(2);
const write = argv.includes("--yes");
const option = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const envFile = option("--env-file", ".env.local");
const environment = option("--environment", "production");
const overrides = argv.filter((a) => /^[A-Z][A-Z0-9_]*=/.test(a));

function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(raw);
    if (!m) continue;
    let value = m[2]!.trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out.set(m[1]!, value);
  }
  return out;
}

const values = parseEnv(readFileSync(envFile, "utf8"));
for (const o of overrides) {
  const i = o.indexOf("=");
  values.set(o.slice(0, i), o.slice(i + 1));
}

let failures = 0;
for (const [key, value] of values) {
  if (LOCAL_ONLY.has(key) || key.startsWith("VERCEL_")) continue;
  if (value === "") {
    console.log(`skip  ${key}  (empty: the app default applies)`);
    continue;
  }
  const kind = SECRETS.has(key) ? "secret" : "config";
  if (!write) {
    console.log(`plan  ${key}  (${kind}, ${environment})`);
    continue;
  }
  const proc = Bun.spawn([...VERCEL, "env", "add", key, "--environment", environment, "--force", "--yes", SECRETS.has(key) ? "--sensitive" : "--no-sensitive"], {
    stdin: new Blob([value]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code === 0) console.log(`set   ${key}  (${kind}, ${environment})`);
  else {
    failures++;
    // The CLI's error text never contains the value (it came in on stdin), so it is safe to show.
    const err = (await new Response(proc.stderr).text()).trim().split("\n").slice(-2).join(" ");
    console.log(`FAIL  ${key}  ${err}`);
  }
}
if (!write) console.log("\nDry run. Add --yes to write these to Vercel.");
process.exit(failures ? 1 : 0);
