/**
 * The page finder (docs/PLAN_V3.md, C2). Pure TypeScript on RGBA pixels, fast enough for about
 * ten frames a second on a 640 px frame in a worker. No OpenCV: it is ~8 MB, too heavy for a
 * cheap phone on mobile data.
 *
 * 1. Paper is bright and nearly colourless; a wooden table, a cloth or a dark counter isn't.
 *    Each pixel gets a paper score (brightness minus half its colour), averaged onto a small grid.
 * 2. Otsu's threshold splits the grid into paper and not paper, whatever the light.
 * 3. The largest paper region that isn't the background (it doesn't touch three sides of the
 *    frame) is the page. Its outline's convex hull gives the four corners: the largest
 *    quadrilateral inside it.
 * 4. Each side is then snapped to the strongest bright-to-dark edge at full resolution and the
 *    corners are re-made where the sides meet, so a corner under a thumb still lands right.
 *
 * That fails when something beside the page is as bright as paper: a silver laptop, white
 * sheets, yellow files (F2 fix 7: 6 of his 7 page photos). So the page is also looked for as four
 * straight edges (`edges.ts`). When the two finders disagree, the quad more of whose outline is
 * an edge with paper inside wins.
 */

import { type EdgeQuad, findEdgeQuads, scoreQuad } from "./edges";
import {
  type Point,
  type Quad,
  convexHull,
  cornerAngles,
  dist,
  isConvexQuad,
  largestInscribedQuad,
  polygonArea,
  refineQuad,
  scaleQuad,
} from "./geometry";

export type Pixels = { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number };

/**
 * - `none`: no page.
 * - `cut`: a page, but it runs off the frame.
 * - `far`: a whole page, but small in the frame (the 2 Nov failure: the writing gets too few pixels).
 * - `found`: a whole page, big enough.
 * - `khata`: a Scriba khata page locked on its four printed corner squares (set by `markers.ts`).
 */
export type PageStatus = "none" | "cut" | "far" | "found" | "khata";
export type Detection = { status: PageStatus; quad: Quad | null; fraction: number };

/** Below this share of the frame the page is "too far" and there is no auto shot. Measured in C2. */
export const FAR_FRACTION = 0.35;
/** Smaller than this isn't a page at all. */
const MIN_FRACTION = 0.04;
/** The segmentation grid's long side. */
const GRID_SIDE = 240;
const MAX_HULL = 32;

/** Paper score per pixel: brightness minus half the colour (0–255). */
export function paperScore(px: Pixels): Float32Array {
  const n = px.width * px.height;
  const out = new Float32Array(n);
  const d = px.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = d[j]!;
    const g = d[j + 1]!;
    const b = d[j + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    out[i] = Math.max(0, y - 0.5 * chroma);
  }
  return out;
}

/** Average `score` onto a grid `f` times smaller per side. */
function shrink(score: Float32Array, width: number, height: number, f: number) {
  const gw = Math.max(1, Math.floor(width / f));
  const gh = Math.max(1, Math.floor(height / f));
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let s = 0;
      for (let y = gy * f; y < gy * f + f; y++) {
        const row = y * width;
        for (let x = gx * f; x < gx * f + f; x++) s += score[row + x]!;
      }
      grid[gy * gw + gx] = s / (f * f);
    }
  }
  return { grid, gw, gh };
}

/** Otsu's threshold over values in 0–255. */
export function otsu(values: Float32Array): number {
  const hist = new Float64Array(256);
  for (const v of values) hist[Math.min(255, Math.max(0, Math.round(v)))]!++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold + 0.5;
}

type Region = { label: number; area: number; sides: number };

