import { describe, expect, test } from "bun:test";
import { FAR_FRACTION, detectPage } from "./detect";
import { type Quad, applyHomography, homography } from "./geometry";
import { findKhataCorners } from "./markers";
import { DARK, type Rgb, TILTED, WOOD, cornerError, khataSheet, newspaper, paper, render } from "./scan-fixture.test-util";
import { warpPage } from "./warp";

const W = 360;
const H = 640;

describe("detectPage", () => {
  test("a written page on a wooden table", () => {
    const px = render({ width: W, height: H, quad: TILTED, background: WOOD, page: paper({ strokes: true }), noise: 6 });
    const d = detectPage(px);
    expect(d.status).toBe("found");
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(1);
    expect(d.fraction).toBeGreaterThan(FAR_FRACTION);
  });

  test("on a dark counter", () => {
    const d = detectPage(render({ width: W, height: H, quad: TILTED, background: DARK, page: paper(), noise: 4 }));
    expect(d.status).toBe("found");
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(1);
  });

  test("on a newspaper", () => {
    const d = detectPage(render({ width: W, height: H, quad: TILTED, background: newspaper(), page: paper({ strokes: true }), noise: 4 }));
    expect(d.status).toBe("found");
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(3);
  });

  test("cream paper under warm light", () => {
    const warm = (x: number, y: number) => {
      const [r, g, b] = WOOD(x, y);
      return [r * 0.8, g * 0.7, b * 0.5] as const;
    };
    const d = detectPage(render({ width: W, height: H, quad: TILTED, background: warm, page: paper({ tone: [235, 205, 160] }), noise: 5 }));
    expect(d.status).toBe("found");
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(1);
  });

  test("glare on the table beside the page isn't the page", () => {
    const glare = (x: number, y: number) => (Math.hypot(x - 340, y - 40) < 30 ? ([255, 255, 255] as const) : null);
    const d = detectPage(render({ width: W, height: H, quad: TILTED, background: WOOD, page: paper(), over: glare, noise: 4 }));
    expect(d.status).toBe("found");
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(1);
  });

  test("a thumb over a corner: the corner still lands where the sides meet", () => {
    const [, , br] = TILTED;
    const thumb = (x: number, y: number) => (Math.hypot(x - (br[0] + 10), y - (br[1] + 6)) < 38 ? ([196, 140, 110] as const) : null);
    const d = detectPage(render({ width: W, height: H, quad: TILTED, background: WOOD, page: paper(), over: thumb, noise: 4 }));
    expect(d.status).toBe("found");
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(1.5);
  });

  test("a page small in the frame is too far", () => {
    const small: Quad = [
      [130, 220],
      [236, 214],
      [244, 380],
      [124, 384],
    ];
    const d = detectPage(render({ width: W, height: H, quad: small, background: WOOD, page: paper(), noise: 4 }));
    expect(d.status).toBe("far");
    expect(cornerError(d.quad!, small)).toBeLessThan(2);
  });

  test("a page running off the frame is cut", () => {
    const off: Quad = [
      [-30, 80],
      [300, 70],
      [320, 560],
      [-20, 570],
    ];
    expect(detectPage(render({ width: W, height: H, quad: off, background: WOOD, page: paper(), noise: 4 })).status).toBe("cut");
  });

  // F2 fix 7: his pages lie on things as bright as paper, so the page and its neighbour are one
  // bright region. These scenes are drawn after his photos of 2 and 4 Nov.
  const laptop = (x: number, y: number): Rgb => (x > 14 && x < 346 && y > 40 && y < 380 ? [178, 178, 184] : DARK());

  test("a page lying on a silver laptop", () => {
    const d = detectPage(render({ width: W, height: H, quad: TILTED, background: laptop, page: paper({ strokes: true }), noise: 4 }));
    expect(d.status).toBe("found");
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(1.5);
  });

  test("a narrow page across yellow files, on white sheets that run off the frame", () => {
    const narrow: Quad = [
      [118, 150],
      [242, 146],
      [252, 520],
      [112, 526],
    ];
    const desk = (x: number, y: number): Rgb => {
      if (x > 70 && x < 300 && y > 190 && y < 500) return [206, 178, 120]; // pale files under a warm lamp
      if (x < 170 && y > 130 && y < 580 && y > 250 - 0.8 * x) return [205, 205, 200]; // white sheets, off the left edge
      return DARK();
    };
    const d = detectPage(render({ width: W, height: H, quad: narrow, background: desk, page: paper({ strokes: true }), noise: 4 }));
    expect(d.status).toBe("far"); // a narrow page this far off fills a fifth of the frame
    expect(cornerError(d.quad!, narrow)).toBeLessThan(1.5);
  });

  test("a binding tape down one side: the side stays on one edge", () => {
    const taped = (u: number, v: number): Rgb => (u < 0.05 ? [214, 226, 214] : paper({ strokes: true })(u, v));
    const d = detectPage(render({ width: W, height: H, quad: TILTED, background: laptop, page: taped, noise: 4 }));
    expect(d.status).toBe("found");
    // The whole sheet, tape and all; above all both left corners on the same edge.
    expect(cornerError(d.quad!, TILTED)).toBeLessThan(1.5);
  });

  test("no page", () => {
    const d = detectPage(render({ width: W, height: H, quad: [[0, 0], [1, 0], [1, 1], [0, 1]], background: WOOD, page: paper(), noise: 6 }));
    expect(d.status).toBe("none");
    expect(d.quad).toBeNull();
  });
});

