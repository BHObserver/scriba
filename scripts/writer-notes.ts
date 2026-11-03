/**
 * T6: the writer's notes for one test page, built as the app builds them (`buildWriterProfile`,
 * `personalHints`, `personalUserText`, `stackLineCrops`) from his other test pages. Offline: no call.
 *
 * The app learns from what the model read on a line against what he confirmed. Here "read" is
 * each page's saved reading and "confirmed" is the page's checked ground truth, so the notes are
 * what the app would send once those pages were confirmed as written, in a shop with no seeded pages.
 *
 *   bun scripts/writer-notes.ts P3 P1 P2 P3 P4 P5
 *       the notes for reading P3, learned from P1, P2, P4 and P5 (the target is always left out)
 *
 * For each page Pn it needs private-test-data/ground-truth/Pn.json, private-test-data/v3/Pn.jpg
 * and one saved reading, private-test-data/responses/Pn.jpg.*.stored.private.json (newest first).
 * It writes private-test-data/notes/<target>.json (text, key, the lines shown) and <target>.ref.jpg.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { alignByContent } from "@/lib/evaluation/align";
import { groundTruthSchema } from "@/lib/evaluation/ground-truth";
import { parseModelResponse } from "@/lib/extraction/parse";
import { personalUserText } from "@/lib/extraction/prompt";
import { type LineCrop, stackLineCrops } from "@/lib/images/crop";
import { type LearningSample, buildWriterProfile, personalHints } from "@/lib/learning/profile";
import { toBanglaDigits } from "@/lib/numerals";

const [target, ...pages] = process.argv.slice(2);
if (!target || pages.length === 0) {
  console.error("Usage: bun scripts/writer-notes.ts <target page> <pages to learn from>...");
  process.exit(2);
}

const root = "private-test-data";
const responses = readdirSync(join(root, "responses"));
const bn = (v: string | null) => (v == null ? null : toBanglaDigits(v));

const samples: LearningSample[] = [];
const photos = new Map<string, Uint8Array>();
const boxes = new Map<string, LineCrop>();
for (const [order, page] of pages.entries()) {
  if (page === target) continue;
  const truth = groundTruthSchema.parse(JSON.parse(readFileSync(join(root, "ground-truth", `${page}.json`), "utf8")));
  const file = responses.filter((f) => f.startsWith(`${page}.jpg.`) && f.endsWith(".stored.private.json")).sort().at(-1);
  if (!file) throw new Error(`No saved reading for ${page}.`);
  const saved = JSON.parse(readFileSync(join(root, "responses", file), "utf8"));
  const parsed = parseModelResponse(saved.result.summary, { promptVersion: saved.promptVersion, schemaVersion: saved.schemaVersion });
  if (!parsed.ok) throw new Error(`${file}: ${parsed.kind}`);
  const entries = parsed.extraction.entries;
  photos.set(page, new Uint8Array(readFileSync(join(root, "v3", `${page}.jpg`))));

  for (const pair of alignByContent(truth.entries, entries)) {
    if (pair.gtLine == null) continue;
    const g = truth.entries.find((e) => e.line === pair.gtLine)!;
    const x = pair.line == null ? null : entries.find((e) => e.line === pair.line)!;
    const recordId = `${page}:L${g.line}`;
    if (x?.bbox) boxes.set(recordId, { photoKey: page, bytes: photos.get(page)!, turns: 0, box: x.bbox });
    samples.push({
      recordId,
      documentId: page,
      // The pages were uploaded a second apart in this order; the last one is the newest.
      confirmedAt: `2026-11-02T13:36:${String(20 + order).padStart(2, "0")}Z`,
      read: x ? { quantityText: x.values.quantityText, rateText: x.values.rateText, amountText: x.values.amountText, balanceText: x.values.balanceText } : null,
      confirmed: { item: g.item, unit: g.unit, quantityText: bn(g.quantity), rateText: bn(g.rate), amountText: bn(g.amount), balanceText: bn(g.balance) },
      hasCrop: !!x?.bbox,
      sum: g.type === "subtotal" || g.type === "closing_balance",
    });
  }
}

const profile = buildWriterProfile(samples, { excludeDocumentId: target });
let hints = personalHints(profile);
if (!hints) {
  console.log(`Nothing to send for ${target}: no repeated misread and no line to show.`);
  process.exit(0);
}
const image = await stackLineCrops(hints.references.map((r) => boxes.get(r.recordId)!));
if (!image) hints = personalHints({ ...profile, references: [] })!;
const text = personalUserText(hints, { withImage: image != null });

const out = join(root, "notes");
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, `${target}.json`),
  JSON.stringify(
    {
      target,
      learnedFrom: pages.filter((p) => p !== target),
      key: hints.key,
      text,
      reference: image ? `${target}.ref.jpg` : null,
      references: hints.references.map((r) => r.recordId),
      confusions: profile.confusions.map((c) => ({ written: c.written, read: c.read, count: c.count, lines: c.recordIds })),
    },
    null,
    2,
  ),
);
if (image) writeFileSync(join(out, `${target}.ref.jpg`), image);
console.log(`Notes for ${target} (key ${hints.key}), learned from ${pages.filter((p) => p !== target).join(", ")}:`);
console.log(`  all mix-ups: ${profile.confusions.map((c) => `${c.written}→${c.read} ×${c.count}`).join(", ") || "none"}`);
console.log(`  references: ${hints.references.map((r) => r.recordId).join(", ") || "none"}`);
console.log(text.replace(/^/gm, "  | "));
