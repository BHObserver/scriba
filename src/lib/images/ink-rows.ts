/**
 * F2 fix 6: the model's line boxes put back on the writing.
 *
 * The model reads a page well but places its lines badly: on his 4 Nov pages the boxes drifted
 * down by a full line in the middle of one page and by up to five lines near the bottom of the
 * other, so a line's picture showed a different line, or blank paper. This finds the rows of
 * handwriting on the photo and matches the model's lines to them in reading order, then puts each
 * box on its row. Pure (a grey raster in, boxes out); `snap-boxes.ts` decodes the photo.
 *
 * 1. Ink: how much darker each pixel is than the paper around it. Pen ink is far darker than the
 *    ruled lines and the writing showing through from the back of the page, so a threshold set
 *    from the darkest ink keeps the pen and drops those. His underlines under a part (pen strokes,
 *    a little slanted), the ruled lines and the page's edges are taken out.
 * 2. Rows: peaks of the ink across the page, at least about half a line apart. A row too tall for
 *    one line is split where a strip of the page shows two lines in it.
 * 3. Matching: the model's lines in order onto the rows in order (a dynamic programme). A row may
 *    go unmatched (a heading like "প্রাণের সেলিম:", the date, "নতুন মাল:"). A line is expected
 *    near its model place at the top of the page and within a widening reach lower down; the
 *    gaps between lines may be stretched against the model's, but steadily. A part with a title
 *    expects one row of heading before its first line.
 * 4. A matched line takes its row's height, and a short row right under it that starts well to
 *    the right ("= ১৯৫" written under its line) joins it. An unmatched line moves with its
 *    neighbours. When too few lines find a row, nothing is changed.
 *
 * Measured with `bun scripts/measure-boxes.ts` on 20 stored readings of his 9 pages (277 lines,
 * truth checked by eye): the model's boxes showed their own line for 225, the snapped ones 276.
 * Fix 8 (5 Nov): with his two 5 Nov pages, 22 readings and 316 lines: 293 before, 313 now.
 */

/** A grey picture, one byte a pixel (0 black, 255 white), row by row. */
export type Gray = { data: Uint8Array; width: number; height: number };

/** A box on the model's 0–1000 grid of the page. */
export type Box = { x_min: number; y_min: number; x_max: number; y_max: number };

/** A row of writing found on the page, on the 0–1000 grid. */
export type InkRow = { top: number; bottom: number; center: number; x0: number; x1: number; mass: number };

/**
 * A pen stroke taken out of the ink (F2 fix 10): his line drawn between two parts, or an
 * underline. On the 0–1000 grid: its middle height and how far it runs across.
 */
export type Stroke = { y: number; x0: number; x1: number; /** Top to bottom, in line pitches. */ tall: number };

/** Strokes as found, in pixels: [middle row, first column, last column, top-to-bottom height]. */
export type RawStroke = [number, number, number, number];

/** A line as read: its box (null if the model gave none), its block, and whether it opens a titled block. */
export type LineIn = { box: Box | null; block: string | null; opensTitledBlock: boolean };

export type SnapResult = {
  /** Every line's box, in the order given; unchanged when `applied` is false. */
  boxes: Array<Box | null>;
  applied: boolean;
  /** Why nothing was changed, when it wasn't. */
  reason: string | null;
  /** How many lines found a row of writing. */
  matched: number;
  /** The row each line was put on (index into `rows`), or null. */
  rowOf: Array<number | null>;
  rows: InkRow[];
  /** The line pitch used, on the grid. */
  pitch: number;
  /** The pen strokes taken out of the ink, top to bottom; empty when nothing was changed. */
  strokes: Stroke[];
};

// --- 1. ink -------------------------------------------------------------------------------------

/** How much darker than the local paper each pixel is (0–255). */
export function darkness(img: Gray): Uint8Array {
  const { data, width: w, height: h } = img;
  const r = Math.max(3, Math.round(w / 80)); // removes strokes up to ~2r wide
  const bg = boxBlur(boxBlur(maxFilter(data, w, h, r), w, h, Math.max(2, Math.round(w / 75))), w, h, Math.max(2, Math.round(w / 75)));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, bg[i]! - data[i]!);
  return out;
}

