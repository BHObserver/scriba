import { describe, expect, test } from "bun:test";
import { isFlowRoute } from "@/components/shell/tabs";
import { type ProblemKind, RETRYABLE, readingFromAnalyze, readingFromNetworkError, readingFromRun } from "./problems";

const problem = (p: ProblemKind) => ({ phase: "problem" as const, problem: p });

describe("readingFromAnalyze", () => {
  test("a finished or reused reading is done", () => {
    expect(readingFromAnalyze(200, { kind: "completed", runId: "r1" })).toEqual({ phase: "done", runId: "r1" });
    expect(readingFromAnalyze(200, { kind: "cached", runId: "r2" })).toEqual({ phase: "done", runId: "r2" });
  });

  test("a replayed request follows the run it points at", () => {
    expect(readingFromAnalyze(200, { kind: "duplicate_request", runId: "r1", status: "succeeded" })).toEqual({ phase: "done", runId: "r1" });
    expect(readingFromAnalyze(200, { kind: "duplicate_request", runId: "r1", status: "pending" })).toEqual({ phase: "server" });
    expect(readingFromAnalyze(200, { kind: "duplicate_request", runId: "r1", status: "failed" })).toEqual(problem("failed"));
  });

  test("a page already being read is polled, not sent again", () => {
    expect(readingFromAnalyze(409, { kind: "in_progress", runId: "r1" })).toEqual({ phase: "server" });
  });

  test("each failure lands on its D4 problem screen", () => {
    expect(readingFromAnalyze(409, { kind: "previous_uncertain" })).toEqual(problem("waiting"));
    expect(readingFromAnalyze(429, { kind: "rate_limited" })).toEqual(problem("busy"));
    expect(readingFromAnalyze(422, { kind: "unusable_output" })).toEqual(problem("unreadable"));
    expect(readingFromAnalyze(502, { kind: "model_failed", uncertain: false })).toEqual(problem("failed"));
    expect(readingFromAnalyze(500, { kind: "persistence_error" })).toEqual(problem("failed"));
    expect(readingFromAnalyze(409, { kind: "integrity_error" })).toEqual(problem("failed"));
  });

  test("a request Meta may have processed asks to wait, never to resend", () => {
    expect(readingFromAnalyze(502, { kind: "model_failed", uncertain: true })).toEqual(problem("waiting"));
    expect(RETRYABLE.has("waiting")).toBe(false);
  });

  test("an account outside the allow-list is told so, not blamed on the service", () => {
    expect(readingFromAnalyze(403, {})).toEqual(problem("notAllowed"));
    expect(readingFromAnalyze(500, {})).toEqual(problem("failed"));
  });
});

describe("readingFromNetworkError", () => {
  test("offline only when the device says so; otherwise the request may still finish", () => {
    expect(readingFromNetworkError(false)).toEqual(problem("offline"));
    expect(readingFromNetworkError(true)).toEqual(problem("waiting"));
  });
});

describe("readingFromRun", () => {
  const now = Date.parse("2026-11-01T10:10:00Z");
  const stale = 6 * 60 * 1000;
  test("no run: never read", () => {
    expect(readingFromRun(null, now, stale)).toBeNull();
  });
  test("a fresh pending run is being read; a stale one may have been lost", () => {
    expect(readingFromRun({ status: "pending", startedAt: "2026-11-01T10:08:00Z" }, now, stale)).toEqual({ phase: "server" });
    expect(readingFromRun({ status: "pending", startedAt: "2026-11-01T10:00:00Z" }, now, stale)).toEqual(problem("waiting"));
  });
  test("stored failures", () => {
    expect(readingFromRun({ status: "invalid_output", startedAt: "" }, now, stale)).toEqual(problem("unreadable"));
    expect(readingFromRun({ status: "incomplete", startedAt: "" }, now, stale)).toEqual(problem("unreadable"));
    expect(readingFromRun({ status: "uncertain", startedAt: "" }, now, stale)).toEqual(problem("waiting"));
    expect(readingFromRun({ status: "failed", startedAt: "" }, now, stale)).toEqual(problem("failed"));
  });
});

describe("isFlowRoute", () => {
  test("camera and check screens hide the tab bar; nothing else does", () => {
    expect(isFlowRoute("/capture")).toBe(true);
    expect(isFlowRoute("/check/7d1c0d1e-0000-4000-8000-000000000000")).toBe(true);
    expect(isFlowRoute("/")).toBe(false);
    expect(isFlowRoute("/checkout")).toBe(false);
    expect(isFlowRoute("/documents")).toBe(false);
  });
});
