import { describe, expect, test } from "bun:test";
import { stripVars } from "./strip-geometry";

const vars = (s: object) => s as Record<string, number>;

describe("stripVars", () => {
  test("box fractions and aspect", () => {
    const v = vars(stripVars({ x_min: 100, y_min: 250, x_max: 900, y_max: 300 }, 3000, 4000));
    expect(v["--bx"]).toBe(0.1);
    expect(v["--by"]).toBe(0.25);
    expect(v["--bw"]).toBe(0.8);
    expect(v["--bh"]).toBe(0.05);
    expect(v["--ar"]).toBe(0.75);
  });

  test("swapped and out-of-range coordinates are ordered and clamped", () => {
    const v = vars(stripVars({ x_min: 1200, y_min: 300, x_max: -5, y_max: 250 }, 1000, 1000));
    expect([v["--bx"], v["--bw"], v["--by"], v["--bh"]]).toEqual([0, 1, 0.25, 0.05]);
  });

  test("a zero-height box gets a minimum span instead of dividing by zero", () => {
    const v = vars(stripVars({ x_min: 0, y_min: 1000, x_max: 1000, y_max: 1000 }, 1000, 1000));
    expect(v["--bh"]).toBeGreaterThan(0);
    expect(v["--by"]! + v["--bh"]!).toBeLessThanOrEqual(1);
  });

  test("unknown photo size falls back to a portrait page", () => {
    expect(vars(stripVars({ x_min: 0, y_min: 0, x_max: 10, y_max: 10 }, 0, 0))["--ar"]).toBe(0.75);
  });
});