/** Pen ink: 1 where a pixel is ink, with page edges, long thin strokes and long vertical runs removed. */
export function inkMask(img: Gray, found?: RawStroke[]): Uint8Array {
  const { width: w, height: h } = img;
  const d = darkness(img);
  const threshold = Math.max(30, 0.4 * percentile(d, 0.995));
  const m = new Uint8Array(w * h);
  const edge = Math.round(w * 0.025);
  for (let y = 0; y < h; y++) {
    for (let x = edge; x < w - edge; x++) if (d[y * w + x]! > threshold) m[y * w + x] = 1;
  }
  removeLongVerticals(m, w, h, Math.round(h * 0.08));
  removeThinHorizontals(m, w, h, Math.round(w * 0.12), found);
  return m;
}

function removeLongVerticals(m: Uint8Array, w: number, h: number, minRun: number) {
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && m[y * w + x] === 1;
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= minRun) for (let k = start; k < y; k++) m[k * w + x] = 0;
        start = -1;
      }
    }
  }
}

/**
 * Underlines and ruled lines: runs at least `minRun` long (gaps of 2 px bridged) with little ink
 * a few pixels above and below. The headline of a written word is as long, but letters hang under it.
 */
function removeThinHorizontals(m: Uint8Array, w: number, h: number, minRun: number, found?: RawStroke[]) {
  const off = Math.max(4, Math.round(w / 120));
  const kill: Array<[number, number, number]> = [];
  const density = (y: number, a: number, b: number) => {
    if (y < 0 || y >= h) return 0;
    let n = 0;
    for (let x = a; x < b; x++) n += m[y * w + x]!;
    return n / Math.max(1, b - a);
  };
  for (let y = 0; y < h; y++) {
    let start = -1;
    let gap = 0;
    for (let x = 0; x <= w; x++) {
      const on = x < w && m[y * w + x] === 1;
      if (on) {
        if (start < 0) start = x;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap > 2 || x === w) {
          const end = x - gap + 1;
          if (end - start >= minRun) {
            const above = Math.max(density(y - off, start, end), density(y - off - 1, start, end));
            const below = Math.max(density(y + off, start, end), density(y + off + 1, start, end));
            if (above < 0.2 && below < 0.2) kill.push([y, start, end]);
          }
          start = -1;
          gap = 0;
        }
      }
    }
  }
  for (const [y, a, b] of kill) for (let x = a; x < b; x++) m[y * w + x] = 0;
  found?.push(...kill.map(([y, a, b]): RawStroke => [y, a, b - 1, 1]));
}

/**
 * His underlines under a part and the long dashes he draws are pen strokes a little slanted, so
 * no single pixel row holds them. Found as connected ink at least `minWidth` wide that is only a
 * pen's width thick in nearly every column (a written word isn't: its letters hang below the
 * headline), and removed. Returns how many strokes were removed.
 */
export function removeStrokes(m: Uint8Array, w: number, h: number, pitchPx: number, found?: RawStroke[]): number {
  const minWidth = Math.round(w * 0.06);
  const maxThick = Math.max(3, pitchPx * 0.22);
  const label = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let removed = 0;
  for (let start = 0; start < w * h; start++) {
    if (m[start] !== 1 || label[start] !== -1) continue;
    // Flood the component (8 neighbours), remembering its pixels.
    const pixels: number[] = [];
    label[start] = start;
    stack.push(start);
    let x0 = w;
    let x1 = -1;
    while (stack.length > 0) {
      const p = stack.pop()!;
      pixels.push(p);
      const px = p % w;
      const py = (p - px) / w;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
          const q = ny * w + nx;
          if (m[q] === 1 && label[q] === -1) {
            label[q] = start;
            stack.push(q);
          }
        }
      }
    }
    const width = x1 - x0 + 1;
    if (width < minWidth) continue;
    // How tall the ink is in each column it crosses.
    const lo = new Int32Array(width).fill(h);
    const hi = new Int32Array(width).fill(-1);
    for (const p of pixels) {
      const px = p % w;
      const py = (p - px) / w;
      const c = px - x0;
      if (py < lo[c]!) lo[c] = py;
      if (py > hi[c]!) hi[c] = py;
    }
    const thick: number[] = [];
    for (let c = 0; c < width; c++) if (hi[c]! >= 0) thick.push(hi[c]! - lo[c]! + 1);
    thick.sort((a, b) => a - b);
    const p85 = thick[Math.floor(thick.length * 0.85)] ?? 0;
    if (p85 <= maxThick) {
      let ySum = 0;
      let yTop = h;
      let yBottom = 0;
      for (const p of pixels) {
        m[p] = 0;
        const py = Math.floor(p / w);
        ySum += py;
        if (py < yTop) yTop = py;
        if (py > yBottom) yBottom = py;
      }
      found?.push([ySum / pixels.length, x0, x1, yBottom - yTop + 1]);
      removed++;
    }
  }
  return removed;
}

