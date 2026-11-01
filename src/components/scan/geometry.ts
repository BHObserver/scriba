/**
 * Plane geometry for the page finder (docs/PLAN_V3.md, C2): corner order, homographies, hulls
 * and the four sides of a page. Pure functions, no DOM, so the worker and the tests share them.
 *
 * A quad is always [top-left, top-right, bottom-right, bottom-left] in image pixels (y down).
 */

export type Point = readonly [number, number];
export type Quad = readonly [Point, Point, Point, Point];
/** Row-major 3×3, maps (x, y, 1) to (u·w, v·w, w). */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

export const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Shoelace area, positive whatever the winding. */
export function polygonArea(points: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

/**
 * Four corners in page order (TL, TR, BR, BL), whatever order they came in. They are sorted by
 * angle round their centre, then the corner nearest the image's top-left starts the list.
 */
export function orderCorners(points: readonly Point[]): Quad {
  if (points.length !== 4) throw new Error("A page has four corners.");
  const cx = points.reduce((s, p) => s + p[0], 0) / 4;
  const cy = points.reduce((s, p) => s + p[1], 0) / 4;
  // Clockwise on screen (y down) is increasing atan2.
  const round = [...points].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) if (round[i]![0] + round[i]![1] < round[start]![0] + round[start]![1]) start = i;
  return [0, 1, 2, 3].map((k) => round[(start + k) % 4]!) as unknown as Quad;
}

/** Convex and wound one way (no bow-tie, no dent). */
export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i]!, q[(i + 1) % 4]!, q[(i + 2) % 4]!);
    if (Math.abs(c) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/** Interior angles in degrees, one per corner. */
export function cornerAngles(q: Quad): number[] {
  return q.map((p, i) => {
    const a = q[(i + 3) % 4]!;
    const b = q[(i + 1) % 4]!;
    const v1 = [a[0] - p[0], a[1] - p[1]];
    const v2 = [b[0] - p[0], b[1] - p[1]];
    const cos = (v1[0]! * v2[0]! + v1[1]! * v2[1]!) / (Math.hypot(v1[0]!, v1[1]!) * Math.hypot(v2[0]!, v2[1]!));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
}

/** Solve A·x = b in place by Gaussian elimination with partial pivoting. Null when singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    for (let r = col + 1; r < n; r++) {
      const f = a[r]![col]! / a[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c < n; c++) a[r]![c]! -= f * a[col]![c]!;
      b[r]! -= f * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let c = r + 1; c < n; c++) s -= a[r]![c]! * x[c]!;
    x[r] = s / a[r]![r]!;
  }
  return x;
}

/** Any three of four points on one line (relative to the points' spread). */
function hasThreeInLine(p: readonly Point[]): boolean {
  const scale = Math.max(1e-9, ...p.map((a) => p.map((b) => dist(a, b))).flat()) ** 2;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [0, 1, 2, 3].filter((k) => k !== i).map((k) => p[k]!);
    if (Math.abs(cross(a!, b!, c!)) < 1e-9 * scale) return true;
  }
  return false;
}

/** The homography taking each `from[i]` to `to[i]` (four point pairs). Null when degenerate. */
export function homography(from: readonly Point[], to: readonly Point[]): Homography | null {
  if (hasThreeInLine(from) || hasThreeInLine(to)) return null;
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]!;
    const [u, v] = to[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(a, b);
  return h ? ([...h, 1] as unknown as Homography) : null;
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p[0] + h[7] * p[1] + h[8];
  return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w];
}

/** Monotone-chain convex hull, clockwise on screen, no repeated or collinear points. */
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * The largest quadrilateral with its corners on the hull's vertices. For each pair of opposite
 * corners the best third and fourth corners are found by a walk (the area is unimodal along a
 * convex chain), so this is about n² for a hull of n points; the detector keeps n small.
 */
export function largestInscribedQuad(hull: readonly Point[]): Quad | null {
  const n = hull.length;
  if (n < 4) return null;
  const at = (i: number) => hull[((i % n) + n) % n]!;
  const tri = (a: Point, b: Point, c: Point) => Math.abs(cross(a, b, c)) / 2;
  let best = -1;
  let corners: Point[] = [];
  for (let i = 0; i < n; i++) {
    let j = i + 1;
    for (let k = i + 2; k < i + n - 1; k++) {
      // Best j on the chain i..k, walking forward while the triangle grows.
      if (j <= i) j = i + 1;
      if (j >= k) j = k - 1;
      while (j + 1 < k && tri(at(i), at(j + 1), at(k)) >= tri(at(i), at(j), at(k))) j++;
      // Best l on the chain k..i+n.
      let l = k + 1;
      while (l + 1 < i + n && tri(at(k), at(l + 1), at(i)) >= tri(at(k), at(l), at(i))) l++;
      if (l >= i + n) continue;
      const area = tri(at(i), at(j), at(k)) + tri(at(k), at(l), at(i));
      if (area > best) {
        best = area;
        corners = [at(i), at(j), at(k), at(l)];
      }
    }
  }
  return best > 0 ? orderCorners(corners) : null;
}

/** A line a·x + b·y = c with (a, b) of unit length. */
export type Line = { a: number; b: number; c: number };

/** Total least squares: the line closest to the points (perpendicular distance). */
export function fitLine(points: readonly Point[]): Line | null {
  if (points.length < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p[0];
    my += p[1];
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p[0] - mx;
    const dy = p[1] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // Direction = principal eigenvector; the normal is perpendicular to it.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = -Math.sin(theta);
  const b = Math.cos(theta);
  return { a, b, c: a * mx + b * my };
}

/**
 * A line fitted, then refitted twice without the points far from it (a thumb's outline, a
 * curl), so a few stray points can't tilt a side.
 */
export function robustLine(points: readonly Point[]): Line | null {
  let kept = points;
  let line = fitLine(kept);
  for (let pass = 0; pass < 2 && line; pass++) {
    const fit = line;
    const residuals = kept.map((p) => distanceToLine(fit, p)).sort((a, b) => a - b);
    const limit = Math.max(1, 2.5 * residuals[Math.floor(residuals.length / 2)]!);
    const next = kept.filter((p) => distanceToLine(fit, p) <= limit);
    if (next.length < Math.max(2, points.length * 0.3)) break;
    kept = next;
    line = fitLine(kept);
  }
  return line;
}

export function lineThrough(p: Point, q: Point): Line {
  const len = dist(p, q) || 1;
  const a = -(q[1] - p[1]) / len;
  const b = (q[0] - p[0]) / len;
  return { a, b, c: a * p[0] + b * p[1] };
}

export function intersect(l1: Line, l2: Line): Point | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-9) return null;
  return [(l1.c * l2.b - l2.c * l1.b) / det, (l1.a * l2.c - l2.a * l1.c) / det];
}