/** 4-connected regions of `mask`, with their area and how many frame sides they touch. */
function regions(mask: Uint8Array, gw: number, gh: number) {
  const labels = new Int32Array(gw * gh);
  const found: Region[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    next++;
    let area = 0;
    let top = false;
    let bottom = false;
    let left = false;
    let right = false;
    labels[start] = next;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % gw;
      const y = (i - x) / gw;
      if (y === 0) top = true;
      if (y === gh - 1) bottom = true;
      if (x === 0) left = true;
      if (x === gw - 1) right = true;
      if (x > 0 && mask[i - 1] && !labels[i - 1]) {
        labels[i - 1] = next;
        stack.push(i - 1);
      }
      if (x < gw - 1 && mask[i + 1] && !labels[i + 1]) {
        labels[i + 1] = next;
        stack.push(i + 1);
      }
      if (y > 0 && mask[i - gw] && !labels[i - gw]) {
        labels[i - gw] = next;
        stack.push(i - gw);
      }
      if (y < gh - 1 && mask[i + gw] && !labels[i + gw]) {
        labels[i + gw] = next;
        stack.push(i + gw);
      }
    }
    found.push({ label: next, area, sides: +top + +bottom + +left + +right });
  }
  return { labels, found };
}

/** Drop the hull vertex that adds the least area until at most `max` are left (Visvalingam). */
function simplifyHull(hull: Point[], max: number): Point[] {
  const pts = [...hull];
  const tri = (a: Point, b: Point, c: Point) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  while (pts.length > max) {
    let worst = 0;
    let least = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = tri(pts[(i + pts.length - 1) % pts.length]!, pts[i]!, pts[(i + 1) % pts.length]!);
      if (a < least) {
        least = a;
        worst = i;
      }
    }
    pts.splice(worst, 1);
  }
  return pts;
}

/** Bilinear sample of a score map at image coordinates (pixel i's centre is at i + 0.5); edges clamp. */
function sample(score: Float32Array, width: number, height: number, x: number, y: number): number {
  const cx = Math.min(width - 1.001, Math.max(0, x - 0.5));
  const cy = Math.min(height - 1.001, Math.max(0, y - 0.5));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const i = y0 * width + x0;
  const top = score[i]! * (1 - fx) + score[i + 1]! * fx;
  const bottom = score[i + width]! * (1 - fx) + score[i + width + 1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Separable box blur of radius `r` (edges clamp). */
export function boxBlur(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + Math.min(width - 1, Math.max(0, k))]!;
    for (let x = 0; x < width; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(width - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < width; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(height - 1, Math.max(0, k)) * width + x]!;
    for (let y = 0; y < height; y++) {
      out[y * width + x] = s / n;
      s += tmp[Math.min(height - 1, y + r + 1) * width + x]! - tmp[Math.max(0, y - r) * width + x]!;
    }
  }
  return out;
}

/** Half-pixel steps that must be mostly paper for the walk to have reached the page (8 px). */
const EDGE_RUN = 16;

/**
 * Points on the page's real edges near a rough quad, on a lightly blurred score (so newsprint
 * and wood grain average out). Along each side, a walk starts outside the page and goes inward
 * until the next 8 px are mostly paper (above the threshold that split the frame). The edge is
 * then where the score crosses halfway between the levels just outside and just inside, which
 * a symmetric blur leaves in place. Pen strokes inside the page are never reached; stray points
 * (newsprint, a thumb) are left to the robust line fit. `thresholds` is one level, or one per
 * side when what lies beside the page differs from side to side.
 */
export function snapEdges(
  score: Float32Array,
  width: number,
  height: number,
  q: Quad,
  band: number,
  thresholds: number | readonly number[],
): Point[][] {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const sides: Point[][] = [];
  const SAMPLES = 48;
  for (let s = 0; s < 4; s++) {
    const out: Point[] = [];
    sides.push(out);
    const threshold = typeof thresholds === "number" ? thresholds : thresholds[s]!;
    const p = q[s]!;
    const r = q[(s + 1) % 4]!;
    const len = dist(p, r) || 1;
    let nx = -(r[1] - p[1]) / len;
    let ny = (r[0] - p[0]) / len;
    const mx = (p[0] + r[0]) / 2;
    const my = (p[1] + r[1]) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    // Not too near the corners, where the walk could meet the next side.
    for (let k = 4; k <= SAMPLES - 4; k++) {
      const t = k / SAMPLES;
      const bx = p[0] + (r[0] - p[0]) * t;
      const by = p[1] + (r[1] - p[1]) * t;
      const at = (d: number) => sample(score, width, height, bx + nx * d, by + ny * d);
      if (at(band) >= threshold) continue; // the walk would start on paper: no edge in reach
      let found: number | null = null;
      for (let d = band; d > -band; d -= 0.5) {
        if (at(d) < threshold) continue;
        let paper = 0;
        for (let w = 0; w < EDGE_RUN; w++) if (at(d - w * 0.5) >= threshold) paper++;
        if (paper >= EDGE_RUN * 0.8) {
          found = d;
          break;
        }
      }
      if (found === null) continue;
      let inner = 0;
      let outer = 0;
      for (let w = 4; w <= 7; w++) {
        inner += at(found - w) / 4;
        outer += at(found + w) / 4;
      }
      const mid = (inner + outer) / 2;
      // The outermost crossing of `mid` within 3 px of the walk's stop.
      for (let d = found + 3; d > found - 3; d -= 0.25) {
        const a = at(d) - mid;
        const b = at(d - 0.25) - mid;
        if (a < 0 && b >= 0) {
          const e = d - (0.25 * -a) / (b - a || 1);
          out.push([bx + nx * e, by + ny * e]);
          break;
        }
      }
    }
  }
  return sides;
}

/** The edge finder's grid: about this many pixels on the long side. */
const EDGE_GRID_SIDE = 320;
/** An edge-found page has edges with the paper inside along at least this share of its outline… */
const EDGE_SUPPORT = 0.6;
/** …and the paper inside along at least this share (no edge where it lies on white sheets). */
const EDGE_PAPER = 0.85;
/** The finders agree when no two corners are further apart than this share of the frame's diagonal. */
const AGREE = 0.02;
/** A region quad must score within this of the edge quad to be kept over it. */
const PREFER_REGION = 0.05;

const cornerGap = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => dist(p, b[i]!)));