/**
 * The strokes taken out, one each, on the grid. A straight one comes as runs on a few pixel rows,
 * joined here. One running most of the way across is a ruled line or the page's edge, not his.
 */
export function strokesOf(raw: readonly RawStroke[], w: number, h: number, pitchPx: number): Stroke[] {
  const near = Math.max(3, Math.round(h / 400));
  const groups: Array<{ ys: number[]; x0: number; x1: number; tall: number }> = [];
  for (const [y, a, b, tall] of [...raw].sort((p, q) => p[0] - q[0])) {
    const g = groups.find((s) => Math.abs(s.ys.at(-1)! - y) <= near && a <= s.x1 && b >= s.x0);
    if (g) {
      g.ys.push(y);
      g.x0 = Math.min(g.x0, a);
      g.x1 = Math.max(g.x1, b);
      g.tall = Math.max(g.tall, tall, g.ys.at(-1)! - g.ys[0]! + 1);
    } else groups.push({ ys: [y], x0: a, x1: b, tall });
  }
  // A stroke with a break in it (the pen skipped) comes as pieces at one height: joined across a
  // small gap. So are the pieces of a ruled line, which then run too far to be his.
  const meanY = (g: { ys: number[] }) => g.ys.reduce((s, v) => s + v, 0) / g.ys.length;
  const gap = w * 0.04;
  for (let joined = true; joined; ) {
    joined = false;
    for (let i = 0; i < groups.length && !joined; i++) {
      for (let j = i + 1; j < groups.length && !joined; j++) {
        const p = groups[i]!;
        const q = groups[j]!;
        const dy = Math.abs(meanY(p) - meanY(q));
        if (dy > near * 2 || Math.max(p.x0, q.x0) - Math.min(p.x1, q.x1) > gap) continue;
        groups[i] = { ys: [...p.ys, ...q.ys], x0: Math.min(p.x0, q.x0), x1: Math.max(p.x1, q.x1), tall: Math.max(p.tall, q.tall, dy + 1) };
        groups.splice(j, 1);
        joined = true;
      }
    }
  }
  return groups
    .filter((g) => g.x1 - g.x0 + 1 <= w * 0.7 && g.tall <= STROKE_TALL * pitchPx)
    .map((g) => ({ y: (g.ys.reduce((s, v) => s + v, 0) / g.ys.length / h) * 1000, x0: (g.x0 / w) * 1000, x1: (g.x1 / w) * 1000, tall: g.tall / pitchPx }))
    .sort((p, q) => p.y - q.y);
}

/**
 * How tall a stroke may be, top to bottom, as a share of the line pitch: his lines between parts are
 * drawn nearly flat, while the headline of a word taken out as a stroke has its letters under it.
 */
export const STROKE_TALL = 0.4;

// --- 2. rows ------------------------------------------------------------------------------------

/** Ink per pixel row. */
export function rowProfile(m: Uint8Array, w: number, h: number): Float64Array {
  const p = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += m[y * w + x]!;
    p[y] = n;
  }
  return p;
}

/**
 * The line pitch in pixels: the lag where the row profile best repeats, near the guess.
 * Falls back to the guess when the profile doesn't repeat.
 */
export function estimatePitch(profile: Float64Array, guess: number): number {
  const n = profile.length;
  const mean = profile.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const c = profile.map((v) => v - mean);
  let best = guess;
  let bestScore = -Infinity;
  const lo = Math.max(4, Math.floor(guess * 0.7));
  const hi = Math.min(n - 1, Math.ceil(guess * 1.4));
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let y = 0; y + lag < n; y++) s += c[y]! * c[y + lag]!;
    s /= n - lag;
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  return bestScore > 0 ? best : guess;
}

/** Strips the page is cut into, across, to tell two close lines apart inside one row. */
export const STRIPS = 4;

/**
 * Rows of writing, top to bottom, on the 0–1000 grid. `pitchPx` is the line pitch in pixels.
 * Rows are the peaks of the ink across the whole page width, at least ~half a line apart (a line
 * that slants a little on a bent page stays one row). A row taller than a line is split where a
 * strip of the page shows two lines in it with a gap between: P3's "দুধ / আটা" are written close,
 * with "} হিসাব পরে" beside them filling the gap across the page.
 */
