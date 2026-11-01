import { describe, expect, test } from "bun:test";
import { formatCount, formatDayMonth, formatMoney, formatMonthYear, formatWeekday, localDigits, makeI18n, translate } from "./format";
import { isLocale } from "./locale";
import { MESSAGES, type MessageKey } from "./messages";

describe("numbers follow the locale", () => {
  test("lakh grouping in both scripts", () => {
    expect(formatCount(123450, "bn")).toBe("১,২৩,৪৫০");
    expect(formatCount(123450, "en")).toBe("1,23,450");
    expect(formatCount(999, "bn")).toBe("৯৯৯");
    expect(formatCount(-4320, "en")).toBe("−4,320");
  });

  test("money is integer poisha with the taka sign first", () => {
    expect(formatMoney(432000, "bn")).toBe("৳৪,৩২০");
    expect(formatMoney(432000, "en")).toBe("৳4,320");
    expect(formatMoney(12345000, "en")).toBe("৳1,23,450");
    expect(formatMoney(null, "bn")).toBe("—");
  });

  test("only digits change", () => {
    expect(localDigits("পাতা 3", "bn")).toBe("পাতা ৩");
    expect(localDigits("পাতা 3", "en")).toBe("পাতা 3");
    expect(localDigits("৪০০ টাকা", "en")).toBe("400 টাকা");
  });
});

describe("dates", () => {
  test("day and month from a business date, without time zones", () => {
    expect(formatDayMonth("2026-11-01", "bn")).toBe("১ নভেম্বর");
    expect(formatDayMonth("2026-11-01", "en")).toBe("1 Nov");
    expect(formatMonthYear("2026-10-31", "bn")).toBe("অক্টোবর ২০২৬");
    expect(formatMonthYear("2026-10-31", "en")).toBe("Oct 2026");
    expect(formatDayMonth("2026-10-31T23:30:00Z", "en")).toBe("31 Oct");
    expect(formatDayMonth("not a date", "bn")).toBe("not a date");
  });

  test("weekday", () => {
    expect(formatWeekday("2026-11-01", "bn")).toBe("রবিবার");
    expect(formatWeekday("2026-10-31", "en")).toBe("Sat");
  });
});

describe("translate", () => {
  test("fills placeholders and writes numbers in the locale's digits", () => {
    expect(translate("bn", "step", [2, 3])).toBe("ধাপ ২ / ৩");
    expect(translate("en", "step", [2, 3])).toBe("Step 2 of 3");
    expect(translate("bn", "kh.pages", [1200])).toBe("১,২০০টি পাতা");
  });

  test("string arguments are inserted as given and a missing one stays visible", () => {
    expect(translate("en", "today.title", ["1 Nov"])).toBe("Today, 1 Nov");
    expect(translate("en", "step", [1])).toBe("Step 1 of {2}");
  });

  test("makeI18n binds the locale", () => {
    const i = makeI18n("en");
    expect(i.t("tab.today")).toBe("Today");
    expect(i.money(5000)).toBe("৳50");
  });

  test("locale guard", () => {
    expect(isLocale("bn")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("dictionary", () => {
  const keys = Object.keys(MESSAGES.bn) as MessageKey[];
  const holes = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(",");

  test("every key has text in both languages", () => {
    for (const key of keys) {
      expect(MESSAGES.bn[key].trim().length, key).toBeGreaterThan(0);
      expect(MESSAGES.en[key].trim().length, key).toBeGreaterThan(0);
    }
  });

  test("both languages use the same placeholders", () => {
    for (const key of keys) expect(holes(MESSAGES.en[key]), key).toBe(holes(MESSAGES.bn[key]));
  });

  test("Bangla placeholders use ASCII digits so code can fill them", () => {
    for (const key of keys) expect(MESSAGES.bn[key], key).not.toMatch(/\{[০-৯]+\}/);
  });
});
