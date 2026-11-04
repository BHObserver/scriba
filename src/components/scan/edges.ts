/**
 * The page as four straight edges (F2 fix 7). The bright-region finder in `detect.ts` assumes the
 * page is the only bright thing in the frame. On a shop counter it often isn't: his pages lie on
 * a silver laptop, on white sheets, on yellow files. All of those are as bright as paper, so the
 * page joins them in one region. But every side of a page is still a straight edge with the
 * paper on its brighter side, wherever something darker is beside it, and a bright neighbour
 * only hides part of one side.
 *
 * 1. Edge pixels: the score's gradient, thinned to its ridge. The gradient points to the brighter
 *    side, so an edge knows which side the paper is on.
 * 2. A Hough transform over the full circle of directions: a line is (θ, ρ) with its normal
 *    pointing into the brighter side, so a page's top (paper below) and a shelf's bottom edge
 *    (paper above) never mix. Votes are capped per pixel, so a long faint edge outweighs a short
 *    strong one. Each peak is refitted to its own edge pixels (the bins are 2° wide).
 * 3. Each strong line is a top, right, bottom or left side by the way its normal points. Every
 *    choice of one line per side is a quad; it's kept when its corners are in the frame, it's
 *    convex and roughly rectangular in perspective.
 * 4. First look: the share of each side that is an edge (inside against just outside). Each
 *    line's profile is computed once, so a quad costs four lookups.
 * 5. The best 40 are scored properly: a point of the outline counts only with the paper's own
 *    level inside it, so a side that runs on over a lit table doesn't count there (`score`).
 *    Near-equal scores are the same sheet with or without a roll or a tape along one edge: the
 *    bigger one wins.
 *
 * Measured with `scripts/measure-corners.ts` on his 13 real photos: 13 right at both sizes.
 */

import { type Line, type Point, type Quad, intersect, isConvexQuad, polygonArea } from "./geometry";

/** A quad found from edges, in the grid's pixels. */
export type EdgeQuad = {
  quad: Quad;
  /** Share of the outline that is an edge with the paper inside (0–1). */
  support: number;
  /** Share of the outline with the paper inside, edge or not (0–1). */
  paper: number;
  /** The edge share per side (top, right, bottom, left). */
  sides: [number, number, number, number];
  /** The paper's level: the median just inside its clear edges. */
  inside: number;
  /** The median level just outside the clear edges. */
  outside: number;
  /** Per side, the level halfway between its paper and what's beside it: where its edge is. */
  thresholds: [number, number, number, number];
  /** Share of the grid. */
  fraction: number;
};

const THETA_BINS = 180; // 2° each, round the full circle
const THETA_STEP = (2 * Math.PI) / THETA_BINS;
/** An edge pixel's vote is capped at this contrast per pixel, so length counts more than strength. */
const VOTE_CAP = 16;
/** Below this gradient a pixel isn't an edge. */
const EDGE_MIN = 3;
/** Inside minus outside, for a point on a side to count as an edge. */
export const EDGE_CONTRAST = 10;
/** Lines kept per side. */
const PER_SIDE = 10;
/** Corners may be this far outside the grid (rounding at the frame's edge). */
const CORNER_SLACK = 1;

type Profile = {
  line: Line;
  /** A point on the line nearest the origin and the line's direction. */
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  /** The first position along the line inside the grid; prefix sums from there. */
  s0: number;
  ok: Float64Array; // prefix sum of supported samples
  inSum: Float64Array; // prefix sum of the inside level at supported samples
  outSum: Float64Array;
  /** Per sample: the levels just inside and just outside. */
  inside: Float32Array;
  outside: Float32Array;
  votes: number;
  role: number;
};

function bilinear(g: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(w - 1.001, Math.max(0, x - 0.5));
  const cy = Math.min(h - 1.001, Math.max(0, y - 0.5));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const i = y0 * w + x0;
  return (g[i]! * (1 - fx) + g[i + 1]! * fx) * (1 - fy) + (g[i + w]! * (1 - fx) + g[i + w + 1]! * fx) * fy;
}