export function findRows(m: Uint8Array, w: number, h: number, pitchPx: number): InkRow[] {
  const raw = rowProfile(m, w, h);
  const smooth = gaussian(raw, Math.max(1, pitchPx * 0.15));
  const peaks = peaksOf(smooth, 0, h - 1, pitchPx * 0.55, 0);
  if (peaks.length === 0) return [];

  // Bands: from the low point between two peaks to the next; outer edges where the ink fades.
  const bands: Array<[number, number]> = peaks.map((p, i) => {
    const prev = peaks[i - 1];
    const next = peaks[i + 1];
    const reach = Math.round(pitchPx * 0.9);
    let a = prev != null ? argmin(smooth, prev, p) : Math.max(0, p - reach);
    let b = next != null ? argmin(smooth, p, next) : Math.min(h - 1, p + reach);
    if (prev == null) while (a < p && smooth[a]! < smooth[p]! * 0.05) a++;
    if (next == null) while (b > p && smooth[b]! < smooth[p]! * 0.05) b--;
    return [a, b];
  });

  const rows: Array<InkRow & { core: number }> = [];
  for (const band of bands) {
    const first = coreOf(raw, band[0], band[1]);
    if (!first) continue;
    const parts = first[1] - first[0] + 1 >= pitchPx * 1.1 ? splitTall(m, w, pitchPx, band[0], band[1]) : [band];
    for (const [a, b] of parts) {
      const core = coreOf(raw, a, b);
      if (!core) continue;
      const row = rowStats(m, w, h, core[0], core[1]);
      if (row) rows.push({ ...row, mass: sum(raw, a, b), core: core[1] - core[0] + 1 });
    }
  }
  const masses = rows.map((r) => r.mass).sort((a, b) => a - b);
  const median = masses[Math.floor(masses.length / 2)] ?? 0;
  // Specks, bits of the back page, and what is left of a stroke: too little ink, or too thin.
  return rows
    .filter((r) => r.mass >= median * 0.15 && r.core >= pitchPx * 0.25)
    .map((r) => ({ top: r.top, bottom: r.bottom, center: r.center, x0: r.x0, x1: r.x1, mass: r.mass }));
}

/** Peaks of `p` in a..b, highest first kept, at least `gap` apart and above `floor`, top to bottom. */
function peaksOf(p: Float64Array, a: number, b: number, gap: number, floor: number): number[] {
  const candidates: number[] = [];
  for (let y = Math.max(1, a); y < Math.min(p.length - 1, b + 1); y++) {
    if (p[y]! > floor && p[y]! >= p[y - 1]! && p[y]! > p[y + 1]!) candidates.push(y);
  }
  candidates.sort((x, y) => p[y]! - p[x]!);
  const peaks: number[] = [];
  for (const y of candidates) if (peaks.every((q) => Math.abs(q - y) >= gap)) peaks.push(y);
  return peaks.sort((x, y) => x - y);
}

/** The pixel rows of a..b where the ink is at least 12% of the band's most: its written core. */
function coreOf(raw: Float64Array, a: number, b: number): [number, number] | null {
  let max = 0;
  for (let y = a; y <= b; y++) max = Math.max(max, raw[y]!);
  if (max === 0) return null;
  const floor = Math.max(1, max * 0.12);
  let top = a;
  let bottom = b;
  while (top < bottom && raw[top]! < floor) top++;
  while (bottom > top && raw[bottom]! < floor) bottom--;
  return [top, bottom];
}

/**
 * A band split where some strip of the page has two lines in it: two peaks at least ~half a line
 * apart with a clear gap between (the ink there under half the smaller peak). Splits found in
 * several strips at about the same height count once.
 */
function splitTall(m: Uint8Array, w: number, pitchPx: number, a: number, b: number): Array<[number, number]> {
  const cuts: number[] = [];
  for (let s = 0; s < STRIPS; s++) {
    const cx0 = Math.round((s * w) / STRIPS);
    const cx1 = Math.round(((s + 1) * w) / STRIPS);
    const raw = new Float64Array(b - a + 1);
    for (let y = a; y <= b; y++) {
      let n = 0;
      for (let x = cx0; x < cx1; x++) n += m[y * w + x]!;
      raw[y - a] = n;
    }
    const smooth = gaussian(raw, Math.max(1, pitchPx * 0.12));
    const top = smooth.reduce((x, v) => Math.max(x, v), 0);
    const peaks = peaksOf(smooth, 0, smooth.length - 1, pitchPx * 0.45, top * 0.2);
    for (let i = 1; i < peaks.length; i++) {
      const v = argmin(smooth, peaks[i - 1]!, peaks[i]!);
      if (smooth[v]! <= 0.5 * Math.min(smooth[peaks[i - 1]!]!, smooth[peaks[i]!]!)) cuts.push(a + v);
    }
  }
  if (cuts.length === 0) return [[a, b]];
  cuts.sort((x, y) => x - y);
  const merged: number[] = [];
  let group: number[] = [];
  for (const c of cuts) {
    if (group.length > 0 && c - group[group.length - 1]! > pitchPx * 0.3) {
      merged.push(group[Math.floor(group.length / 2)]!);
      group = [];
    }
    group.push(c);
  }
  merged.push(group[Math.floor(group.length / 2)]!);
  const parts: Array<[number, number]> = [];
  let start = a;
  for (const c of merged) {
    if (c - start >= pitchPx * 0.3 && b - c >= pitchPx * 0.3) {
      parts.push([start, c]);
      start = c + 1;
    }
  }
  parts.push([start, b]);
  return parts;
}

