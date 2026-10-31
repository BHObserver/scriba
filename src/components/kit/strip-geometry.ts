import type { CSSProperties } from "react";

/** A line's box on the model's 0–1000 grid (relative to the photo's width and height). */
export type GridBox = { x_min: number; y_min: number; x_max: number; y_max: number };

const clamp = (n: number) => Math.min(1000, Math.max(0, n));
const MIN_SPAN = 4; // a box thinner than 0.4% of the page is treated as this thin, never zero

/**
 * CSS custom properties for `.strip`: the box as 0–1 fractions plus the photo's aspect ratio.
 * kit.css turns these into the photo's size and offset, so the crop scales with the card width
 * without any measuring. Swapped or out-of-range coordinates are put in order and clamped.
 */
export function stripVars(box: GridBox, photoWidth: number, photoHeight: number): CSSProperties {
  let [x0, x1] = [clamp(box.x_min), clamp(box.x_max)].sort((a, b) => a - b) as [number, number];
  let [y0, y1] = [clamp(box.y_min), clamp(box.y_max)].sort((a, b) => a - b) as [number, number];
  if (x1 - x0 < MIN_SPAN) [x0, x1] = widen(x0, x1);
  if (y1 - y0 < MIN_SPAN) [y0, y1] = widen(y0, y1);
  const aspect = photoWidth > 0 && photoHeight > 0 ? photoWidth / photoHeight : 0.75;
  return {
    "--bx": round(x0 / 1000),
    "--by": round(y0 / 1000),
    "--bw": round((x1 - x0) / 1000),
    "--bh": round((y1 - y0) / 1000),
    "--ar": round(aspect),
  } as CSSProperties;
}

function widen(a: number, b: number): [number, number] {
  const mid = (a + b) / 2;
  const lo = Math.max(0, Math.min(mid - MIN_SPAN / 2, 1000 - MIN_SPAN));
  return [lo, lo + MIN_SPAN];
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