/** Sobel gradient (in score units per pixel), thinned to its ridge across the edge. */
function edgePixels(g: Float32Array, w: number, h: number) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = g[i - w - 1]!;
      const b = g[i - w]!;
      const c = g[i - w + 1]!;
      const d = g[i - 1]!;
      const e = g[i + 1]!;
      const f = g[i + w - 1]!;
      const k = g[i + w]!;
      const l = g[i + w + 1]!;
      const sx = (c + 2 * e + l - a - 2 * d - f) / 8;
      const sy = (f + 2 * k + l - a - 2 * b - c) / 8;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.hypot(sx, sy);
    }
  }
  const keep = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const m = mag[i]!;
      if (m < EDGE_MIN) continue;
      // Compare with the two neighbours along the gradient (quantised to 45°).
      const ax = Math.abs(gx[i]!);
      const ay = Math.abs(gy[i]!);
      let step: number;
      if (ay <= ax * 0.4142) step = 1;
      else if (ax <= ay * 0.4142) step = w;
      else step = gx[i]! * gy[i]! > 0 ? w + 1 : w - 1;
      if (m >= mag[i - step]! && m >= mag[i + step]!) keep[i] = 1;
    }
  }
  return { gx, gy, mag, keep };
}

/** Where a line enters and leaves the grid, as positions along it. */
function span(ox: number, oy: number, dx: number, dy: number, w: number, h: number): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [o, d, max] of [
    [ox, dx, w],
    [oy, dy, h],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < 0 || o > max) return null;
      continue;
    }
    const a = (0 - o) / d;
    const b = (max - o) / d;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  return hi - lo >= 2 ? [lo, hi] : null;
}

/** The line's support along its whole length: inside (along the normal) against outside. */
function profile(g: Float32Array, w: number, h: number, theta: number, rho: number, votes: number, role: number): Profile | null {
  const nx = Math.cos(theta);
  const ny = Math.sin(theta);
  const ox = rho * nx;
  const oy = rho * ny;
  const dx = -ny;
  const dy = nx;
  const s = span(ox, oy, dx, dy, w, h);
  if (!s) return null;
  const s0 = Math.ceil(s[0]);
  const n = Math.max(0, Math.floor(s[1]) - s0);
  const ok = new Float64Array(n + 1);
  const inSum = new Float64Array(n + 1);
  const outSum = new Float64Array(n + 1);
  const insideAt = new Float32Array(n);
  const outsideAt = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = s0 + k + 0.5;
    const px = ox + dx * t;
    const py = oy + dy * t;
    let inside = 0;
    let outside = 0;
    for (const d of [1.5, 2.5, 3.5]) {
      inside += bilinear(g, w, h, px + nx * d, py + ny * d) / 3;
      outside += bilinear(g, w, h, px - nx * d, py - ny * d) / 3;
    }
    insideAt[k] = inside;
    outsideAt[k] = outside;
    const good = inside - outside >= EDGE_CONTRAST;
    ok[k + 1] = ok[k]! + (good ? 1 : 0);
    inSum[k + 1] = inSum[k]! + (good ? inside : 0);
    outSum[k + 1] = outSum[k]! + (good ? outside : 0);
  }
  return { line: { a: nx, b: ny, c: rho }, ox, oy, dx, dy, s0, ok, inSum, outSum, inside: insideAt, outside: outsideAt, votes, role };
}

