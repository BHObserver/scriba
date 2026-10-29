/**
 * Pre-commit privacy check for this public repository.
 * Fails if staged files include env files, images outside public/, private test
 * data, raw model responses, or anything that looks like a credential.
 *
 *   bun run secrets:scan
 */
import { execSync } from "node:child_process";

const staged = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const problems: string[] = [];
const FORBIDDEN_PATHS: Array<[RegExp, string]> = [
  [/(^|\/)\.env(?!\.example$)/, "environment file"],
  [/^private-test-data\//, "private test data"],
  [/\.private\.jsonl?$/, "private JSON"],
  [/\.(jpe?g|png|webp|heic|heif)$/i, "image file"],
  [/\.(dump|backup|sql\.gz)$/, "database dump"],
];
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // The all-x placeholder in .env.example is allowed; anything else after the prefix is not.
  [/sb_secret_(?!x+(?![A-Za-z0-9_-]))[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT (possibly a service-role key)"],
  // [ \t] rather than \s: an empty `KEY=` must not match the next line's content.
  [/META_MODEL_API_KEY[ \t]*=[ \t]*\S{8,}/, "Meta API key assignment"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(sk|mk|ma)-[A-Za-z0-9]{24,}/, "API key-like token"],
];

for (const file of staged) {
  for (const [re, label] of FORBIDDEN_PATHS) {
    if (re.test(file) && !(label === "image file" && file.startsWith("public/"))) problems.push(`${file}: ${label}`);
  }
  let content = "";
  try {
    content = execSync(`git show :"${file}"`, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } catch {
    continue;
  }
  for (const [re, label] of SECRET_PATTERNS) if (re.test(content)) problems.push(`${file}: contains a ${label}`);
}

if (problems.length > 0) {
  console.error("Refusing: staged files may expose private data or secrets:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`OK: ${staged.length} staged file(s) checked; no secrets, env files or private images found.`);
