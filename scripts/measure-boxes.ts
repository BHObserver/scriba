/**
 * F2 fix 6: does each line's picture show its own line? Measures the model's boxes and the
 * snapped ones (`src/lib/images/ink-rows.ts`) on stored readings of his pages. $0: no model calls.
 *
 *   bun scripts/measure-boxes.ts                 # score every reading that has a truth file
 *   bun scripts/measure-boxes.ts --draw <dir>    # also draw each page and its strips into <dir>
 *   bun scripts/measure-boxes.ts --draft <dir>   # write draft truth files from the snapped rows
 *   bun scripts/measure-boxes.ts --drift bulge   # move the model's boxes first (page2, stretch, bulge, shift, squeeze)
 *
 * Truth: private-test-data/boxes/<page>.json, `{ image, lines: [{ text, top, bottom }] }`, every
 * written line that is an entry, top to bottom, on the 0–1000 grid. Drafted from the found rows,
 * then checked by eye line by line against the photo. A reading's lines are paired with the truth
 * by their text, in order.
 *
 * A picture "shows its line" when the box's middle is within half a line of the true line's
 * middle, the line is then the one in the middle of the strip. "Cut" means the strip (the box
 * with lineWindow's room) leaves out more than a fifth of the true line's height.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";
import { lineWindow } from "@/components/kit/strip-geometry";
import { parseModelResponse } from "@/lib/extraction/parse";
import { type Box, inkMask, removeStrokes } from "@/lib/images/ink-rows";
import { grayForSnap, snapExtraction } from "@/lib/images/snap-boxes";

const ROOT = "private-test-data";
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const drawDir = arg("--draw");
const draftDir = arg("--draft");
const only = arg("--only");
const drift = arg("--drift");
/** Where the model put the lines of his 4 Nov page 2 (true middle → model middle), measured. */
const PAGE2: Array<[number, number]> = [[0, 0], [102, 120], [178, 220], [307, 375], [410, 492], [517, 625], [597, 732], [692, 830], [717, 862], [790, 905], [832, 945], [857, 975], [1000, 1000]];
function interpolate(points: Array<[number, number]>, x: number): number {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return x;
}
/** Ways to move the model's boxes on the grid, like the drift on his 4 Nov pages. */
const DRIFTS: Record<string, (y: number) => number> = {
  page2: (y) => interpolate(PAGE2, y), // his 4 Nov page 2's drift: model place against the true place
  stretch: (y) => 1000 * (1 - (1 - y / 1000) ** 1.3), // a smooth stretch: low in the middle, right at the ends
  bulge: (y) => y + 45 * Math.sin((Math.PI * y) / 1000), // page 1: a line low in the middle, right at the ends
  shift: (y) => y + 40, // every box a line low
  squeeze: (y) => 60 + y * 0.85, // low at the top, high at the bottom
};

type Reading = { page: string; image: string; label: string; outputText: string; promptVersion: string; schemaVersion: string };
type Truth = { image: string; lines: Array<{ text: string; top: number; bottom: number }> };