/** Find the page in one frame or photo. The quad is in the input's pixels. */
export function detectPage(px: Pixels): Detection {
  const { width, height } = px;
  const none: Detection = { status: "none", quad: null, fraction: 0 };
  const score = paperScore(px);
  const region = regionPage(score, width, height);

  const fe = Math.max(1, Math.round(Math.max(width, height) / EDGE_GRID_SIDE));
  const { grid, gw, gh } = shrink(score, width, height, fe);
  const best = findEdgeQuads(grid, gw, gh, { minFraction: MIN_FRACTION, max: 1 })[0];
  const edge = best && best.support >= EDGE_SUPPORT && best.paper >= EDGE_PAPER ? best : null;

  let quad: Quad;
  let touches = 0;
  let margin: number;
  if (region && (!edge || keepRegion(region, edge, grid, gw, gh, fe, width, height))) {
    quad = region.quad;
    touches = region.touches;
    margin = 0.5 * region.f;
  } else if (edge) {
    quad = refineEdgeQuad(score, width, height, edge, fe);
    margin = 0.5 * fe;
  } else return none;

  const fraction = polygonArea(quad) / (width * height);
  const offFrame = touches > 0 || quad.some(([x, y]) => x < margin || y < margin || x > width - margin || y > height - margin);
  const status: PageStatus = offFrame ? "cut" : fraction < FAR_FRACTION ? "far" : "found";
  return { status, quad, fraction };
}

/**
 * Keep the bright-region finder's page over the edge finder's: when they're the same page (the
 * region's is already snapped), or when the region's outline is as much an edge with paper
 * inside. A region that took in a laptop or a file beside the page has sides running over them,
 * not along edges. Its sides on the frame's border (a page running off it) aren't counted.
 */
function keepRegion(
  region: { quad: Quad },
  edge: EdgeQuad,
  grid: Float32Array,
  gw: number,
  gh: number,
  fe: number,
  width: number,
  height: number,
): boolean {
  if (cornerGap(region.quad, scaleQuad(edge.quad, fe)) <= AGREE * Math.hypot(width, height)) return true;
  const q = region.quad;
  const near = 0.01 * Math.max(width, height);
  const onBorder = (a: Point, b: Point) =>
    (a[0] < near && b[0] < near) || (a[1] < near && b[1] < near) || (a[0] > width - near && b[0] > width - near) || (a[1] > height - near && b[1] > height - near);
  const skip = [0, 1, 2, 3].map((i) => onBorder(q[i]!, q[(i + 1) % 4]!));
  const s = scoreQuad(grid, gw, gh, scaleQuad(q, 1 / fe), skip);
  return Boolean(s) && s!.support * s!.paper >= edge.support * edge.paper - PREFER_REGION;
}