/** A row's place on the grid from its core pixel rows: ink-weighted middle, and where the ink is across. */
function rowStats(m: Uint8Array, w: number, h: number, top: number, bottom: number): Omit<InkRow, "mass"> | null {
  const cols = new Float64Array(w);
  let total = 0;
  let weighted = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      if (m[y * w + x]) {
        cols[x]!++;
        total++;
        weighted += y;
      }
    }
  }
  if (total === 0) return null;
  // Across: the 2nd to 98th percentile of the ink pixels.
  return {
    top: (top / h) * 1000,
    bottom: ((bottom + 1) / h) * 1000,
    center: (weighted / total / h) * 1000,
    x0: (quantileIndex(cols, total, 0.02) / w) * 1000,
    x1: ((quantileIndex(cols, total, 0.98) + 1) / w) * 1000,
  };
}

function sum(a: Float64Array, lo: number, hi: number): number {
  let s = 0;
  for (let i = lo; i <= hi; i++) s += a[i]!;
  return s;
}

// --- 3. matching --------------------------------------------------------------------------------

/*
 * The model's placing goes wrong in three ways. Seen on his 4 Nov pages: it stretches or squeezes
 * its spacing (page 2: every gap a fifth too long, so the boxes ran five lines low by the bottom),
 * and it bulges (page 1: a line low in the middle, right again at the bottom). Seen on his 5 Nov
 * page 1 (fix 8): it jumps between two parts, putting four or five lines of empty paper under the
 * first part, and every later part keeps that offset. Inside a part its spacing stays good. So a
 * match is judged by:
 *  - where each line is against its model place: close at the top of the page, where the model
 *    has not drifted yet, and within a widening reach further down. Far off only costs a little
 *    (ABS_CAP): after a jump every later line is far off, and that is one mistake, not twenty;
 *  - each gap between neighbouring lines against the model's gap: within a stretch of about a
 *    third either way, and much looser between two parts (NEW_BLOCK), where the jumps are;
 *  - inside a part, each gap against the stretch of the gap before it: the stretch keeps steady.
 *    Without this a steady stretch and "right, then a line off from one part on" would cost
 *    about the same. Across parts it isn't asked: there the model's gaps can't be trusted.
 * ABS_CAP from 0.2 to 0.5 and NEW_BLOCK from 3 to 6 measure the same (313/316); the middle is used.
 */
const REACH_TOP = 1.0; // pitches a line may be from its model place at the top of the page…
const REACH_GROWTH = 6; // …plus this many more at the bottom
const ABS_CAP = 0.3; // fix 8: was 4, which let one jump between parts outweigh the rows
const GAP_BASE = 0.5; // pitches a gap may differ from the model's gap…
const GAP_STRETCH = 0.35; // …plus this share of it
const KEEP_BASE = 0.3; // pitches a gap may differ from the stretch of the gap before…
const KEEP_STRETCH = 0.12; // …plus this share of it
const NEW_BLOCK = 4; // the model's gaps between parts are rougher, and may jump (fix 8: was 1.5)
const STEP_CAP = 6;
const MISS = 5; // a line that finds no row
const SHARE = 2; // two lines on one row (side by side)
const SKIP_IN = 0.6; // a row skipped inside a part ("নতুন মাল:")
const SKIP_BETWEEN = 0.3; // a row skipped between parts
const SKIP_LEAD = 0.15; // rows above the first line (page number, date)
const SKIP_TRAIL = 0.3; // rows below the last line
const NO_HEADING = 1; // a titled part with no row for its heading
const MAX_STEP = 10; // rows a step may move on
const MAX_MISSES = 2; // lines in a row that may find no row
const X_WEIGHT = 0.8;

