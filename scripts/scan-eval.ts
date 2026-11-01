/**
 * Run the page finder (C2) on photos: `bun scripts/scan-eval.ts <out-dir> <photo>...`.
 *
 * For each photo it prints what the scanner would say (status, share of the frame, khata lock,
 * time) at the live preview's size and at the still's detection size, and writes to <out-dir>:
 * `<name>.outline.jpg` (the found quad drawn on the photo) and `<name>.flat.jpg` (the page
 * flattened from the full-resolution photo, as the phone would upload it). No network.
 */

import { basename, extname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { detectPage, type Pixels } from "../src/components/scan/detect";
import { capPixels, flatSize, scaleQuad, type Quad } from "../src/components/scan/geometry";
import { KHATA_ASPECT, findKhataCorners } from "../src/components/scan/markers";
import { DETECT_SIDE, LIVE_SIDE } from "../src/components/scan/sizes";
import { warpPage } from "../src/components/scan/warp";

const [outDir, ...photos] = process.argv.slice(2);
if (!outDir || photos.length === 0) {
  console.error("usage: bun scripts/scan-eval.ts <out-dir> <photo>...");
  process.exit(1);
}
await mkdir(outDir, { recursive: true });

async function pixelsAt(path: string, longSide: number | null): Promise<Pixels> {
  let img = sharp(path).rotate();
  if (longSide) img = img.resize(longSide, longSide, { fit: "inside" });
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
}

function find(px: Pixels) {
  const t0 = performance.now();
  const d = detectPage(px);
  const khata = d.quad ? findKhataCorners(px, d.quad) : null;
  return { ...d, khata, ms: performance.now() - t0 };
}

for (const path of photos) {
  const name = basename(path, extname(path));
  const full = await pixelsAt(path, null);
  console.log(`\n${name}: ${full.width}×${full.height}`);
  let still: ReturnType<typeof find> | null = null;
  for (const side of [LIVE_SIDE, DETECT_SIDE]) {
    const px = await pixelsAt(path, side);
    const r = find(px);
    const q = r.khata ?? r.quad;
    console.log(
      `  at ${px.width}×${px.height}: ${r.khata ? "khata" : r.status}, page = ${(r.fraction * 100).toFixed(1)} % of the frame, ${r.ms.toFixed(0)} ms` +
        (q ? `, corners ${JSON.stringify(scaleQuad(q, full.width / px.width).map((p) => p.map(Math.round)))}` : ""),
    );
    if (side === DETECT_SIDE) still = { ...r, quad: q ? scaleQuad(q, full.width / px.width) : null };
  }
  if (!still?.quad) continue;
  const quad: Quad = still.quad;
  // Sharp composites after resizing, so the outline is drawn at the preview's size.
  const k = Math.min(1, 1200 / Math.max(full.width, full.height));
  const [pw, ph] = [Math.round(full.width * k), Math.round(full.height * k)];
  const shown = scaleQuad(quad, k);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><polygon points="${shown.map((p) => p.join(",")).join(" ")}" fill="rgba(230,170,40,0.12)" stroke="rgb(230,170,40)" stroke-width="4"/></svg>`;
  const preview = await sharp(path).rotate().resize(pw, ph).toBuffer();
  await sharp(preview).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80 }).toFile(join(outDir, `${name}.outline.jpg`));
  const size = capPixels(flatSize(quad, still.khata ? KHATA_ASPECT : undefined), 12_000_000);
  const t0 = performance.now();
  const flat = warpPage(full, quad, size.width, size.height);
  const ms = performance.now() - t0;
  await sharp(Buffer.from(flat.buffer), { raw: { width: size.width, height: size.height, channels: 4 } })
    .removeAlpha()
    .jpeg({ quality: 92 })
    .toFile(join(outDir, `${name}.flat.jpg`));
  console.log(`  flattened to ${size.width}×${size.height} in ${ms.toFixed(0)} ms`);
}
