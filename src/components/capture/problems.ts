/**
 * The problem screens a page can land on (design/DESIGN_SPEC.md "Error states"), and how the
 * analyze API's outcomes and stored run states map onto them. Pure, so it is tested.
 */

export type ProblemKind = "unreadable" | "small" | "file" | "sideways" | "offline" | "sendFailed" | "failed" | "busy" | "waiting" | "notAllowed";

/** What the screen knows about one page's reading. */
export type Reading =
  | { phase: "reading" }
  /** The server holds a pending run this screen didn't start (a reload, another tab): poll it. */
  | { phase: "server" }
  | { phase: "done"; runId: string }
  | { phase: "problem"; problem: ProblemKind };

type AnalyzeBody = { kind?: string; runId?: string; status?: string; uncertain?: boolean };

/** One analyze response (HTTP status + JSON body) as the page's reading state. */
export function readingFromAnalyze(httpStatus: number, body: AnalyzeBody): Reading {
  switch (body.kind) {
    case "completed":
    case "cached":
      return body.runId ? { phase: "done", runId: body.runId } : { phase: "server" };
    case "duplicate_request":
      if (body.status === "succeeded" && body.runId) return { phase: "done", runId: body.runId };
      return body.status === "pending" ? { phase: "server" } : { phase: "problem", problem: "failed" };
    case "in_progress":
      return { phase: "server" };
    case "previous_uncertain":
      return { phase: "problem", problem: "waiting" };
    case "rate_limited":
      return { phase: "problem", problem: "busy" };
    case "unusable_output":
      return { phase: "problem", problem: "unreadable" };
    // Meta may have processed a request that timed out: never invite a blind second send.
    case "model_failed":
      return { phase: "problem", problem: body.uncertain ? "waiting" : "failed" };
    default:
      return { phase: "problem", problem: httpStatus === 403 ? "notAllowed" : "failed" };
  }
}

/** A connection that broke while waiting: offline if the device says so, else the request may still finish. */
export function readingFromNetworkError(online: boolean): Reading {
  return { phase: "problem", problem: online ? "waiting" : "offline" };
}

/** The latest stored run of a page that has no successful run. */
export function readingFromRun(run: { status: string; startedAt: string } | null, now: number, staleMs: number): Reading | null {
  if (!run) return null;
  switch (run.status) {
    case "pending":
      return now - Date.parse(run.startedAt) > staleMs ? { phase: "problem", problem: "waiting" } : { phase: "server" };
    case "invalid_output":
    case "incomplete":
      return { phase: "problem", problem: "unreadable" };
    case "uncertain":
      return { phase: "problem", problem: "waiting" };
    default:
      return { phase: "problem", problem: "failed" };
  }
}

/** Problems after which the stored photo can be read again with one deliberate tap. */
export const RETRYABLE: ReadonlySet<ProblemKind> = new Set(["failed", "busy", "offline", "sendFailed"]);
