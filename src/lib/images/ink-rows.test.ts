import { describe, expect, test } from "bun:test";
import { type Box, type Gray, type LineIn, findRows, inkMask, removeStrokes, snapLines } from "./ink-rows";

/*
 * A drawn khata page: paper, faint ruled lines, and words like his: a headline with strokes
 * hanging under it. Sizes are like his 4 Nov pages at the snapper's width: 600 px wide, a line
 * every 45 px.
 */
const W = 600;
const H = 1500;
const PITCH = 45;

function page(): Gray & { word: (x0: number, x1: number, y: number) => void; stroke: (x0: number, x1: number, y0: number, y1: number) => void } {
  const data = new Uint8Array(W * H).fill(232);
  for (let y = 20; y < H; y += PITCH) for (let x = 0; x < W; x++) data[y * W + x] = 212; // ruled lines
  const dot = (x: number, y: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) data[y * W + x] = 40;
  };
  return {
    data,
    width: W,
    height: H,
    /**
     * A written word about 0.6 of a line tall like his: a headline at y - 12, letters hanging to
     * y + 6, and every third one further, to y + 14 (like ু and ্র).
     */
    word(x0, x1, y) {
      for (let x = x0; x < x1; x++) for (let t = 0; t < 3; t++) dot(x, y - 12 + t);
      for (let x = x0 + 2, n = 0; x < x1; x += 8, n++) for (let yy = y - 10; yy <= (n % 3 === 2 ? y + 14 : y + 6); yy++) for (let t = 0; t < 3; t++) dot(x + t, yy);
    },
    /** A pen stroke 3 px thick from (x0, y0) to (x1, y1): an underline. */
    stroke(x0, x1, y0, y1) {
      for (let x = x0; x <= x1; x++) {
        const y = Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
        for (let t = 0; t < 3; t++) dot(x, y + t);
      }
    },
  };
}

/** A line written at pixel row y: a few words from x0 and an amount at the right. */
function writeLine(p: ReturnType<typeof page>, y: number, x0 = 60, words = 3) {
  for (let i = 0; i < words; i++) p.word(x0 + i * 110, x0 + i * 110 + 80, y);
  p.word(430, 500, y);
}

const grid = (px: number) => (px / H) * 1000;
const mid = (b: Box | null) => (b ? (b.y_min + b.y_max) / 2 : NaN);

describe("ink rows (F2 fix 6)", () => {
  test("a slanted underline is taken out, written words are kept", () => {
    const p = page();
    p.word(60, 200, 300);
    p.stroke(60, 220, 340, 346);
    const m = inkMask(p);
    expect(removeStrokes(m, W, H, PITCH)).toBeGreaterThan(0);
    const rows = findRows(m, W, H, PITCH);
    expect(rows).toHaveLength(1);
    expect(Math.abs(rows[0]!.center - grid(300))).toBeLessThan(grid(8));
  });

  test("two lines written close with a note beside both stay two rows", () => {
    const p = page();
    writeLine(p, 200);
    // P3's "দুধ ২ কার্টুন / আটা ১ বস্তা } হিসাব পরে": two short lines 0.8 of a line apart…
    p.word(30, 110, 500);
    p.word(130, 230, 500);
    p.word(30, 110, 536);
    p.word(130, 230, 536);
    // …and the note on the right, between them, so across the page there is no gap.
    p.word(330, 420, 518);
    p.word(440, 520, 518);
    writeLine(p, 700);
    const m = inkMask(p);
    removeStrokes(m, W, H, PITCH);
    const centers = findRows(m, W, H, PITCH).map((r) => r.center);
    expect(centers.filter((c) => c > grid(470) && c < grid(570))).toHaveLength(2);
  });

  test("a reading stretched like his page 2 goes back on its rows; the date, a heading and the underlines are left alone", () => {
    const p = page();
    p.word(80, 300, 80); // the date
    const block1 = [150, 195, 240];
    for (const y of block1) writeLine(p, y);
    p.stroke(60, 200, 265, 270);
    p.word(80, 260, 330); // "প্রাণের সেলিম:"
    const block2 = [375, 420, 465, 510, 555];
    for (const y of block2) writeLine(p, y);
    p.stroke(60, 200, 580, 586);
    const block3 = [650, 695, 740, 785, 830, 875, 920, 965, 1010];
    for (const y of block3) writeLine(p, y);

    // The model's boxes: every gap a fifth too long, so the lines run further and further low.
    const truth = [...block1, ...block2, ...block3];
    const lines: LineIn[] = truth.map((y, i) => {
      const at = grid(y) * 1.2;
      return { box: { x_min: 100, x_max: 840, y_min: at - 12, y_max: at + 12 }, block: i < 3 ? "b1" : i < 8 ? "b2" : "b3", opensTitledBlock: i === 3 };
    });
    const before = lines.map((l, i) => Math.abs(mid(l.box) - grid(truth[i]!)));
    expect(Math.max(...before)).toBeGreaterThan(grid(PITCH * 3)); // more than three lines off by the bottom

    const snap = snapLines(p, lines);
    expect(snap.applied).toBe(true);
    expect(snap.matched).toBe(truth.length);
    snap.boxes.forEach((b, i) => expect(Math.abs(mid(b) - grid(truth[i]!))).toBeLessThan(grid(PITCH / 2)));
    // The x reach takes in the written line.
    expect(snap.boxes[0]!.x_min).toBeLessThanOrEqual(100);
  });

  test("a bulge like his page 1 (a line low in the middle, right at the ends) goes back too", () => {
    const p = page();
    p.word(80, 300, 80);
    const truth = Array.from({ length: 24 }, (_, i) => 150 + i * PITCH);
    truth.forEach((y) => writeLine(p, y));
    const lines: LineIn[] = truth.map((y) => {
      const at = grid(y) + grid(PITCH) * Math.sin((Math.PI * y) / H);
      return { box: { x_min: 100, x_max: 840, y_min: at - 12, y_max: at + 12 }, block: "b1", opensTitledBlock: false };
    });
    const snap = snapLines(p, lines);
    expect(snap.applied).toBe(true);
    snap.boxes.forEach((b, i) => expect(Math.abs(mid(b) - grid(truth[i]!))).toBeLessThan(grid(PITCH / 2)));
  });

  test("nothing is changed when the photo has no rows of writing, or there are too few lines", () => {
    const blank = page();
    const lines: LineIn[] = [100, 200, 300].map((y) => ({ box: { x_min: 100, x_max: 800, y_min: y, y_max: y + 25 }, block: null, opensTitledBlock: false }));
    const snap = snapLines(blank, lines);
    expect(snap.applied).toBe(false);
    expect(snap.boxes).toEqual(lines.map((l) => l.box));
    expect(snapLines(blank, lines.slice(0, 2)).reason).toBe("fewer than 3 lines with a box");
  });

  test("a line without a box keeps none, the others are still snapped", () => {
    const p = page();
    const truth = [150, 195, 240, 285];
    truth.forEach((y) => writeLine(p, y));
    const lines: LineIn[] = truth.map((y, i) => ({
      box: i === 1 ? null : { x_min: 100, x_max: 840, y_min: grid(y) + 10, y_max: grid(y) + 34 },
      block: "b1",
      opensTitledBlock: false,
    }));
    const snap = snapLines(p, lines);
    expect(snap.applied).toBe(true);
    expect(snap.boxes[1]).toBeNull();
    for (const i of [0, 2, 3]) expect(Math.abs(mid(snap.boxes[i]!) - grid(truth[i]!))).toBeLessThan(grid(PITCH / 2));
  });
});
