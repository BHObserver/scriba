import { describe, expect, test } from "bun:test";
import { checkBackHref, checkHref } from "./back-href";

describe("check back link", () => {
  test("goes back to the screen that opened the page", () => {
    expect(checkBackHref("/history/2026-11-01")).toBe("/history/2026-11-01");
    expect(checkBackHref("/history")).toBe("/history");
    expect(checkBackHref("/close")).toBe("/close");
    expect(checkBackHref("/parties")).toBe("/parties");
  });

  test("anything else goes to Today", () => {
    expect(checkBackHref(undefined)).toBe("/");
    expect(checkBackHref(["/close", "/history"])).toBe("/");
    expect(checkBackHref("https://example.com")).toBe("/");
    expect(checkBackHref("//example.com")).toBe("/");
    expect(checkBackHref("/history/2026-11-01/../x")).toBe("/");
    expect(checkBackHref("/settings")).toBe("/");
  });

  test("links carry the queue and the way back", () => {
    expect(checkHref("a")).toBe("/check/a");
    expect(checkHref("a", { from: "/" })).toBe("/check/a");
    expect(checkHref("b", { pages: ["a", "b"] })).toBe("/check/b?pages=a,b");
    expect(checkHref("b", { pages: ["a", "b"], from: "/close" })).toBe("/check/b?pages=a,b&from=/close");
    expect(checkHref("a", { from: "/history/2026-11-01" })).toBe("/check/a?from=/history/2026-11-01");
  });
});
