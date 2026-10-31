import { describe, expect, test } from "bun:test";
import { businessDateFor, dhakaDate, parseWrittenDate } from "./dates";

// 31 Oct 2026, 10:00 in Dhaka.
const CAPTURED = new Date("2026-10-31T04:00:00Z");

describe("parseWrittenDate", () => {
  test.each([
    ["৩১/১০/২৬", "2026-10-31"],
    ["৩১-১০-২০২৬", "2026-10-31"],
    ["31/১০/26", "2026-10-31"],
    ["৩০.১০", "2026-10-30"],
    ["৩১ অক্টো", "2026-10-31"],
    ["অক্টোবর ২৯", "2026-10-29"],
    ["31 Oct 2026", "2026-10-31"],
    ["তারিখ: ২৮/১০/২০২৬ ইং", "2026-10-28"],
    ["২৯শে অক্টোবর", "2026-10-29"],
    ["১লা নভেম্বর", "2026-11-01"],
  ])("%s → %s", (text, iso) => {
    expect(parseWrittenDate(text, CAPTURED)).toBe(iso);
  });

  test("a missing year is the latest one that isn't in the future", () => {
    expect(parseWrittenDate("৩১ ডিসেম্বর", CAPTURED)).toBe("2025-12-31");
    expect(parseWrittenDate("২/১১", CAPTURED)).toBe("2026-11-02");
  });

  test("Bangla calendar dates use Bangladesh's revised calendar", () => {
    expect(parseWrittenDate("১৪ কার্তিক", CAPTURED)).toBe("2026-10-30");
    expect(parseWrittenDate("১৪ কার্তিক ১৪৩৩", CAPTURED)).toBe("2026-10-30");
    expect(parseWrittenDate("১লা বৈশাখ ১৪৩৩", CAPTURED)).toBe("2026-04-14");
    // Before Pohela Boishakh the current Bangla year is the previous one.
    expect(parseWrittenDate("১৪ কার্তিক", new Date("2026-04-01T06:00:00Z"))).toBe("2025-10-30");
  });

  test("Falgun has 30 days only when February has 29", () => {
    const march2024 = new Date("2024-03-20T06:00:00Z");
    expect(parseWrittenDate("৩০ ফাল্গুন ১৪৩০", march2024)).toBe("2024-03-14");
    expect(parseWrittenDate("৩০ ফাল্গুন ১৪৩১", new Date("2025-03-20T06:00:00Z"))).toBeNull();
  });

  test("anything unparsable or implausible stays text only", () => {
    for (const text of [null, "", "কাল", "৩১/১৩/২৬", "৪৫/১০", "৩১/০২/২০২৬", "৩১/১০/২০১৯", "১৫/১১/২৬", "১৪ কার্তিক ৩৩"]) {
      expect(parseWrittenDate(text, CAPTURED)).toBeNull();
    }
  });
});

describe("businessDateFor", () => {
  test("uses the written date when it parses", () => {
    expect(businessDateFor("৩০/১০/২৬", CAPTURED)).toEqual({ iso: "2026-10-30", source: "written" });
  });

  test("falls back to the capture day in Bangladesh time", () => {
    // 20:00 UTC is 02:00 the next morning in Dhaka.
    expect(businessDateFor(null, new Date("2026-10-31T20:00:00Z"))).toEqual({ iso: "2026-11-01", source: "capture" });
    expect(businessDateFor("কাল", CAPTURED)).toEqual({ iso: "2026-10-31", source: "capture" });
    expect(dhakaDate(new Date("2026-10-31T17:59:00Z"))).toBe("2026-10-31");
  });
});