/** A line to match: its model centre and width, its block, and whether it opens a titled block. */
export type Target = { center: number; x0: number; x1: number; block: string | null; opensTitledBlock: boolean };

/**
 * Best order-keeping match of lines (top to bottom) to rows (top to bottom); null for a line
 * that finds no row. Rows may go unmatched (headings, the date, notes).
 */
export function matchLines(lines: Target[], rows: InkRow[], pitch: number): { cost: number; rowOf: Array<number | null> } {
  const n = lines.length;
  const k = rows.length;
  if (n === 0) return { cost: 0, rowOf: [] };
  if (k === 0) return { cost: n * MISS, rowOf: lines.map(() => null) };
  const INF = Number.POSITIVE_INFINITY;
  const B = MAX_MISSES + 1; // how far back the line before may be
  const D = MAX_STEP + 1; // how many rows back its row may be

  const unary = (i: number, r: number) => {
    const t = lines[i]!;
    const row = rows[r]!;
    const reach = pitch * (REACH_TOP + (REACH_GROWTH * Math.max(0, t.center)) / 1000);
    const d = (row.center - t.center) / reach;
    const inter = Math.max(0, Math.min(t.x1, row.x1) - Math.max(t.x0, row.x0));
    const union = Math.max(t.x1, row.x1) - Math.min(t.x0, row.x0);
    return Math.min(d * d, ABS_CAP) + (union > 0 ? X_WEIGHT * (1 - inter / union) : 0);
  };
  /** Line p on row rp, then line i on row r; (pp, rpp) the pair before, or pp = -1. */
  const step = (pp: number, rpp: number, p: number, rp: number, i: number, r: number) => {
    const a = lines[p]!;
    const b = lines[i]!;
    const roughness = a.block !== b.block ? NEW_BLOCK : 1;
    const model = Math.max(0, b.center - a.center);
    const gap = rows[r]!.center - rows[rp]!.center;
    const off = (gap - model) / ((pitch * GAP_BASE + GAP_STRETCH * model) * roughness);
    let c = Math.min(off * off, STEP_CAP);
    if (pp >= 0 && r !== rp && rp !== rpp && a.block === b.block) {
      const modelBefore = lines[p]!.center - lines[pp]!.center;
      if (modelBefore >= pitch * 0.3) {
        const stretch = Math.min(2, Math.max(0.5, (rows[rp]!.center - rows[rpp]!.center) / modelBefore));
        const keep = (gap - stretch * model) / ((pitch * KEEP_BASE + KEEP_STRETCH * model) * roughness);
        c += Math.min(keep * keep, STEP_CAP);
      }
    }
    const skipped = r - rp - 1; // rows passed over on the way
    if (r === rp) c += SHARE;
    else if (b.opensTitledBlock) c += skipped === 0 ? NO_HEADING : (skipped - 1) * SKIP_BETWEEN;
    else c += skipped * (a.block !== b.block ? SKIP_BETWEEN : SKIP_IN);
    return c;
  };

  // A state: line i on row r, the line before it matched back `back` lines (p = i - 1 - back) on
  // row r - dr. start[i][r]: line i is the first line with a row.
  const idx = (i: number, r: number, back: number, dr: number) => ((i * k + r) * B + back) * D + dr;
  const cost = new Float64Array(n * k * B * D).fill(INF);
  const prevBack = new Int8Array(n * k * B * D).fill(-1); // the before-state's back, or -1: it was a start
  const prevDr = new Int8Array(n * k * B * D).fill(-1);
  const start = Array.from({ length: n }, () => new Float64Array(k).fill(INF));
  for (let i = 0; i <= Math.min(MAX_MISSES, n - 1); i++) for (let r = 0; r < k; r++) start[i]![r] = i * MISS + r * SKIP_LEAD + unary(i, r);

  for (let i = 1; i < n; i++) {
    for (let r = 0; r < k; r++) {
      const u = unary(i, r);
      for (let back = 0; back < B; back++) {
        const p = i - 1 - back;
        if (p < 0) break;
        for (let dr = 0; dr < D && dr <= r; dr++) {
          const rp = r - dr;
          let best = start[p]![rp]! + step(-1, -1, p, rp, i, r);
          let bestBack = -1;
          let bestDr = -1;
          for (let back2 = 0; back2 < B; back2++) {
            const pp = p - 1 - back2;
            if (pp < 0) break;
            for (let dr2 = 0; dr2 < D && dr2 <= rp; dr2++) {
              const before = cost[idx(p, rp, back2, dr2)]!;
              if (before === INF) continue;
              const c = before + step(pp, rp - dr2, p, rp, i, r);
              if (c < best) {
                best = c;
                bestBack = back2;
                bestDr = dr2;
              }
            }
          }
          if (best === INF) continue;
          const at = idx(i, r, back, dr);
          cost[at] = best + back * MISS + u;
          prevBack[at] = bestBack;
          prevDr[at] = bestDr;
        }
      }
    }
  }

  // The last line with a row, and the rows and lines left under it.
  let end: { cost: number; i: number; r: number; back: number; dr: number } = { cost: INF, i: -1, r: -1, back: -1, dr: -1 };
  for (let i = Math.max(0, n - 1 - MAX_MISSES); i < n; i++) {
    for (let r = 0; r < k; r++) {
      const tail = (n - 1 - i) * MISS + (k - 1 - r) * SKIP_TRAIL;
      if (start[i]![r]! + tail < end.cost) end = { cost: start[i]![r]! + tail, i, r, back: -1, dr: -1 };
      for (let back = 0; back < B; back++) {
        for (let dr = 0; dr < D; dr++) {
          const c = cost[idx(i, r, back, dr)]! + tail;
          if (c < end.cost) end = { cost: c, i, r, back, dr };
        }
      }
    }
  }
  const rowOf: Array<number | null> = new Array(n).fill(null);
  if (end.i < 0) return { cost: n * MISS, rowOf };
  let { i, r, back, dr } = end;
  for (;;) {
    rowOf[i] = r;
    if (back < 0) break;
    const at = idx(i, r, back, dr);
    const nb = prevBack[at]!;
    const nd = prevDr[at]!;
    i = i - 1 - back;
    r = r - dr;
    back = nb;
    dr = nd;
  }
  return { cost: end.cost, rowOf };
}