/** The strongest lines, each with its normal pointing into its brighter side. */
function houghLines(g: Float32Array, w: number, h: number, maxLines: number) {
  const { gx, gy, mag, keep } = edgePixels(g, w, h);
  const R = Math.ceil(Math.hypot(w, h));
  const rhoBins = 2 * R + 1;
  const acc = new Float32Array(THETA_BINS * rhoBins);
  const cos = new Float64Array(THETA_BINS);
  const sin = new Float64Array(THETA_BINS);
  for (let t = 0; t < THETA_BINS; t++) {
    cos[t] = Math.cos(t * THETA_STEP);
    sin[t] = Math.sin(t * THETA_STEP);
  }
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (!keep[i]) continue;
      const vote = Math.min(mag[i]!, VOTE_CAP) / VOTE_CAP;
      const phi = Math.atan2(gy[i]!, gx[i]!);
      const centre = Math.round(phi / THETA_STEP);
      for (let dt = -1; dt <= 1; dt++) {
        const t = (((centre + dt) % THETA_BINS) + THETA_BINS) % THETA_BINS;
        const rho = (x + 0.5) * cos[t]! + (y + 0.5) * sin[t]!;
        acc[t * rhoBins + Math.round(rho) + R]! += vote;
      }
    }
  }
  // Peaks: the best cell within ±2 bins of direction (±4°) and ±3 px.
  const minVotes = 0.05 * Math.min(w, h);
  const peaks: { t: number; r: number; v: number }[] = [];
  for (let t = 0; t < THETA_BINS; t++) {
    for (let r = 0; r < rhoBins; r++) {
      const v = acc[t * rhoBins + r]!;
      if (v < minVotes) continue;
      let best = true;
      for (let dt = -2; dt <= 2 && best; dt++) {
        const tt = (((t + dt) % THETA_BINS) + THETA_BINS) % THETA_BINS;
        for (let dr = -3; dr <= 3; dr++) {
          if (dt === 0 && dr === 0) continue;
          const rr = r + dr;
          if (rr < 0 || rr >= rhoBins) continue;
          const u = acc[tt * rhoBins + rr]!;
          // Ties go to the first cell in scan order.
          if (u > v || (u === v && (dt < 0 || (dt === 0 && dr < 0)))) {
            best = false;
            break;
          }
        }
      }
      if (best) peaks.push({ t, r, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const edges: EdgeMap = { gx, gy, mag, keep, w, h, seen: new Int32Array(w * h), stamp: 0 };
  return { peaks: peaks.slice(0, maxLines).map((p) => ({ theta: p.t * THETA_STEP, rho: p.r - R, votes: p.v })), edges };
}

type EdgeMap = { gx: Float32Array; gy: Float32Array; mag: Float32Array; keep: Uint8Array; w: number; h: number; seen: Int32Array; stamp: number };

/**
 * A Hough line is only as exact as its bins (2°: a side 300 px long can be 5 px off at its ends).
 * Refit it to its own edge pixels: those within 1.5 px of it whose gradient points its way,
 * weighted by their (capped) strength, twice.
 */
function fitToEdges(theta: number, rho: number, e: EdgeMap): { theta: number; rho: number } {
  const { gx, gy, mag, keep, w, h, seen } = e;
  const near = Math.cos((12 * Math.PI) / 180);
  for (let pass = 0; pass < 2; pass++) {
    const nx = Math.cos(theta);
    const ny = Math.sin(theta);
    const s = span(rho * nx, rho * ny, -ny, nx, w, h);
    if (!s) break;
    let sw = 0;
    let sx = 0;
    let sy = 0;
    const pts: [number, number, number][] = [];
    const stamp = ++e.stamp;
    for (let t = Math.ceil(s[0]); t <= s[1]; t++) {
      for (let d = -2; d <= 2; d++) {
        const x = Math.floor(rho * nx - ny * t + nx * d);
        const y = Math.floor(rho * ny + nx * t + ny * d);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (!keep[i] || seen[i] === stamp) continue;
        seen[i] = stamp;
        const px = x + 0.5;
        const py = y + 0.5;
        if (Math.abs(px * nx + py * ny - rho) > 1.5) continue;
        if ((gx[i]! * nx + gy[i]! * ny) / mag[i]! < near) continue;
        const wt = Math.min(mag[i]!, VOTE_CAP);
        pts.push([px, py, wt]);
        sw += wt;
        sx += wt * px;
        sy += wt * py;
      }
    }
    if (pts.length < 8) break;
    const mx = sx / sw;
    const my = sy / sw;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const [px, py, wt] of pts) {
      sxx += wt * (px - mx) ** 2;
      sxy += wt * (px - mx) * (py - my);
      syy += wt * (py - my) ** 2;
    }
    // The normal is the direction of least spread; keep it pointing the way it did.
    const along = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let fx = -Math.sin(along);
    let fy = Math.cos(along);
    if (fx * nx + fy * ny < 0) {
      fx = -fx;
      fy = -fy;
    }
    theta = Math.atan2(fy, fx);
    rho = fx * mx + fy * my;
  }
  return { theta, rho };
}

/** Side roles by the normal's direction: top (paper below), right, bottom, left. */
const ROLE_ANGLE = [Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 0];
function roleOf(theta: number): number {
  let best = 0;
  let least = Infinity;
  for (let r = 0; r < 4; r++) {
    const d = Math.abs(Math.atan2(Math.sin(theta - ROLE_ANGLE[r]!), Math.cos(theta - ROLE_ANGLE[r]!)));
    if (d < least) {
      least = d;
      best = r;
    }
  }
  return least <= Math.PI / 4 + 0.01 ? best : -1;
}

/** The samples of a side between two corners, not too near them (the other side's edge is there). */
function sideRange(p: Profile, a: Point, b: Point) {
  const sa = (a[0] - p.ox) * p.dx + (a[1] - p.oy) * p.dy - p.s0;
  const sb = (b[0] - p.ox) * p.dx + (b[1] - p.oy) * p.dy - p.s0;
  const n = p.ok.length - 1;
  const len = Math.abs(sb - sa);
  const margin = 0.06 * len + 1;
  const lo = Math.max(0, Math.min(n, Math.round(Math.min(sa, sb) + margin)));
  const hi = Math.max(0, Math.min(n, Math.round(Math.max(sa, sb) - margin)));
  return { lo, hi, len };
}

/**
 * The real score. The paper's level is the median just inside the clear edges; a point of the
 * outline counts when it's an edge *and* that paper is inside it, so a side running on over a
 * lit table (a faint edge, but table inside) doesn't count there. Where the page lies on
 * something as bright as itself there's no edge, but the paper is still inside: `paper` is the
 * share of the outline with paper inside, edge or not. Sides in `skip` (on the frame's border,
 * for a page running off it) aren't counted.
 */
function score(sides: readonly Profile[], quad: Quad, fraction: number, skip: readonly boolean[] = []): EdgeQuad | null {
  const ranges = [0, 1, 2, 3].map((i) => sideRange(sides[i]!, quad[i]!, quad[(i + 1) % 4]!));
  const clear: number[] = [];
  const sideIn: number[][] = [[], [], [], []];
  const sideOut: number[][] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    if (skip[i]) continue;
    const p = sides[i]!;
    for (let k = ranges[i]!.lo; k < ranges[i]!.hi; k++) {
      if (p.inside[k]! - p.outside[k]! < EDGE_CONTRAST) continue;
      clear.push(p.inside[k]!);
      sideIn[i]!.push(p.inside[k]!);
      sideOut[i]!.push(p.outside[k]!);
    }
  }
  if (clear.length < 8) return null;
  const level = median(clear);
  const outside = median(sideOut.flat());
  const floor = PAPER_SHARE * level;
  let edge = 0;
  let paper = 0;
  let total = 0;
  const share: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = sides[i]!;
    const { lo, hi, len } = ranges[i]!;
    let e = 0;
    let q = 0;
    for (let k = lo; k < hi; k++) {
      if (p.inside[k]! < floor) continue;
      q++;
      if (p.inside[k]! - p.outside[k]! >= EDGE_CONTRAST) e++;
    }
    const n = Math.max(1, hi - lo);
    share.push(e / n);
    if (skip[i]) continue;
    edge += (e / n) * len;
    paper += (q / n) * len;
    total += len;
  }
  // Each side's edge is halfway between its own paper and its own outside (a file on one side,
  // the table on another); a side with too few clear points takes the whole outline's.
  const thresholds = [0, 1, 2, 3].map((i) =>
    sideIn[i]!.length >= 4 ? (median(sideIn[i]!) + median(sideOut[i]!)) / 2 : (level + outside) / 2,
  );
  return {
    quad,
    support: total ? edge / total : 0,
    paper: total ? paper / total : 0,
    sides: share as [number, number, number, number],
    inside: level,
    outside,
    thresholds: thresholds as [number, number, number, number],
    fraction,
  };
}