/**
 * The edge finder's quad is on its small grid, its sides already fitted to their edge pixels:
 * snap them to the edges at full size. The band is tight, a grid pixel and a bit, so a side stays
 * on its own edge when another runs beside it (a notebook's binding tape beside the page).
 */
function refineEdgeQuad(score: Float32Array, width: number, height: number, edge: EdgeQuad, fe: number): Quad {
  const rough = scaleQuad(edge.quad, fe);
  const smooth = boxBlur(score, width, height, Math.max(1, Math.round(fe / 2)));
  const band = fe + 2;
  let quad = rough;
  for (let pass = 0; pass < 2; pass++) quad = refineQuad(quad, snapEdges(smooth, width, height, quad, band, edge.thresholds));
  return isConvexQuad(quad) ? quad : rough;
}

/**
 * The bright-region finder (C2): the largest region of paper that isn't the background and is
 * page-shaped, its sides snapped to the real edges. `touches` is how many frame sides the region
 * reaches; `f` is its grid's scale.
 */
function regionPage(score: Float32Array, width: number, height: number): { quad: Quad; touches: number; f: number } | null {
  const f = Math.max(1, Math.round(Math.max(width, height) / GRID_SIDE));
  const shrunk = shrink(score, width, height, f);
  const { gw, gh } = shrunk;
  const grid = boxBlur(shrunk.grid, gw, gh, 1);
  const t = otsu(grid);
  const raw = new Uint8Array(gw * gh);
  for (let i = 0; i < raw.length; i++) raw[i] = grid[i]! > t ? 1 : 0;
  // Erode once (outside the frame counts as paper) to cut thin bright bridges to the background.
  const mask = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      mask[i] =
        raw[i] && (x === 0 || raw[i - 1]) && (x === gw - 1 || raw[i + 1]) && (y === 0 || raw[i - gw]) && (y === gh - 1 || raw[i + gw]) ? 1 : 0;
    }
  }
  const { labels, found } = regions(mask, gw, gh);
  const minArea = MIN_FRACTION * gw * gh;
  const page = found
    .filter((r) => r.area >= minArea && r.sides <= 2)
    .sort((a, b) => b.area - a.area)[0];
  if (!page) return null;

  // The region's outline: the first and last cell of each row and column.
  const edge: Point[] = [];
  const colMin = new Int32Array(gw).fill(-1);
  const colMax = new Int32Array(gw).fill(-1);
  for (let y = 0; y < gh; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < gw; x++) {
      if (labels[y * gw + x] !== page.label) continue;
      if (first < 0) first = x;
      last = x;
      if (colMin[x]! < 0) colMin[x] = y;
      colMax[x] = y;
    }
    if (first >= 0) edge.push([first, y], [last + 1, y], [first, y + 1], [last + 1, y + 1]);
  }
  for (let x = 0; x < gw; x++) if (colMin[x]! >= 0) edge.push([x, colMin[x]!], [x + 1, colMin[x]!], [x, colMax[x]! + 1], [x + 1, colMax[x]! + 1]);
  const hull = convexHull(edge);
  const rough = largestInscribedQuad(simplifyHull(hull, MAX_HULL));
  if (!rough) return null;
  const hullArea = polygonArea(hull);
  const quadArea = polygonArea(rough);
  // Page-shaped: solid, four-sided (a plate or a hand isn't), corners not too sharp.
  if (page.area / hullArea < 0.7 || hullArea / quadArea > 1.15) return null;
  const angles = cornerAngles(rough);
  if (angles.some((a) => a < 35 || a > 145)) return null;

  const band = 2 * f + 2;
  const smooth = boxBlur(score, width, height, Math.max(1, Math.round(f / 2)));
  let quad = scaleQuad(rough, f);
  // Each pass starts from a better quad. The first reaches further, so a side cut short by a
  // thumb (its rough line tilted off the real edge) still finds the edge it should follow.
  for (let pass = 0; pass < 3; pass++) quad = refineQuad(quad, snapEdges(smooth, width, height, quad, pass === 0 ? band * 2.5 : band, t));
  if (!isConvexQuad(quad)) return null;
  return { quad, touches: page.sides, f };
}
