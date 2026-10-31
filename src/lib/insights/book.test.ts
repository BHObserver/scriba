import { describe, expect, test } from "bun:test";
import { prepareBook, rootPartyId } from "./book";
import { addDays, datesFrom, daysBetween, weekdayOf } from "./calendar";
import { bookInput, makeParty, makeRecords } from "./testing";

describe("calendar", () => {
  test("adds days across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("counts days and lists dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
    expect(datesFrom("2026-10-30", "2026-11-01")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(datesFrom("2026-11-01", "2026-10-31")).toEqual([]);
  });

  test("weekday of a business date", () => {
    expect(weekdayOf("2026-10-31")).toBe(6); // Saturday
    expect(weekdayOf("2026-11-01")).toBe(0);
  });

  test("refuses a malformed date", () => {
    expect(() => addDays("31/10/2026", 1)).toThrow();
  });
});

describe("prepareBook", () => {
  test("an empty book", () => {
    const book = prepareBook(bookInput([]));
    expect(book.records).toEqual([]);
    expect(book.firstDate).toBeNull();
  });

  test("puts records in khata order: date, page capture time, line", () => {
    const records = makeRecords([
      { date: "2026-10-31", type: "cash_sale", taka: 10, doc: "late", capturedAt: "2026-10-31T09:00:00.000Z", id: "c" },
      { date: "2026-10-30", type: "cash_sale", taka: 10, id: "a" },
      { date: "2026-10-31", type: "cash_sale", taka: 10, doc: "early", capturedAt: "2026-10-31T03:00:00.000Z", id: "b" },
    ]);
    const book = prepareBook(bookInput(records));
    expect(book.records.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(book.firstDate).toBe("2026-10-30");
  });

  test("a page read twice counts once: only the run confirmed last", () => {
    const records = makeRecords([
      { date: "2026-10-31", type: "cash_sale", taka: 180, doc: "p1", run: "first", confirmedAt: "2026-10-31T10:00:00.000Z", id: "old1" },
      { date: "2026-10-31", type: "cash_sale", taka: 140, doc: "p1", run: "first", confirmedAt: "2026-10-31T10:00:00.000Z", id: "old2" },
      { date: "2026-10-31", type: "cash_sale", taka: 180, doc: "p1", run: "second", confirmedAt: "2026-10-31T11:00:00.000Z", id: "new1", corrected: true },
      { date: "2026-10-31", type: "cash_sale", taka: 50, doc: "p2", run: "other", id: "p2line" },
    ]);
    const book = prepareBook(bookInput(records));
    expect(book.records.map((r) => r.id).sort()).toEqual(["new1", "p2line"]);
    expect(book.supersededRecordIds).toEqual(["old1", "old2"]);
  });

  test("follows merges to the party they were merged into", () => {
    const parties = [
      makeParty("a", "customer", "করিম"),
      makeParty("b", "customer", "করীম", "a"),
      makeParty("c", "customer", "মোঃ করিম", "b"),
    ];
    const records = makeRecords([
      { date: "2026-10-31", type: "credit_sale", taka: 100, party: "c" },
      { date: "2026-10-31", type: "credit_sale", taka: 100, party: "b" },
      { date: "2026-10-31", type: "credit_sale", taka: 100, party: "a" },
    ]);
    const book = prepareBook(bookInput(records, { parties }));
    expect(book.records.map((r) => r.partyId)).toEqual(["a", "a", "a"]);
  });

  test("a merge cycle or a missing target stops instead of looping", () => {
    const parties = new Map(
      [makeParty("a", "customer", "A", "b"), makeParty("b", "customer", "B", "a"), makeParty("x", "customer", "X", "gone")].map(
        (p) => [p.id, p],
      ),
    );
    expect(["a", "b"]).toContain(rootPartyId(parties, "a"));
    expect(rootPartyId(parties, "x")).toBe("x");
    expect(rootPartyId(parties, "unknown")).toBe("unknown");
  });
});