/** The pages and every stored reading of each. */
function readings(): Reading[] {
  const out: Reading[] = [];
  const responses = join(ROOT, "responses");
  const v3 = ["P1", "P2", "P3", "P4", "P5", "V01.flat", "V02.flat"];
  for (const page of v3) {
    const image = join(ROOT, "v3", `${page}.jpg`);
    for (const f of readdirSync(responses).filter((f) => f.startsWith(`${page}.jpg.`) && f.endsWith(".json"))) {
      const j = JSON.parse(readFileSync(join(responses, f), "utf8"));
      const text = j.result?.summary?.outputText;
      if (!j.result?.ok || typeof text !== "string" || !j.schemaVersion) continue;
      out.push({ page: `v3-${page}`, image, label: f.replace(`${page}.jpg.`, "").replace(".private.json", ""), outputText: text, promptVersion: j.promptVersion, schemaVersion: j.schemaVersion });
    }
  }
  // His pages scanned for the video, saved by scripts/fetch-pages.ts: f2 (4 Nov), f3 (5 Nov).
  for (const set of ["f2", "f3"]) {
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

// --- pairing by text ----------------------------------------------------------------------------

const DIGITS: Record<string, string> = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
const norm = (s: string) => s.replace(/[০-৯]/g, (d) => DIGITS[d]!).replace(/\s+/g, "").toLowerCase();

/** Longest common subsequence over the longer text: 1 the same, 0 nothing alike. */
function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i]![j] = x[i - 1] === y[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
  return dp[x.length]![y.length]! / Math.max(x.length, y.length);
}

/** Read lines paired with truth lines in order, most text in common; below 0.35 stays unpaired. */
function pair(read: string[], truth: string[]): Array<number | null> {
  const s = read.map((r) => truth.map((t) => similarity(r, t)));
  const best = Array.from({ length: read.length + 1 }, () => new Array<number>(truth.length + 1).fill(0));
  for (let i = 1; i <= read.length; i++) {
    for (let j = 1; j <= truth.length; j++) {
      const v = s[i - 1]![j - 1]!;
      best[i]![j] = Math.max(best[i - 1]![j]!, best[i]![j - 1]!, v >= 0.35 ? best[i - 1]![j - 1]! + v : 0);
    }
  }
  const out: Array<number | null> = new Array(read.length).fill(null);
  let i = read.length;
  let j = truth.length;
  while (i > 0 && j > 0) {
    const v = s[i - 1]![j - 1]!;
    if (v >= 0.35 && best[i]![j] === best[i - 1]![j - 1]! + v) out[--i] = --j;
    else if (best[i]![j] === best[i - 1]![j]) i--;
    else j--;
  }
  return out;
}

// --- scoring ------------------------------------------------------------------------------------

type Verdict = "shows" | "cut" | "wrong" | "none";
function verdict(box: Box | null, t: Truth["lines"][number]): Verdict {
  if (!box) return "none";
  const h = t.bottom - t.top;
  const mid = (box.y_min + box.y_max) / 2;
  if (Math.abs(mid - (t.top + t.bottom) / 2) > h / 2) return "wrong";
  const win = lineWindow(box);
  const inside = Math.max(0, Math.min(win.y_max, t.bottom) - Math.max(win.y_min, t.top));
  return inside < h * 0.8 ? "cut" : "shows";
}

// --- drawing ------------------------------------------------------------------------------------

function rect(b: Box, W: number, H: number, color: string, width: number, dash = "") {
  return `<rect x="${(b.x_min * W) / 1000}" y="${(b.y_min * H) / 1000}" width="${((b.x_max - b.x_min) * W) / 1000}" height="${((b.y_max - b.y_min) * H) / 1000}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
}

/** The photo's size upright (EXIF orientation applied). */
async function uprightSize(image: string): Promise<{ W: number; H: number }> {
  const { info } = await sharp(image).rotate().toBuffer({ resolveWithObject: true });
  return { W: info.width, H: info.height };
}

async function drawPage(file: string, image: string, layers: string) {
  const { W, H } = await uprightSize(image);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${layers}</svg>`;
  const upright = await sharp(image).rotate().toBuffer();
  const drawn = await sharp(upright).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  await sharp(drawn).resize({ width: 900 }).png().toFile(file);
}

function stripHtml(image: string, rows: Array<{ id: string; text: string; before: Box | null; after: Box | null; v0: string; v1: string }>, W: number, H: number) {
  const src = `file:///${resolve(image).replaceAll("\\", "/")}`;
  const strip = (b: Box | null) => {
    if (!b) return `<div class="s none">no box</div>`;
    const win = lineWindow(b);
    const bw = (b.x_max - b.x_min) / 1000;
    const scale = 360 / (bw * W); // photo px → strip px across
    const top = (win.y_min / 1000) * H * scale;
    const height = ((win.y_max - win.y_min) / 1000) * H * scale;
    return `<div class="s" style="height:${Math.max(20, height)}px"><img src="${src}" style="width:${W * scale}px;left:${-(b.x_min / 1000) * W * scale}px;top:${-top}px"></div>`;
  };
  return `<!doctype html><meta charset="utf-8"><style>
body{font:14px 'Nirmala UI',sans-serif;margin:8px;background:#fff}
.r{display:grid;grid-template-columns:200px 380px 380px;gap:8px;align-items:center;border-bottom:1px solid #ddd;padding:4px 0}
.s{position:relative;overflow:hidden;width:360px;background:#eee;border:2px solid #999}
.s img{position:absolute;max-width:none}
.ok{color:#080}.bad{color:#c00;font-weight:700}
</style><div class="r"><b>line read</b><b>before (model box)</b><b>after (snapped)</b></div>
${rows.map((r) => `<div class="r"><div>${r.id} ${r.text}<br><span class="${r.v0 === "shows" ? "ok" : "bad"}">${r.v0}</span> → <span class="${r.v1 === "shows" ? "ok" : "bad"}">${r.v1}</span></div>${strip(r.before)}${strip(r.after)}</div>`).join("\n")}`;
}

// --- main ---------------------------------------------------------------------------------------

const totals = { lines: 0, before: { shows: 0, cut: 0, wrong: 0, none: 0 }, after: { shows: 0, cut: 0, wrong: 0, none: 0 }, unpaired: 0 };
const grayCache = new Map<string, Awaited<ReturnType<typeof grayForSnap>>>();
if (drawDir) mkdirSync(drawDir, { recursive: true });
if (draftDir) mkdirSync(draftDir, { recursive: true });
const drafted = new Set<string>();
const htmlPages: string[] = [];

for (const r of readings()) {
  const parsed = parseModelResponse({ status: "completed", incompleteReason: null, outputText: r.outputText, refusal: null }, { promptVersion: r.promptVersion, schemaVersion: r.schemaVersion });
  if (!parsed.ok) {
    console.log(`${r.page} ${r.label}: unparsable (${parsed.kind})`);
    continue;
  }
  // --drift: the model's boxes moved the ways seen on his 4 Nov pages, to see the snap undo it.
  const move = DRIFTS[drift ?? ""];
  if (drift && !move) throw new Error(`--drift is one of ${Object.keys(DRIFTS).join(", ")}`);
  if (move) {
    for (const e of parsed.extraction.entries) {
      if (e.bbox) e.bbox = { ...e.bbox, y_min: Math.max(0, Math.min(1000, move(e.bbox.y_min))), y_max: Math.max(0, Math.min(1000, move(e.bbox.y_max))) };
    }
  }
  const bytes = readFileSync(r.image);
  let gray = grayCache.get(r.image);
  if (!gray) {
    gray = await grayForSnap(bytes);
    grayCache.set(r.image, gray);
  }
  const t0 = performance.now();
  const { extraction, snap } = snapExtraction(gray, parsed.extraction, process.argv.includes("--trace") ? (m) => console.log(`  ${m}`) : undefined);
  const ms = Math.round(performance.now() - t0);
  const before = parsed.extraction.entries;
  const after = extraction.entries;

  const truthFile = join(ROOT, "boxes", `${r.page}.json`);
  const truth: Truth | null = existsSync(truthFile) ? JSON.parse(readFileSync(truthFile, "utf8")) : null;
  const verdicts: Array<{ v0: Verdict; v1: Verdict } | null> = before.map(() => null);
  let line = `${r.page.padEnd(12)} ${r.label.padEnd(44)} ${String(before.length).padStart(2)} lines, ${snap.rows.length} rows, pitch ${snap.pitch.toFixed(1)}, ${snap.applied ? `snapped (${snap.matched} on a row)` : `kept: ${snap.reason}`}, ${ms} ms`;
  if (truth) {
    const paired = pair(
      before.map((e) => e.values.sourceText),
      truth.lines.map((l) => l.text),
    );
    const count = { before: { shows: 0, cut: 0, wrong: 0, none: 0 }, after: { shows: 0, cut: 0, wrong: 0, none: 0 } };
    paired.forEach((j, i) => {
      if (j == null) {
        totals.unpaired++;
        return;
      }
      const t = truth.lines[j]!;
      const v0 = verdict(before[i]!.bbox, t);
      const v1 = verdict(after[i]!.bbox, t);
      verdicts[i] = { v0, v1 };
      count.before[v0]++;
      count.after[v1]++;
      totals.before[v0]++;
      totals.after[v1]++;
      totals.lines++;
    });
    const n = paired.filter((j) => j != null).length;
    line += `\n${"".padEnd(13)}shows its line: before ${count.before.shows}/${n} (wrong ${count.before.wrong}, cut ${count.before.cut}), after ${count.after.shows}/${n} (wrong ${count.after.wrong}, cut ${count.after.cut})${n < before.length ? `, ${before.length - n} unpaired` : ""}`;
  }
  console.log(line);

  if (draftDir && !drafted.has(r.page) && snap.applied) {
    drafted.add(r.page);
    const lines = before
      .map((e, i) => ({ e, i }))
      .sort((p, q) => p.e.line - q.e.line)
      .map(({ e, i }) => ({ text: e.values.sourceText, top: Math.round(after[i]!.bbox?.y_min ?? 0), bottom: Math.round(after[i]!.bbox?.y_max ?? 0) }));
    writeFileSync(join(draftDir, `${r.page}.json`), JSON.stringify({ image: r.image.replaceAll("\\", "/"), lines }, null, 2));
  }

  if (drawDir) {
    const name = `${r.page}.${r.label}`.replace(/[^\w.-]/g, "_");
    const { W, H } = await uprightSize(r.image);
    const svgParts: string[] = [];
    snap.rows.forEach((row, k) => {
      svgParts.push(`<rect x="0" y="${(row.top * H) / 1000}" width="${W * 0.02}" height="${((row.bottom - row.top) * H) / 1000}" fill="rgba(0,90,255,0.5)"/>`);
      svgParts.push(`<text x="${W * 0.022}" y="${(row.center * H) / 1000 + 8}" font-size="${Math.round(W / 45)}" fill="#0050ff" font-family="Arial">${k}</text>`);
    });
    before.forEach((e, i) => {
      if (e.bbox) svgParts.push(rect(e.bbox, W, H, "rgba(220,0,0,0.8)", 3, "10 6"));
      const a = after[i]!.bbox;
      if (a) svgParts.push(rect(a, W, H, verdicts[i]?.v1 && verdicts[i]!.v1 !== "shows" ? "rgba(255,140,0,0.95)" : "rgba(0,160,0,0.9)", 3));
      if (a) svgParts.push(`<text x="${(a.x_max * W) / 1000 - W * 0.05}" y="${(a.y_min * H) / 1000 + W / 40}" font-size="${Math.round(W / 50)}" fill="#008000" font-family="Arial">${e.candidateId}</text>`);
    });
    await drawPage(join(drawDir, `${name}.png`), r.image, svgParts.join(""));
    // The ink the rows were found in (white on black), once per page.
    const maskFile = join(drawDir, `${r.page}.ink.png`);
    if (!existsSync(maskFile)) {
      const mask = inkMask(gray);
      removeStrokes(mask, gray.width, gray.height, (snap.pitch / 1000) * gray.height);
      await sharp(Buffer.from(mask.map((v) => (v ? 255 : 0))), { raw: { width: gray.width, height: gray.height, channels: 1 } }).png().toFile(maskFile);
    }
    const html = stripHtml(
      r.image,
      before.map((e, i) => ({ id: e.candidateId, text: e.values.sourceText, before: e.bbox, after: after[i]!.bbox, v0: verdicts[i]?.v0 ?? "?", v1: verdicts[i]?.v1 ?? "?" })),
      W,
      H,
    );
    const htmlFile = join(drawDir, `${name}.strips.html`);
    writeFileSync(htmlFile, html);
    htmlPages.push(htmlFile);
  }
}

if (totals.lines > 0) {
  const pct = (n: number) => `${((100 * n) / totals.lines).toFixed(1)}%`;
  console.log(`\nAll readings with truth: ${totals.lines} lines paired (${totals.unpaired} unpaired)`);
  console.log(`  before: shows ${totals.before.shows} (${pct(totals.before.shows)}), wrong line ${totals.before.wrong}, cut ${totals.before.cut}, no box ${totals.before.none}`);
  console.log(`  after:  shows ${totals.after.shows} (${pct(totals.after.shows)}), wrong line ${totals.after.wrong}, cut ${totals.after.cut}, no box ${totals.after.none}`);
}
if (drawDir && htmlPages.length > 0) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  for (const f of htmlPages) {
    await page.goto(`file:///${resolve(f).replaceAll("\\", "/")}`);
    await page.waitForLoadState("load");
    await page.screenshot({ path: f.replace(/\.html$/, ".png"), fullPage: true });
  }
  await browser.close();
  console.log(`Drew ${htmlPages.length} readings into ${drawDir} (${basename(htmlPages[0]!)} …)`);
}
