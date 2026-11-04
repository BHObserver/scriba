import { describe, expect, test } from "bun:test";
import { homeDayOf } from "./calendar";

describe("homeDayOf (F2 fix 10)", () => {
  test("today once it has a page or a line", () => {
    expect(homeDayOf(new Set(["2026-11-04", "2026-11-05"]), "2026-11-05")).toBe("2026-11-05");
  });
  test("yesterday's pages checked after midnight: the Today screen shows and closes yesterday", () => {
    expect(homeDayOf(new Set(["2026-11-04"]), "2026-11-05")).toBe("2026-11-04");
  });
  test("the latest of the last two days", () => {
    expect(homeDayOf(new Set(["2026-11-02", "2026-11-03"]), "2026-11-05")).toBe("2026-11-03");
  });
  test("older than two days: today, empty", () => {
    expect(homeDayOf(new Set(["2026-11-02"]), "2026-11-05")).toBe("2026-11-05");
    expect(homeDayOf(new Set(), "2026-11-05")).toBe("2026-11-05");
  });
});