describe("Scriba khata lock", () => {
  // A khata page photographed at a tilt, at the size of a still downscaled for detection.
  const SHEET: Quad = [
    [0, 0],
    [148, 0],
    [148, 210],
    [0, 210],
  ];
  const big: Quad = TILTED.map(([x, y]) => [x * 2, y * 2]) as unknown as Quad;

  test("the four squares fix the sheet's corners", () => {
    const px = render({ width: W * 2, height: H * 2, quad: big, background: WOOD, page: khataSheet(), noise: 4 });
    const d = detectPage(px);
    expect(d.status).toBe("found");
    const corners = findKhataCorners(px, d.quad!)!;
    expect(corners).not.toBeNull();
    expect(cornerError(corners, big)).toBeLessThan(1);
  });

  test("a rough outline still finds them", () => {
    const px = render({ width: W * 2, height: H * 2, quad: big, background: WOOD, page: khataSheet(), noise: 4 });
    const off = big.map(([x, y], i) => [x + (i % 2 ? 9 : -7), y + (i < 2 ? 8 : -6)]) as unknown as Quad;
    expect(cornerError(findKhataCorners(px, off)!, big)).toBeLessThan(1);
  });

  test("with a square missing it isn't a lock", () => {
    const px = render({ width: W * 2, height: H * 2, quad: big, background: WOOD, page: khataSheet([2]), noise: 4 });
    expect(findKhataCorners(px, detectPage(px).quad!)).toBeNull();
  });

  test("a plain page has no squares", () => {
    const px = render({ width: W * 2, height: H * 2, quad: big, background: WOOD, page: paper({ strokes: true }), noise: 4 });
    expect(findKhataCorners(px, detectPage(px).quad!)).toBeNull();
  });

  test("the flattened page puts each square back at its printed place", () => {
    const px = render({ width: W * 2, height: H * 2, quad: big, background: WOOD, page: khataSheet() });
    const w = 296;
    const h = 420; // 2 px per mm
    const flat = warpPage(px, big, w, h);
    const lum = (x: number, y: number) => flat[(y * w + x) * 4]!;
    const toPx = homography(SHEET, [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ])!;
    for (const [mx, my] of [
      [6, 6],
      [140, 6],
      [140, 204],
      [6, 204],
    ] as const) {
      const [x, y] = applyHomography(toPx, [mx, my]).map(Math.floor) as [number, number];
      expect(lum(x, y)).toBeLessThan(90); // the square's ring
    }
    expect(lum(28, 28)).toBeGreaterThan(200); // paper beside it (14 mm in)
    expect(lum(16, 16)).toBeGreaterThan(200); // the square's hole (8 mm in)
  });
});