// --- 4. snapping --------------------------------------------------------------------------------

/** At least this share of the lines with a box must find a row, or nothing is changed. */
export const MIN_MATCHED = 0.6;

export function snapLines(img: Gray, lines: LineIn[], trace?: (message: string) => void): SnapResult {
  const unchanged = (reason: string, rows: InkRow[] = [], pitch = 0): SnapResult => ({
    boxes: lines.map((l) => l.box),
    applied: false,
    reason,
    matched: 0,
    rowOf: lines.map(() => null),
    rows,
    pitch,
    strokes: [],
  });
  const boxed = lines.map((l, i) => ({ l, i })).filter((x) => x.l.box != null);
  if (boxed.length < 3) return unchanged("fewer than 3 lines with a box");
  const { width: w, height: h } = img;
  if (w < 50 || h < 50) return unchanged("picture too small");

  const heights = boxed.map(({ l }) => Math.abs(l.box!.y_max - l.box!.y_min)).sort((a, b) => a - b);
  const guessGrid = clampNum(heights[Math.floor(heights.length / 2)]!, 12, 120);
  const raw: RawStroke[] = [];
  const mask = inkMask(img, raw);
  removeStrokes(mask, w, h, (guessGrid / 1000) * h, raw);
  const pitchPx = estimatePitch(rowProfile(mask, w, h), (guessGrid / 1000) * h);
  const pitch = (pitchPx / h) * 1000;
  const rows = findRows(mask, w, h, pitchPx);
  if (rows.length < Math.ceil(boxed.length * MIN_MATCHED)) return unchanged("too few rows of writing found", rows, pitch);

  // Lines in reading order down the page (the model's order, by its centres).
  const order = [...boxed].sort((p, q) => center(p.l.box!) - center(q.l.box!) || p.i - q.i);
  const base = order.map(({ l }) => ({
    center: center(l.box!),
    x0: Math.min(l.box!.x_min, l.box!.x_max),
    x1: Math.max(l.box!.x_min, l.box!.x_max),
    block: l.block,
    opensTitledBlock: l.opensTitledBlock,
  }));
  const { rowOf, cost } = matchLines(base, rows, pitch);
  const driftOf = (j: number) => rows[rowOf[j]!]!.center - base[j]!.center;
  if (trace) {
    trace(`pitch ${pitch.toFixed(1)}; rows ` + rows.map((r, k) => `${k}:${r.center.toFixed(0)}[${r.x0.toFixed(0)}-${r.x1.toFixed(0)}]`).join(" "));
    trace(`cost ${cost.toFixed(2)}  ` + base.map((t, j) => `${order[j]!.i}:${t.center.toFixed(0)}→${rowOf[j] == null ? "-" : `${rowOf[j]}(${driftOf(j).toFixed(0)})`}`).join(" "));
  }
  const matched = rowOf.filter((r) => r != null).length;
  if (matched < Math.ceil(order.length * MIN_MATCHED)) return { ...unchanged("too few lines found a row of writing", rows, pitch), matched };

  // A line that found no row moves with its neighbours: the mean drift of the nearest matched above and below.
  const driftNear = (j: number) => {
    const near: number[] = [];
    for (let q = j - 1; q >= 0; q--) {
      if (rowOf[q] != null) {
        near.push(driftOf(q));
        break;
      }
    }
    for (let q = j + 1; q < base.length; q++) {
      if (rowOf[q] != null) {
        near.push(driftOf(q));
        break;
      }
    }
    return near.length ? near.reduce((s, v) => s + v, 0) / near.length : 0;
  };

  // Rows nobody took, for "= ১৯৫" written under its line.
  const taken = new Set(rowOf.filter((r): r is number => r != null));
  const boxes: Array<Box | null> = lines.map((l) => l.box);
  const rowOfLine: Array<number | null> = lines.map(() => null);
  order.forEach(({ l, i }, j) => {
    const box = l.box!;
    const r = rowOf[j];
    if (r == null) {
      const shift = driftNear(j);
      boxes[i] = { ...box, y_min: clampGrid(box.y_min + shift), y_max: clampGrid(box.y_max + shift) };
      return;
    }
    rowOfLine[i] = r;
    const row = rows[r]!;
    let bottom = row.bottom;
    const below = rows[r + 1];
    const nextOnBelow = rowOf[j + 1] === r + 1;
    if (below && !taken.has(r + 1) && !nextOnBelow && below.center - row.center <= pitch * 1.3 && below.x0 > row.x0 + 0.35 * (row.x1 - row.x0)) {
      bottom = below.bottom;
      taken.add(r + 1);
    }
    const shared = rowOf.filter((x) => x === r).length > 1;
    boxes[i] = {
      x_min: shared ? box.x_min : clampGrid(Math.min(box.x_min, row.x0)),
      x_max: shared ? box.x_max : clampGrid(Math.max(box.x_max, row.x1)),
      y_min: clampGrid(row.top),
      y_max: clampGrid(bottom),
    };
  });
  return { boxes, applied: true, reason: null, matched, rowOf: rowOfLine, rows, pitch, strokes: strokesOf(raw, w, h, pitchPx) };
}