/** Score any quad (in the grid's pixels) the same way, e.g. the bright-region finder's, to choose between them. */
export function scoreQuad(g: Float32Array, w: number, h: number, quad: Quad, skip: readonly boolean[] = []): EdgeQuad | null {
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  const sides: Profile[] = [];
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / len;
    let ny = (b[0] - a[0]) / len;
    if (nx * (cx - a[0]) + ny * (cy - a[1]) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const p = profile(g, w, h, Math.atan2(ny, nx), nx * a[0] + ny * a[1], 0, i);
    if (!p) return null;
    sides.push(p);
  }
  return score(sides, quad, polygonArea(quad) / (w * h), skip);
}

/** Median of levels (0–255) to the nearest level, from a histogram: no sort. */
function median(v: readonly number[]): number {
  const hist = new Uint32Array(256);
  for (const x of v) hist[Math.max(0, Math.min(255, Math.round(x)))]!++;
  let run = 0;
  for (let i = 0; i < 256; i++) {
    run += hist[i]!;
    if (run * 2 >= v.length) return i;
  }
  return 255;
}

/** Inside a side, at least this share of the paper's level counts as paper. */
const PAPER_SHARE = 0.8;
/** First-look shortlist size. */
const SHORTLIST = 40;
/** Scores this close to the best are a tie, settled by size. */
const TIE = 0.03;
/** Lines this close (direction, grid pixels) are the same line. */
const SAME_ANGLE = (1.5 * Math.PI) / 180;
const SAME_RHO = 1.5;
/** Opposite sides face each other within this (perspective tilts them, but not by much). */
const FACING = -Math.cos((35 * Math.PI) / 180);
/** Corners between 50° and 130°. */
const SQUARE_ENOUGH = Math.cos((50 * Math.PI) / 180);

