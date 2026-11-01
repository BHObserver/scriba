import { describe, expect, test } from "bun:test";
import { STILL_MAX_PIXELS, fitPixels, keepsAsTaken, sameOrientation } from "./still-photo";

describe("sameOrientation", () => {
  test("a 3:4 still matches a 9:16 preview held the same way", () => {
    expect(sameOrientation({ width: 3000, height: 4000 }, { width: 2160, height: 3840 })).toBe(true);
    expect(sameOrientation({ width: 4000, height: 3000 }, { width: 3840, height: 2160 })).toBe(true);
  });

  test("a still turned against the preview is not used", () => {
    expect(sameOrientation({ width: 4000, height: 3000 }, { width: 2160, height: 3840 })).toBe(false);
    expect(sameOrientation({ width: 3000, height: 4000 }, { width: 3840, height: 2160 })).toBe(false);
  });

  test("a square on either side fits", () => {
    expect(sameOrientation({ width: 3000, height: 3000 }, { width: 2160, height: 3840 })).toBe(true);
    expect(sameOrientation({ width: 4000, height: 3000 }, { width: 1080, height: 1080 })).toBe(true);
  });
});

describe("fitPixels", () => {
  test("a still within the limit keeps its size", () => {
    expect(fitPixels({ width: 3000, height: 4000 }, STILL_MAX_PIXELS)).toEqual({ width: 3000, height: 4000 });
  });

  test("a 50 MP still is scaled down to the limit, same shape", () => {
    const out = fitPixels({ width: 6120, height: 8160 }, STILL_MAX_PIXELS);
    expect(out.width * out.height).toBeLessThanOrEqual(STILL_MAX_PIXELS);
    expect(out.width * out.height).toBeGreaterThan(STILL_MAX_PIXELS * 0.99);
    expect(out.height / out.width).toBeCloseTo(8160 / 6120, 2);
  });

  test("never scales up", () => {
    expect(fitPixels({ width: 640, height: 480 }, STILL_MAX_PIXELS)).toEqual({ width: 640, height: 480 });
  });
});

describe("keepsAsTaken", () => {
  const size = { width: 3000, height: 4000 };
  const MB = 1024 * 1024;

  test("the camera's JPEG is kept when it fits", () => {
    expect(keepsAsTaken({ type: "image/jpeg", bytes: 4 * MB, size }, 8 * MB)).toBe(true);
  });

  test("too many bytes, too many pixels or not a JPEG is re-encoded", () => {
    expect(keepsAsTaken({ type: "image/jpeg", bytes: 9 * MB, size }, 8 * MB)).toBe(false);
    expect(keepsAsTaken({ type: "image/jpeg", bytes: 4 * MB, size: { width: 6120, height: 8160 } }, 8 * MB)).toBe(false);
    expect(keepsAsTaken({ type: "image/png", bytes: 4 * MB, size }, 8 * MB)).toBe(false);
  });
});
