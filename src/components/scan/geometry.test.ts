import { describe, expect, test } from "bun:test";
import {
  type Point,
  type Quad,
  applyHomography,
  capPixels,
  convexHull,
  cornerAngles,
  flatSize,
  homography,
  isConvexQuad,
  isFullFrame,
  largestInscribedQuad,
  orderCorners,
  polygonArea,
  refineQuad,
} from "./geometry";
import { TILTED, cornerError, rng } from "./scan-fixture.test-util";

const UNIT: Quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

describe("orderCorners", () => {
  test("any order comes back as top-left, top-right, bottom-right, bottom-left", () => {
    const shuffled: Point[] = [TILTED[2], TILTED[0], TILTED[3], TILTED[1]];
    expect(orderCorners(shuffled)).toEqual(TILTED);
  });

  test("a page turned a little either way keeps its top-left first", () => {
    const left: Point[] = [
      [100, 40],
      [300, 80],
      [260, 400],
      [60, 360],
    ];
    expect(orderCorners([...left].reverse())).toEqual(left as unknown as Quad);
  });
});

describe("homography", () => {
  test("maps each corner exactly, and the square's centre to where the diagonals cross", () => {
    const h = homography(UNIT, TILTED)!;
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(h, UNIT[i]!);
      expect(p[0]).toBeCloseTo(TILTED[i]![0], 6);
      expect(p[1]).toBeCloseTo(TILTED[i]![1], 6);
    }
    // Diagonals TL–BR and TR–BL meet at the image of (0.5, 0.5).
    const [a, b, c, d] = TILTED;
    const t =
      ((c[0] - a[0]) * (d[1] - b[1]) - (c[1] - a[1]) * (d[0] - b[0])) === 0
        ? 0
        : ((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0])) / ((c[0] - a[0]) * (d[1] - b[1]) - (c[1] - a[1]) * (d[0] - b[0]));
    const cross = [a[0] + t * (c[0] - a[0]), a[1] + t * (c[1] - a[1])];
    const centre = applyHomography(h, [0.5, 0.5]);
    expect(centre[0]).toBeCloseTo(cross[0]!, 6);
    expect(centre[1]).toBeCloseTo(cross[1]!, 6);
  });

  test("three corners on one line is no homography", () => {
    expect(
      homography(UNIT, [
        [0, 0],
        [1, 1],
        [2, 2],
        [0, 5],
      ]),
    ).toBeNull();
  });
});

describe("shape checks", () => {
  test("a bow-tie isn't a page", () => {
    expect(isConvexQuad(TILTED)).toBe(true);
    expect(isConvexQuad([TILTED[0], TILTED[2], TILTED[1], TILTED[3]])).toBe(false);
  });

  test("a rectangle has four right angles", () => {
    for (const a of cornerAngles([[0, 0], [4, 0], [4, 3], [0, 3]])) expect(a).toBeCloseTo(90, 6);
  });
});

describe("hull and quad", () => {
  test("the largest quad inside a page's outline is the page", () => {
    // Points along the edges of TILTED (as the detector's outline cells are), plus some inside.
    const r = rng(3);
    const pts: Point[] = [];
    for (let i = 0; i < 4; i++) {
      const p = TILTED[i]!;
      const q = TILTED[(i + 1) % 4]!;
      for (let k = 0; k < 40; k++) pts.push([p[0] + ((q[0] - p[0]) * k) / 40, p[1] + ((q[1] - p[1]) * k) / 40]);
    }
    for (let k = 0; k < 200; k++) pts.push([100 + r() * 150, 200 + r() * 250]);
    const hull = convexHull(pts);
    expect(polygonArea(hull)).toBeCloseTo(polygonArea(TILTED), 3);
    expect(cornerError(largestInscribedQuad(hull)!, TILTED)).toBeLessThan(0.001);
  });

  test("a corner hidden under a thumb comes back where the sides meet", () => {
    // The outline lost its bottom-right corner: the hull cuts it off.
    const [tl, tr, br, bl] = TILTED;
    const cutA: Point = [tr[0] + (br[0] - tr[0]) * 0.85, tr[1] + (br[1] - tr[1]) * 0.85];
    const cutB: Point = [bl[0] + (br[0] - bl[0]) * 0.85, bl[1] + (br[1] - bl[1]) * 0.85];
    const outline: Point[] = [tl, tr, cutA, cutB, bl];
    const rough = largestInscribedQuad(convexHull(outline))!;
    expect(cornerError(rough, TILTED)).toBeGreaterThan(10);
    const sides: Point[][] = [];
    for (let i = 0; i < 4; i++) {
      const p = TILTED[i]!;
      const q = TILTED[(i + 1) % 4]!;
      const side: Point[] = [];
      for (let k = 1; k < 60; k++) {
        const t = k / 60;
        // The hidden part of the two sides near the corner isn't seen.
        if ((i === 1 && t > 0.85) || (i === 2 && t < 0.15)) continue;
        side.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
      sides.push(side);
    }
    // A few points on the thumb's outline don't tilt the side.
    sides[1]!.push([330, 520], [334, 530], [336, 541]);
    expect(cornerError(refineQuad(rough, sides), TILTED)).toBeLessThan(0.5);
  });
});

describe("sizes", () => {
  test("the flat page is as long as its longer edges", () => {
    expect(flatSize(TILTED)).toEqual({ width: Math.round(Math.hypot(282, 12)), height: Math.round(Math.hypot(22, 464)) });
  });

  test("a known paper shape keeps the longer measured side", () => {
    const { width, height } = flatSize(TILTED, 148 / 210);
    expect(height).toBe(Math.round(Math.hypot(22, 464)));
    expect(width).toBe(Math.round(Math.hypot(22, 464) * (148 / 210)));
  });

  test("pixels are capped, never raised", () => {
    expect(capPixels({ width: 4000, height: 6000 }, 12_000_000)).toEqual({ width: 2828, height: 4242 });
    expect(capPixels({ width: 300, height: 400 }, 12_000_000)).toEqual({ width: 300, height: 400 });
  });

  test("corners at the image's own corners mean nothing to crop", () => {
    expect(isFullFrame([[1, 0], [100, 1], [99, 200], [0, 199]], 100, 200, 2)).toBe(true);
    expect(isFullFrame(TILTED, 360, 640, 2)).toBe(false);
  });
});
