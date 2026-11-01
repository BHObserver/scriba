/**
 * Flatten a photographed page (docs/PLAN_V3.md, C2): the homography from the output rectangle
 * to the page's four corners, sampled bilinearly. The output is sized by the page's own edge
 * lengths, so nothing is upscaled on the phone (the server already does that for the model).
 */

import type { Pixels } from "./detect";
import { type Quad, homography } from "./geometry";

/** RGBA pixels of the page inside `quad`, squared up to `width` × `height`. */
export function warpPage(src: Pixels, quad: Quad, width: number, height: number): Uint8ClampedArray {
  const h = homography(
    [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ],
    quad,
  );
  if (!h) throw new Error("The corners don't make a page.");
  const out = new Uint8ClampedArray(width * height * 4);
  const s = src.data;
  const sw = src.width;
  const maxX = src.width - 1;
  const maxY = src.height - 1;
  for (let y = 0; y < height; y++) {
    // Pixel centres: the numerators and the denominator are linear in x along a row.
    const yc = y + 0.5;
    let nu = h[0] * 0.5 + h[1] * yc + h[2];
    let nv = h[3] * 0.5 + h[4] * yc + h[5];
    let dw = h[6] * 0.5 + h[7] * yc + h[8];
    let o = y * width * 4;
    for (let x = 0; x < width; x++, o += 4, nu += h[0], nv += h[3], dw += h[6]) {
      let u = nu / dw - 0.5;
      let v = nv / dw - 0.5;
      if (u < 0) u = 0;
      else if (u > maxX) u = maxX;
      if (v < 0) v = 0;
      else if (v > maxY) v = maxY;
      const x0 = u | 0;
      const y0 = v | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = u - x0;
      const fy = v - y0;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const d = (y1 * sw + x1) * 4;
      const wa = (1 - fx) * (1 - fy);
      const wb = fx * (1 - fy);
      const wc = (1 - fx) * fy;
      const wd = fx * fy;
      out[o] = s[a]! * wa + s[b]! * wb + s[c]! * wc + s[d]! * wd;
      out[o + 1] = s[a + 1]! * wa + s[b + 1]! * wb + s[c + 1]! * wc + s[d + 1]! * wd;
      out[o + 2] = s[a + 2]! * wa + s[b + 2]! * wb + s[c + 2]! * wc + s[d + 2]! * wd;
      out[o + 3] = 255;
    }
  }
  return out;
}