/**
 * Quads whose four sides are edges with paper inside, best first. `g` is a paper score on a
 * small grid (about 240 × 320); the quads are in its pixels.
 */
export function findEdgeQuads(g: Float32Array, w: number, h: number, opts: { minFraction: number; max?: number }): EdgeQuad[] {
  const { peaks, edges } = houghLines(g, w, h, 80);
  const byRole: Profile[][] = [[], [], [], []];
  for (const peak of peaks) {
    const role0 = roleOf(peak.theta);
    if (role0 < 0 || byRole[role0]!.length >= PER_SIDE) continue;
    const l = fitToEdges(peak.theta, peak.rho, edges);
    const role = roleOf(l.theta);
    if (role < 0 || byRole[role]!.length >= PER_SIDE) continue;
    // Two peaks refitted onto the same edge are one line.
    const cos = Math.cos(l.theta);
    const sin = Math.sin(l.theta);
    const same = byRole[role]!.some((p) => Math.abs(Math.atan2(sin * p.line.a - cos * p.line.b, cos * p.line.a + sin * p.line.b)) < SAME_ANGLE && Math.abs(l.rho - p.line.c) < SAME_RHO);
    if (same) continue;
    const p = profile(g, w, h, l.theta, l.rho, peak.votes, role);
    if (p) byRole[role]!.push(p);
    if (byRole.every((r) => r.length >= PER_SIDE)) break;
  }
  const [tops, rights, bottoms, lefts] = byRole as [Profile[], Profile[], Profile[], Profile[]];
  const inGrid = (c: Point | null): c is Point =>
    c !== null && c[0] >= -CORNER_SLACK && c[1] >= -CORNER_SLACK && c[0] <= w + CORNER_SLACK && c[1] <= h + CORNER_SLACK;
  // Each corner is where two sides meet: work them all out once.
  const meet = (as: Profile[], bs: Profile[]) => as.map((a) => bs.map((b) => {
    const c = intersect(a.line, b.line);
    return inGrid(c) ? c : null;
  }));
  const tl = meet(lefts, tops);
  const tr = meet(tops, rights);
  const br = meet(rights, bottoms);
  const bl = meet(bottoms, lefts);
  const area = w * h;
  const rough: { sides: Profile[]; quad: Quad; fraction: number; share: number }[] = [];
  for (let t = 0; t < tops.length; t++) {
    const T = tops[t]!;
    for (let b = 0; b < bottoms.length; b++) {
      const B = bottoms[b]!;
      if (T.line.a * B.line.a + T.line.b * B.line.b > FACING) continue;
      for (let l = 0; l < lefts.length; l++) {
        const L = lefts[l]!;
        const c0 = tl[l]![t];
        const c3 = bl[b]![l];
        if (!c0 || !c3) continue;
        for (let r = 0; r < rights.length; r++) {
          const R = rights[r]!;
          if (L.line.a * R.line.a + L.line.b * R.line.b > FACING) continue;
          const c1 = tr[t]![r];
          const c2 = br[r]![b];
          if (!c1 || !c2) continue;
          const quad: Quad = [c0, c1, c2, c3];
          if (!isConvexQuad(quad)) continue;
          const fraction = polygonArea(quad) / area;
          if (fraction < opts.minFraction) continue;
          const sides = [T, R, B, L];
          // Every side's normal points into the quad.
          const cx = (c0[0] + c1[0] + c2[0] + c3[0]) / 4;
          const cy = (c0[1] + c1[1] + c2[1] + c3[1]) / 4;
          if (sides.some((s) => s.line.a * cx + s.line.b * cy <= s.line.c)) continue;
          if (!squareEnough(quad)) continue;
          let sum = 0;
          let weak = false;
          for (let i = 0; i < 4 && !weak; i++) {
            const p = sides[i]!;
            const { lo, hi } = sideRange(p, quad[i]!, quad[(i + 1) % 4]!);
            const share = hi - lo < 2 ? 0 : (p.ok[hi]! - p.ok[lo]!) / (hi - lo);
            weak = share < 0.25;
            sum += share;
          }
          if (!weak) rough.push({ sides, quad, fraction, share: sum / 4 });
        }
      }
    }
  }
  rough.sort((a, b) => b.share - a.share);
  const out: EdgeQuad[] = [];
  for (const r of rough.slice(0, SHORTLIST)) {
    const s = score(r.sides, r.quad, r.fraction);
    if (s) out.push(s);
  }
  const rank = (q: EdgeQuad) => q.support * q.paper;
  out.sort((a, b) => rank(b) - rank(a));
  // Near-equal outlines are usually the same sheet, with or without something along one edge
  // (a curled roll, a binding tape): take the whole sheet, so the live outline and the still
  // agree, and no writing is ever cut.
  const top = out.length ? rank(out[0]!) - TIE : Infinity;
  out.sort((a, b) => Number(rank(b) >= top) - Number(rank(a) >= top) || (rank(a) >= top ? b.fraction - a.fraction : rank(b) - rank(a)));
  return opts.max ? out.slice(0, opts.max) : out;
}

/** Every corner between 50° and 130° (a page in perspective, not a sliver). */
function squareEnough(q: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const p = q[i]!;
    const a = q[(i + 3) % 4]!;
    const b = q[(i + 1) % 4]!;
    const ux = a[0] - p[0];
    const uy = a[1] - p[1];
    const vx = b[0] - p[0];
    const vy = b[1] - p[1];
    if (Math.abs(ux * vx + uy * vy) > SQUARE_ENOUGH * Math.hypot(ux, uy) * Math.hypot(vx, vy)) return false;
  }
  return true;
}