export const distanceToLine = (l: Line, p: Point) => Math.abs(l.a * p[0] + l.b * p[1] - l.c);

/**
 * Sharpen a rough quad against the page's edge points, given per side (side i runs from corner
 * i to corner i + 1): each side becomes the line robustly fitted to its points, and the corners
 * are where neighbouring sides meet. A corner hidden under a thumb comes back this way. A side
 * with too few points keeps its rough line; a result that isn't a sane quad gives the rough one.
 */
export function refineQuad(rough: Quad, sidePoints: readonly (readonly Point[])[]): Quad {
  const sides = [0, 1, 2, 3].map((i) => {
    const pts = sidePoints[i] ?? [];
    return (pts.length >= 6 ? robustLine(pts) : null) ?? lineThrough(rough[i]!, rough[(i + 1) % 4]!);
  });
  const corners: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const c = intersect(sides[(i + 3) % 4]!, sides[i]!);
    if (!c) return rough;
    corners.push(c);
  }
  const refined = corners as unknown as Quad;
  // A refined corner stays near its rough one; a hidden corner may move further.
  const maxMove = 0.15 * Math.max(dist(rough[0], rough[2]), dist(rough[1], rough[3]));
  if (!isConvexQuad(refined) || refined.some((c, i) => dist(c, rough[i]!) > maxMove)) return rough;
  return refined;
}

/** The output size for a flattened page: each side as long as the longer of its two edges, so nothing is shrunk. */
export function flatSize(q: Quad, aspect?: number): { width: number; height: number } {
  const width = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  const height = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  // A known paper shape (the Scriba khata is A5) keeps the longer measured side.
  if (aspect) return height * aspect >= width ? { width: Math.round(height * aspect), height: Math.round(height) } : { width: Math.round(width), height: Math.round(width / aspect) };
  return { width: Math.round(width), height: Math.round(height) };
}

/** Scale a size down to at most `maxPixels`, never up. */
export function capPixels(size: { width: number; height: number }, maxPixels: number) {
  const k = Math.min(1, Math.sqrt(maxPixels / (size.width * size.height)));
  return { width: Math.max(1, Math.floor(size.width * k)), height: Math.max(1, Math.floor(size.height * k)) };
}

export const scaleQuad = (q: Quad, sx: number, sy = sx): Quad => q.map(([x, y]) => [x * sx, y * sy]) as unknown as Quad;

/** The whole image as a quad: what "no page found" means. */
export const fullQuad = (width: number, height: number): Quad => [
  [0, 0],
  [width, 0],
  [width, height],
  [0, height],
];

/** True when every corner is within `tolerance` pixels of the image's own corner (nothing to crop). */
export function isFullFrame(q: Quad, width: number, height: number, tolerance: number): boolean {
  const full = fullQuad(width, height);
  return q.every((c, i) => dist(c, full[i]!) <= tolerance);
}
