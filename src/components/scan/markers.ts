/**
 * The Scriba khata lock (docs/PLAN_V3.md, C2). The printed page (`scripts/khata/page.html`) is A5,
 * 148 × 210 mm, with a hollow black 6 mm square 5 mm in from each corner. Starting from the
 * paper outline, each square is looked for where the outline says it should be; when all four
 * are found, their centres fix the sheet exactly, and its corners are mapped through them. That
 * also gives the true paper shape for the flattened page.
 */

import type { Pixels } from "./detect";
import { type Point, type Quad, applyHomography, dist, homography, isConvexQuad } from "./geometry";

/** The printed sheet in millimetres (`page.html`: `.sheet`, `.cm`). */
export const KHATA_MM = { width: 148, height: 210, marker: 6, inset: 5 } as const;
export const KHATA_ASPECT = KHATA_MM.width / KHATA_MM.height;

const SHEET: Quad = [
  [0, 0],
  [KHATA_MM.width, 0],
  [KHATA_MM.width, KHATA_MM.height],
  [0, KHATA_MM.height],
];
const C = KHATA_MM.inset + KHATA_MM.marker / 2;
const CENTRES: Quad = [
  [C, C],
  [KHATA_MM.width - C, C],
  [KHATA_MM.width - C, KHATA_MM.height - C],
  [C, KHATA_MM.height - C],
];

type Blob = { cx: number; cy: number; w: number; h: number; area: number; touchesEdge: boolean };

/** Dark 8-connected blobs inside a window of the image. */
function darkBlobs(px: Pixels, x0: number, y0: number, x1: number, y1: number): Blob[] {
  const w = x1 - x0;
  const h = y1 - y0;
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = ((y0 + y) * px.width + x0 + x) * 4;
      lum[y * w + x] = 0.299 * px.data[j]! + 0.587 * px.data[j + 1]! + 0.114 * px.data[j + 2]!;
    }
  }
  // The window is mostly paper: its 80th percentile is the paper's brightness here.
  const sorted = Float32Array.from(lum).sort();
  const paper = sorted[Math.floor(sorted.length * 0.8)]!;
  const dark = Math.min(paper * 0.55, paper - 40);
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < lum.length; start++) {
    if (seen[start] || lum[start]! >= dark) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let sx = 0;
    let sy = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!seen[k] && lum[k]! < dark) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
    }
    blobs.push({
      cx: x0 + sx / area + 0.5,
      cy: y0 + sy / area + 0.5,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      area,
      touchesEdge: minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1,
    });
  }
  return blobs;
}

/**
 * The exact sheet corners of a Scriba khata page, or null when the four squares aren't all
 * there (any other page, or a square covered by a finger).
 */
export function findKhataCorners(px: Pixels, outline: Quad): Quad | null {
  const h = homography(SHEET, outline);
  if (!h) return null;
  const centres: Point[] = [];
  for (const mm of CENTRES) {
    const c = applyHomography(h, mm);
    const half = KHATA_MM.marker / 2;
    const side =
      (dist(applyHomography(h, [mm[0] - half, mm[1]]), applyHomography(h, [mm[0] + half, mm[1]])) +
        dist(applyHomography(h, [mm[0], mm[1] - half]), applyHomography(h, [mm[0], mm[1] + half]))) /
      2;
    if (side < 4) return null; // too small to tell a square from a pen stroke
    const r = Math.ceil(side * 2.5 + 4);
    const x0 = Math.max(0, Math.floor(c[0] - r));
    const y0 = Math.max(0, Math.floor(c[1] - r));
    const x1 = Math.min(px.width, Math.ceil(c[0] + r));
    const y1 = Math.min(px.height, Math.ceil(c[1] + r));
    if (x1 - x0 < side || y1 - y0 < side) return null;
    const hollowMax = side < 8 ? 1 : 0.97; // a small square's hole closes up
    const fits = darkBlobs(px, x0, y0, x1, y1).filter((b) => {
      const big = Math.max(b.w, b.h);
      const small = Math.min(b.w, b.h);
      const fill = b.area / (b.w * b.h);
      return !b.touchesEdge && big <= side * 1.8 && small >= side * 0.5 && big / small <= 1.6 && fill >= 0.4 && fill <= hollowMax;
    });
    if (fits.length === 0) return null;
    const best = fits.reduce((a, b) => (dist([a.cx, a.cy], c) <= dist([b.cx, b.cy], c) ? a : b));
    centres.push([best.cx, best.cy]);
  }
  const m = homography(CENTRES, centres);
  if (!m) return null;
  const corners = SHEET.map((p) => applyHomography(m, p)) as unknown as Quad;
  if (!isConvexQuad(corners)) return null;
  // The squares must agree with the paper's own outline (a stray blob would pull a corner away).
  const diag = Math.max(dist(outline[0], outline[2]), dist(outline[1], outline[3]));
  return corners.every((p, i) => dist(p, outline[i]!) <= 0.12 * diag) ? corners : null;
}
