/**
 * F2 fix 10: which parts get split at his pen strokes (`src/lib/extraction/separators.ts`), on every
 * stored reading of his pages. $0: no model calls. Prints each reading's parts after snapping, with
 * the parts that were split marked, so every split can be checked against the photo by eye.
 *
 *   bun scripts/measure-parts.ts            # every reading
 *   bun scripts/measure-parts.ts --only f5-P2
 *   bun scripts/measure-parts.ts --strokes  # also list the strokes found
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseModelResponse } from "@/lib/extraction/parse";
import { grayForSnap, snapExtraction } from "@/lib/images/snap-boxes";

const ROOT = "private-test-data";
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const only = arg("--only");
const showStrokes = process.argv.includes("--strokes");

type Reading = { page: string; image: string; label: string; outputText: string; promptVersion: string; schemaVersion: string };

function readings(): Reading[] {
  const out: Reading[] = [];
  const responses = join(ROOT, "responses");
  for (const page of ["P1", "P2", "P3", "P4", "P5", "V01.flat", "V02.flat"]) {
    const image = join(ROOT, "v3", `${page}.jpg`);
    if (!existsSync(responses)) break;
    for (const f of readdirSync(responses).filter((f) => f.startsWith(`${page}.jpg.`) && f.endsWith(".json"))) {
      const j = JSON.parse(readFileSync(join(responses, f), "utf8"));
      const text = j.result?.summary?.outputText;
      if (!j.result?.ok || typeof text !== "string" || !j.schemaVersion) continue;
      out.push({ page: `v3-${page}`, image, label: f.replace(`${page}.jpg.`, "").replace(".private.json", ""), outputText: text, promptVersion: j.promptVersion, schemaVersion: j.schemaVersion });
    }
  }
  // His pages for the video, saved by scripts/fetch-pages.ts.
  for (const set of ["f2", "f3", "f4", "f5"]) {
    const dir = join(ROOT, set);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".reading.private.json"))) {
      const page = f.replace(".reading.private.json", "");
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      out.push({ page: `${set}-${page}`, image: join(dir, `${page}.jpg`), label: "stored", outputText: j.rawOutputText, promptVersion: j.promptVersion, schemaVersion: j.schemaVersion ?? "scriba-extraction-3" });
    }
  }
  return out.filter((r) => !only || r.page === only);
}

let split = 0;
let pages = 0;
for (const r of readings()) {
  const parsed = parseModelResponse({ status: "completed", incompleteReason: null, outputText: r.outputText, refusal: null }, { promptVersion: r.promptVersion, schemaVersion: r.schemaVersion });
  if (!parsed.ok || !existsSync(r.image)) continue;
  const before = parsed.extraction;
  const { extraction: after, snap } = snapExtraction(await grayForSnap(readFileSync(r.image)), before);
  const was = new Set((before.blocks ?? []).map((b) => b.id));
  const made = (after.blocks ?? []).filter((b) => !was.has(b.id)).length;
  pages++;
  split += made;
  console.log(`\n${r.page} ${r.label}: ${made} split${snap.applied ? "" : ` (not snapped: ${snap.reason})`}`);
  if (showStrokes) console.log("  strokes " + snap.strokes.map((s) => `${s.y.toFixed(0)}[${s.x0.toFixed(0)}-${s.x1.toFixed(0)}]`).join(" "));
  if (made === 0 && !only) continue;
  const byLine = [...after.entries].sort((a, b) => a.line - b.line);
  for (const b of after.blocks ?? []) {
    const old = before.blocks?.find((x) => x.id === b.id);
    const mark = !old ? "NEW " : old.kind !== b.kind || old.party !== b.party ? "CHG " : "    ";
    console.log(`  ${mark}${b.id} ${b.kind}${b.party ? ` ${b.party}` : ""}${b.title ? ` «${b.title}»` : ""}`);
    for (const e of byLine.filter((e) => e.values.block === b.id)) {
      const was = before.entries.find((x) => x.candidateId === e.candidateId)!;
      const t = was.values.type === e.values.type ? e.values.type : `${was.values.type}→${e.values.type}`;
      console.log(`         ${e.values.sourceText}  (${t})`);
    }
  }
}
console.log(`\n${pages} readings, ${split} parts made by splitting.`);