// --- helpers ------------------------------------------------------------------------------------

function center(b: Box) {
  return (b.y_min + b.y_max) / 2;
}
function clampNum(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function clampGrid(v: number) {
  return Math.round(clampNum(v, 0, 1000));
}

function maxFilter(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const a = Math.max(0, x - r);
      const b = Math.min(w - 1, x + r);
      for (let k = a; k <= b; k++) if (src[row + k]! > m) m = src[row + k]!;
      tmp[row + x] = m;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      const a = Math.max(0, y - r);
      const b = Math.min(h - 1, y + r);
      for (let k = a; k <= b; k++) if (tmp[k * w + x]! > m) m = tmp[k * w + x]!;
      out[y * w + x] = m;
    }
  }
  return out;
}

function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) s += src[row + clampNum(x, 0, w - 1)]!;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / (2 * r + 1);
      s += src[row + Math.min(w - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clampNum(y, 0, h - 1) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(s / (2 * r + 1));
      s += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

function gaussian(src: Float64Array, sigma: number): Float64Array {
  const r = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((s, v) => s + v, 0);
  const out = new Float64Array(src.length);
  for (let y = 0; y < src.length; y++) {
    let s = 0;
    for (let i = -r; i <= r; i++) {
      const k = y + i;
      if (k >= 0 && k < src.length) s += src[k]! * kernel[i + r]!;
    }
    out[y] = s / sum;
  }
  return out;
}

function argmin(a: Float64Array, lo: number, hi: number): number {
  let best = lo;
  for (let i = lo; i <= hi; i++) if (a[i]! < a[best]!) best = i;
  return best;
}

function percentile(a: Uint8Array, q: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < a.length; i++) hist[a[i]!]!++;
  const target = q * a.length;
  let n = 0;
  for (let v = 0; v < 256; v++) {
    n += hist[v]!;
    if (n >= target) return v;
  }
  return 255;
}

function quantileIndex(counts: Float64Array, total: number, q: number): number {
  const target = q * total;
  let n = 0;
  for (let i = 0; i < counts.length; i++) {
    n += counts[i]!;
    if (n >= target) return i;
  }
  return counts.length - 1;
}
