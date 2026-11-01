import { describe, expect, test } from "bun:test";
import { makeI18n } from "@/lib/i18n/format";
import {
  type HistoryDayView,
  type HistoryPageView,
  canClose,
  closeStatus,
  dayTitle,
  historySections,
  pageHref,
  pageStateText,
  pagesText,
  searchParties,
  shownDays,
  thumbHeight,
  thumbSrc,
} from "./history-model";

const bn = makeI18n("bn");
const en = makeI18n("en");

const page = (id: string, over: Partial<HistoryPageView> = {}): HistoryPageView => ({
  documentId: id,
  state: "checked",
  waitingLines: 0,
  confirmedLines: 6,
  photo: null,
  ...over,
});
const day = (date: string, pages: HistoryPageView[] = []): HistoryDayView => ({ date, pages, salesPoisha: 0, waitingPages: 0, close: null });

describe("history sections", () => {
  test("the seven days ending today, then one section per month, newest first", () => {
    const days = ["2026-11-01", "2026-10-30", "2026-10-26", "2026-10-25", "2026-10-02", "2026-09-30"].map((d) => day(d));
    const sections = historySections(days, "2026-11-01", bn);
    expect(sections.map((s) => [s.label, s.days.map((d) => d.date)])).toEqual([
      ["এই সপ্তাহ", ["2026-11-01", "2026-10-30", "2026-10-26"]],
      ["অক্টোবর ২০২৬", ["2026-10-25", "2026-10-02"]],
      ["সেপ্টেম্বর ২০২৬", ["2026-09-30"]],
    ]);
  });

  test("a shop that wasn't used this week starts with a month", () => {
    expect(historySections([day("2026-10-20")], "2026-11-01", en).map((s) => s.label)).toEqual(["Oct 2026"]);
    expect(historySections([], "2026-11-01", en)).toEqual([]);
  });

  test("days shown grow in steps of thirty", () => {
    expect(shownDays(undefined)).toBe(30);
    expect(shownDays("abc")).toBe(30);
    expect(shownDays("10")).toBe(30);
    expect(shownDays("60")).toBe(60);
    expect(shownDays("61")).toBe(90);
    expect(shownDays(["60"])).toBe(30);
  });
});

describe("day and page text", () => {
  test("today and yesterday by name, other days by weekday", () => {
    expect(dayTitle("2026-11-01", "2026-11-01", bn)).toBe("আজ, ১ নভেম্বর");
    expect(dayTitle("2026-10-31", "2026-11-01", en)).toBe("Yesterday, 31 Oct");
    expect(dayTitle("2026-10-30", "2026-11-01", bn)).toBe("শুক্রবার, ৩০ অক্টোবর");
    expect(dayTitle("2026-10-30", "2026-11-01", bn, { weekday: false })).toBe("৩০ অক্টোবর");
    expect(dayTitle("2026-11-01", "2026-11-01", en, { weekday: false })).toBe("Today, 1 Nov");
  });

  test("a page says whether it is checked and how many lines it has", () => {
    expect(pageStateText(page("a"), bn)).toBe("দেখা হয়েছে · ৬টি লাইন");
    expect(pageStateText(page("a", { state: "waiting", waitingLines: 5 }), en)).toBe("Not checked yet · 5 lines");
    expect(pageStateText(page("a", { state: "unread" }), en)).toBe("Not read yet");
    expect(pageStateText(page("a", { confirmedLines: 1 }), en)).toBe("Checked · 1 line");
    expect(pagesText(1, en)).toBe("1 page");
    expect(pagesText(1, bn)).toBe("১টি পাতা");
    expect(pagesText(3, en)).toBe("3 pages");
  });

  test("how the day ended", () => {
    expect(closeStatus(null, bn)).toEqual({ mark: "wait", text: "দিন বন্ধ করা হয়নি" });
    expect(closeStatus({ status: "matched", gapPoisha: 0, changedSinceClose: false }, en)).toEqual({ mark: "ok", text: "Day closed, cash matched" });
    expect(closeStatus({ status: "short", gapPoisha: -5000, changedSinceClose: false }, bn)).toEqual({ mark: "look", text: "দিন বন্ধ, ৳৫০ কম ছিল" });
    expect(closeStatus({ status: "over", gapPoisha: 2000, changedSinceClose: false }, en)).toEqual({ mark: "look", text: "Day closed, ৳20 over" });
    expect(closeStatus({ status: "matched", gapPoisha: 0, changedSinceClose: true }, en).mark).toBe("look");
  });

  test("a day is closed (again) when it wasn't, or lines came after; never a future day", () => {
    expect(canClose({ date: "2026-10-30", close: null }, "2026-11-01")).toBe(true);
    expect(canClose({ date: "2026-11-02", close: null }, "2026-11-01")).toBe(false);
    expect(canClose({ date: "2026-10-30", close: { status: "matched", gapPoisha: 0, changedSinceClose: false } }, "2026-11-01")).toBe(false);
    expect(canClose({ date: "2026-10-30", close: { status: "matched", gapPoisha: 0, changedSinceClose: true } }, "2026-11-01")).toBe(true);
  });
});

describe("pages", () => {
  test("a waiting page brings the day's other waiting pages along", () => {
    const d = day("2026-11-01", [page("a"), page("b", { state: "waiting" }), page("c", { state: "unread" })]);
    expect(pageHref(d.pages[0]!, d)).toBe("/check/a?from=/history/2026-11-01");
    expect(pageHref(d.pages[2]!, d)).toBe("/check/c?pages=b,c&from=/history/2026-11-01");
  });

  test("thumbnails exist only for real photos, upright", () => {
    const photo = page("a", { photo: { width: 3000, height: 4000, turns: 1 } });
    expect(thumbSrc(photo, 96)).toBe("/api/documents/a/thumb?w=96&t=1");
    expect(thumbSrc(page("b"), 96)).toBeNull();
    // Turned a quarter, the 3000 × 4000 photo stands 4000 wide.
    expect(thumbHeight(photo, 320)).toBe(240);
    expect(thumbHeight(page("a", { photo: { width: 3000, height: 4000, turns: 2 } }), 96)).toBe(128);
    expect(thumbHeight(page("b"), 96)).toBe(128);
  });
});

describe("search", () => {
  test("each person found is linked once, newest first, at most three", () => {
    const lines = [
      { partyId: "r", name: "রহিম উদ্দিন" },
      { partyId: null, name: "চাল" },
      { partyId: "r", name: "রহিম উদ্দিন" },
      { partyId: "k", name: "করিম" },
      { partyId: "a", name: "আলম" },
      { partyId: "b", name: "বাবুল" },
    ];
    expect(searchParties(lines)).toEqual([
      { id: "r", name: "রহিম উদ্দিন" },
      { id: "k", name: "করিম" },
      { id: "a", name: "আলম" },
    ]);
  });
});
