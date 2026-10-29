import { describe, expect, test } from "bun:test";
import {
  formatQuantity,
  formatTaka,
  multiplyQuantityByRate,
  normalizeDate,
  parseMoney,
  parseQuantity,
  parseRate,
  toAsciiDigits,
  toBanglaDigits,
} from "./numerals";

const value = (p: ReturnType<typeof parseMoney>) => (p.ok ? p.value : p.reason);

describe("digit conversion", () => {
  test("every Bangla digit maps to its ASCII digit", () => {
    expect(toAsciiDigits("০১২৩৪৫৬৭৮৯")).toBe("0123456789");
    expect(toBanglaDigits("0123456789")).toBe("০১২৩৪৫৬৭৮৯");
  });

  test("non-digit text is preserved", () => {
    expect(toAsciiDigits("চাল ৩ কেজি")).toBe("চাল 3 কেজি");
  });
});

describe("parseMoney", () => {
  test.each([
    ["১২০", 12000],
    ["120", 12000],
    ["১,০০০", 100000],
    ["1,000", 100000],
    ["১,০০,০০০", 10000000],
    ["1,000,000", 100000000],
    ["১২০.৫০", 12050],
    ["120.5", 12050],
    ["৳১২০", 12000],
    ["৳ 120", 12000],
    ["১৮০ টাকা", 18000],
    ["১৮০/-", 18000],
    ["১৮০=/-", 18000],
    ["= ১৮০", 18000],
    ["Tk 50", 5000],
    ["  ৯৭০  ", 97000],
  ])("%s -> %d poisha", (text, poisha) => {
    expect(value(parseMoney(text))).toBe(poisha);
  });

  test("mixed digits inside a single number parse but are marked mixed", () => {
    const p = parseMoney("১2০");
    expect(p.ok && p.value).toBe(12000);
    expect(p.ok && p.digitStyle).toBe("mixed");
  });

  test.each([
    [null, "empty"],
    ["", "empty"],
    ["টাকা", "empty"],
    ["বাকি", "no_digits"],
    ["১৮?", "ambiguous"],
    ["১৮০ বাকি", "ambiguous"],
    ["৩×৬০=১৮০", "multiple_numbers"],
    ["1 000", "multiple_numbers"],
    ["1,00", "malformed"],
    ["1,,000", "malformed"],
    [",100", "ambiguous"],
    ["12.345", "too_many_decimals"],
    ["-50", "negative"],
    ["99999999999999999", "too_large"],
  ] as const)("%s is rejected as %s", (text, reason) => {
    expect(value(parseMoney(text))).toBe(reason);
  });
});

describe("parseRate", () => {
  test.each([
    ["৬০", 6000],
    ["৬০/কেজি", 6000],
    ["60 per kg", 6000],
    ["৬০ টাকা কেজি", 6000],
    ["৳১৮০/লিটার", 18000],
  ])("%s -> %d", (text, poisha) => {
    expect(value(parseRate(text))).toBe(poisha);
  });
});

describe("parseQuantity", () => {
  test.each([
    ["২", 2000],
    ["১২", 12000],
    ["1.5", 1500],
    ["১.৫", 1500],
    ["২ কেজি", 2000],
    ["৫টা", 5000],
    ["১/২", 500],
    ["৩/৪ কেজি", 750],
  ])("%s -> %d thousandths", (text, milli) => {
    expect(value(parseQuantity(text))).toBe(milli);
  });

  test.each([
    ["", "empty"],
    ["দুই", "no_digits"],
    ["1/3", "too_many_decimals"],
    ["1/0", "malformed"],
    ["১.২৩৪৫", "too_many_decimals"],
  ] as const)("%s is rejected as %s", (text, reason) => {
    expect(value(parseQuantity(text))).toBe(reason);
  });
});

describe("integer arithmetic", () => {
  test("2 kg × ৳60 = ৳120 exactly", () => {
    expect(multiplyQuantityByRate(2000, 6000)).toEqual({ poisha: 12000, exact: true });
  });

  test("fractions of a poisha are rounded half-up and reported", () => {
    // 0.333 × ৳1.00 = 33.3 poisha
    expect(multiplyQuantityByRate(333, 100)).toEqual({ poisha: 33, exact: false });
    expect(multiplyQuantityByRate(1500, 8501)).toEqual({ poisha: 12752, exact: false });
  });

  test("no floating-point drift: 0.1 + 0.2 style sums stay exact", () => {
    const sum = [parseMoney("0.10"), parseMoney("0.20")].reduce((s, p) => s + (p.ok ? p.value : 0), 0);
    expect(sum).toBe(30);
  });
});

describe("formatting", () => {
  test("South Asian grouping", () => {
    expect(formatTaka(102000)).toBe("৳1,020");
    expect(formatTaka(10000000)).toBe("৳1,00,000");
    expect(formatTaka(12050)).toBe("৳120.50");
    expect(formatTaka(97000, { bangla: true })).toBe("৳৯৭০");
    expect(formatTaka(null)).toBe("—");
  });

  test("quantities", () => {
    expect(formatQuantity(2000)).toBe("2");
    expect(formatQuantity(1500)).toBe("1.5");
    expect(formatQuantity(125)).toBe("0.125");
  });
});

describe("normalizeDate", () => {
  test("unambiguous day/month/year", () => {
    expect(normalizeDate("২৯/১০/২০২৬")).toBe("2026-10-29");
    expect(normalizeDate("5-1-2026")).toBe("2026-01-05");
  });

  test("ambiguous or invalid dates stay null", () => {
    expect(normalizeDate("২৯/১০/২৬")).toBeNull();
    expect(normalizeDate("31/02/2026")).toBeNull();
    expect(normalizeDate("কার্তিক ১২")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });
});
