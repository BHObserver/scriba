/** Synthetic photos for the page-finder tests: a page drawn through a known homography onto a background. */

import type { Pixels } from "./detect";
import { type Point, type Quad, applyHomography, homography } from "./geometry";

export type Rgb = readonly [number, number, number];

/** A small deterministic random source, so failures repeat. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export const WOOD = (x: number, y: number): Rgb => {
  const grain = 18 * Math.sin(x * 0.09 + Math.sin(y * 0.02) * 3);
  return [150 + grain, 96 + grain * 0.7, 58 + grain * 0.4];
};
export const DARK = (): Rgb => [38, 34, 32];
/** Newsprint: light grey paper under dense small text. */
export function newspaper(seed = 7) {
  const r = rng(seed);
  const ink = new Map<number, boolean>();
  return (x: number, y: number): Rgb => {
    const key = Math.floor(x / 3) * 100_000 + Math.floor(y / 4);
    if (!ink.has(key)) ink.set(key, Math.floor(y / 4) % 3 !== 2 && r() < 0.55);
    return ink.get(key) ? [70, 70, 72] : [196, 194, 188];
  };
}

/** Paper with a few dark pen strokes (rows of "writing"). */
export function paper(opts: { strokes?: boolean; tone?: Rgb } = {}) {
  const tone = opts.tone ?? [236, 232, 220];
  return (u: number, v: number): Rgb => {
    if (opts.strokes && u > 0.12 && u < 0.85 && Math.abs(((v * 18) % 1) - 0.5) < 0.05 && Math.sin(u * 90) > 0.1) return [40, 40, 70];
    return tone;
  };
}

/** The Scriba khata sheet in mm (148 × 210): hollow 6 mm squares 5 mm in, plus ruled rows. */
export function khataSheet(missing: number[] = []) {
  const squares: [number, number][] = [
    [5, 5],
    [137, 5],
    [137, 199],
    [5, 199],
  ];
  return (u: number, v: number): Rgb => {
    const x = u * 148;
    const y = v * 210;
    for (const [i, [sx, sy]] of squares.entries()) {
      if (missing.includes(i)) continue;
      const inSq = x >= sx && x <= sx + 6 && y >= sy && y <= sy + 6;
      const inHole = x >= sx + 1.6 && x <= sx + 4.4 && y >= sy + 1.6 && y <= sy + 4.4;
      if (inSq) return inHole ? [250, 250, 248] : [25, 25, 30];
    }
    if (y > 30 && y < 190 && x > 12 && x < 136 && Math.abs((y % 7.4) - 3.7) > 3.5) return [200, 150, 150];
    return [250, 250, 248];
  };
}

/**
 * Draw `page` (a painter over the unit square) onto `background` at `quad`, with 2×2
 * supersampling at the edges. `over` paints on top of everything (a thumb, glare).
 */
export function render(opts: {
  width: number;
  height: number;
  quad: Quad;
  background: (x: number, y: number) => Rgb;
  page: (u: number, v: number) => Rgb;
  over?: (x: number, y: number) => Rgb | null;
  noise?: number;
  seed?: number;
}): Pixels {
  const { width, height } = opts;
  const h = homography(opts.quad, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ])!;
  const data = new Uint8ClampedArray(width * height * 4);
  const r = rng(opts.seed ?? 1);
  const at = (x: number, y: number): Rgb => {
    const over = opts.over?.(x, y);
    if (over) return over;
    const [u, v] = applyHomography(h, [x, y]);
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? opts.page(u, v) : opts.background(x, y);
  };
  // Supersample only near the page's edge, where it matters for the corners (and is quick).
  const near = (x: number, y: number) => {
    const [u, v] = applyHomography(h, [x, y]);
    return Math.min(Math.abs(u), Math.abs(u - 1), Math.abs(v), Math.abs(v - 1)) < 0.01;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rgb: number[];
      if (near(x + 0.5, y + 0.5)) {
        rgb = [0, 0, 0];
        for (const [dx, dy] of [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75],
        ] as const) {
          const c = at(x + dx, y + dy);
          rgb = [rgb[0]! + c[0] / 4, rgb[1]! + c[1] / 4, rgb[2]! + c[2] / 4];
        }
      } else rgb = [...at(x + 0.5, y + 0.5)];
      const n = opts.noise ? (r() - 0.5) * 2 * opts.noise : 0;
      const i = (y * width + x) * 4;
      data[i] = rgb[0]! + n;
      data[i + 1] = rgb[1]! + n;
      data[i + 2] = rgb[2]! + n;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Largest distance between matching corners. */
export const cornerError = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1])));

/** A tilted page, as a phone held at a slight angle sees it, in a 360 × 640 portrait frame. */
export const TILTED: Quad = [
  [62, 118],
  [300, 96],
  [322, 560],
  [40, 548],
];

export const scalePoint = (p: Point, k: number): Point => [p[0] * k, p[1] * k];
