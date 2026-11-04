/**
 * F2 fix 7: how well the page finder (C2) finds his pages, on real photos. $0, no network.
 *
 *   bun scripts/measure-corners.ts <truth.json> [--draw <dir>]
 *
 * <truth.json> (kept in the git-ignored private-test-data/corners/) lists photos and what is
 * right for each, checked by eye against the photo:
 *
 *   { "photos": [
 *     { "path": "private-test-data/f2/P1.camera.jpg", "corners": [[x, y], …] },  // fractions, TL TR BR BL
 *     { "path": "…/V01.jpg", "expect": "cut" },     // the page runs off the frame
 *     { "path": "…/1.jpeg", "expect": "none" }      // the page fills the frame: no corners to find
 *   ] }
 *
 * For each photo, at the live preview's size and the still's: the status, the worst corner's
 * distance from the truth as a share of the page's diagonal, and the time. "Right" is within
 * 1.5 % of the diagonal (about 40 px on a 4000 px photo of a page that fills the frame).
 * --draw writes <name>.corners.jpg: the photo with the found outline (amber) and the truth
 * (blue dashes), and each corner of the still's finding zoomed in, to check them by eye.
 */

import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { type Detection, type Pixels, detectPage } from "../src/components/scan/detect";
import { type Point, dist, scaleQuad } from "../src/components/scan/geometry";
import { DETECT_SIDE, LIVE_SIDE } from "../src/components/scan/sizes";

type Truth = { path: string; corners?: [number, number][]; expect?: "cut" | "none"; note?: string };

const args = process.argv.slice(2);
const truthPath = args[0];
const drawAt = args.indexOf("--draw");
const drawDir = drawAt >= 0 ? args[drawAt + 1] : undefined;
if (!truthPath) {
  console.error("usage: bun scripts/measure-corners.ts <truth.json> [--draw <dir>]");
  process.exit(1);
}
const photos = (JSON.parse(readFileSync(truthPath, "utf8")) as { photos: Truth[] }).photos;
if (drawDir) await mkdir(drawDir, { recursive: true });

/** Within this share of the page's diagonal, a corner is right. */
const RIGHT = 0.015;

async function pixelsAt(path: string, longSide: number): Promise<Pixels> {
  const { data, info } = await sharp(path).rotate().resize(longSide, longSide, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
}

function judge(t: Truth, d: Detection, w: number, h: number): { ok: boolean; text: string } {
  if (t.expect === "none") return { ok: d.status === "none" || d.status === "cut", text: d.status };
  if (t.expect === "cut") return { ok: d.status === "cut", text: d.status };
  if (!d.quad) return { ok: false, text: d.status };
  const truth = t.corners!.map(([x, y]) => [x * w, y * h] as Point);
  const diag = Math.max(dist(truth[0]!, truth[2]!), dist(truth[1]!, truth[3]!));
  const worst = Math.max(...d.quad.map((p, i) => dist(p, truth[i]!))) / diag;
  return { ok: worst <= RIGHT, text: `${d.status} ${(worst * 100).toFixed(1)}%` };
}

const tally = { [LIVE_SIDE]: 0, [DETECT_SIDE]: 0 } as Record<number, number>;
for (const t of photos) {
  const name = `${basename(join(t.path, ".."))}/${basename(t.path, extname(t.path))}`;
  const cells: string[] = [];
  let still: { d: Detection; w: number; h: number } | null = null;
  for (const side of [LIVE_SIDE, DETECT_SIDE]) {
    const px = await pixelsAt(t.path, side);
    detectPage(px); // warm up, so the time is the steady one
    const t0 = performance.now();
    const d = detectPage(px);
    const ms = performance.now() - t0;
    const j = judge(t, d, px.width, px.height);
    if (j.ok) tally[side]!++;
    cells.push(`${side}: ${j.ok ? "ok " : "BAD"} ${j.text.padEnd(10)} ${ms.toFixed(0).padStart(3)} ms`);
    if (side === DETECT_SIDE) still = { d, w: px.width, h: px.height };
  }
  console.log(`${name.padEnd(16)} ${cells.join("   ")}${t.note ? `   (${t.note.slice(0, 40)})` : ""}`);
  if (drawDir && still) await draw(t, still.d, still.w, still.h, join(drawDir, `${name.replace("/", "-")}.corners.jpg`));
}
console.log(`\nright: live ${tally[LIVE_SIDE]}/${photos.length}, still ${tally[DETECT_SIDE]}/${photos.length}`);

/** The photo with both outlines, then each found corner zoomed in. */
async function draw(t: Truth, d: Detection, w: number, h: number, out: string) {
  const meta = await sharp(t.path).rotate().toBuffer({ resolveWithObject: true });
  const [W, H] = [meta.info.width, meta.info.height];
  const found = d.quad ? scaleQuad(d.quad, W / w, H / h) : null;
  const truth = t.corners?.map(([x, y]) => [x * W, y * H] as Point) ?? null;
  const poly = (q: readonly Point[], k: number, dx: number, dy: number, style: string) =>
    `<polygon points="${q.map(([x, y]) => `${(x - dx) * k},${(y - dy) * k}`).join(" ")}" fill="none" ${style}/>`;
  const layer = (k: number, dx: number, dy: number, cw: number, ch: number, sw: number) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">${truth ? poly(truth, k, dx, dy, `stroke="#08f" stroke-width="${sw}" stroke-dasharray="${sw * 3} ${sw * 2}"`) : ""}${found ? poly(found, k, dx, dy, `stroke="#e6aa28" stroke-width="${sw}"`) : ""}</svg>`,
    );
  const OV = 640;
  const k = OV / Math.max(W, H);
  const [ow, oh] = [Math.round(W * k), Math.round(H * k)];
  const overview = await sharp(meta.data).resize(ow, oh).composite([{ input: layer(k, 0, 0, ow, oh, 2) }]).png().toBuffer();
  const tiles = [{ input: overview, left: 0, top: 0 }];
  if (found) {
    const Z = 300; // a corner's crop, in photo pixels
    const T = OV / 2; // shown at
    for (const [i, c] of found.entries()) {
      const x0 = Math.round(Math.min(W - Z, Math.max(0, c[0] - Z / 2)));
      const y0 = Math.round(Math.min(H - Z, Math.max(0, c[1] - Z / 2)));
      const crop = await sharp(meta.data).extract({ left: x0, top: y0, width: Z, height: Z }).resize(T, T).composite([{ input: layer(T / Z, x0, y0, T, T, 2) }]).png().toBuffer();
      tiles.push({ input: crop, left: ow + 8 + (i % 2) * (T + 4), top: Math.floor(i / 2) * (T + 4) });
    }
  }
  await sharp({ create: { width: ow + 8 + 2 * (OV / 2 + 4), height: Math.max(oh, OV + 8), channels: 3, background: "#222" } })
    .composite(tiles)
    .jpeg({ quality: 85 })
    .toFile(out);
}

