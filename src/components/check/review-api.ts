import type { EntryValues, PageValues, ReviewableField } from "@/lib/ledger/types";
import type { Acknowledgements } from "@/lib/review/approval";
import type { PageState, ReviewRow } from "@/lib/review/state";
import { remainingReviewFields } from "@/lib/review/values";

/**
 * The deck talks to the same APIs as the details page's review workspace: one line saved at a
 * time (`PATCH /api/reviews/[id]`, versioned), lines added (`POST /api/runs/[id]/rows`), page
 * details (`PATCH /api/runs/[id]/page`, versioned) and one confirmation
 * (`POST /api/runs/[id]/confirm`) that re-runs every check on the server. A confirmed page is
 * reopened through `/api/runs/[id]/reopen` (T4, T5). The dev board swaps in `localReviewApi`.
 */
export type LinePatch = { values?: EntryValues; status?: "draft" | "rejected"; markChecked?: ReviewableField[] };
export type SavedLine = Pick<ReviewRow, "values" | "reviewFields" | "status" | "version">;
export type ConfirmEntry = { id: string; expectedVersion: number; acknowledgements: Acknowledgements };
export type ApiFailure = { ok: false; reason: "conflict" | "failed" | "notReady"; lineIds?: string[] };
type Review = { page: PageState; rows: ReviewRow[] };

/** Why a page can't be reopened: read again since (`not_latest`), nothing in the khata (`not_confirmed`). */
export type ReopenRefusal = "not_latest" | "not_confirmed";
/** What reopening would do (T4's preview): how many lines leave the khata, and the closed days that hold the page. */
export type ReopenPreview = { canReopen: boolean; reason: ReopenRefusal | null; records: number; closedDays: string[] };
export type ReopenResult = { ok: true; review: Review } | { ok: false; reason: ReopenRefusal | "busy" | "failed" };

export type ReviewApi = {
  /** Marks when review began; resolves to the page's new version when that bumped it, else null. */
  markStarted: () => Promise<StartedPage>;
  saveLine: (row: ReviewRow, patch: LinePatch) => Promise<{ ok: true; line: SavedLine } | ApiFailure>;
  /** Add a line after `afterId` (null: at the top). The server marks it as added by the reviewer. */
  addLine: (afterId: string | null, values: EntryValues) => Promise<{ ok: true; row: ReviewRow } | ApiFailure>;
  savePage: (page: PageState, values: PageValues) => Promise<{ ok: true; page: PageState } | ApiFailure>;
  confirm: (entries: ConfirmEntry[]) => Promise<{ ok: true; confirmed: number } | ApiFailure>;
  /** What reopening the page would do; changes nothing. Null: it couldn't be asked. `review` is read only by the dev board's version. */
  reopenPreview: (review: Review) => Promise<ReopenPreview | null>;
  /** Take the page's lines out of the khata so it can be fixed; returns the review as it now is. */
  reopen: (review: Review) => Promise<ReopenResult>;
};

/** The page's version after review was marked started (that update bumps it), or null. */
export type StartedPage = { version: number; reviewStartedAt: string | null } | null;

/** The page with the version marking it started gave it, when that is newer than the one held. */
export function withStarted(page: PageState, started: StartedPage): PageState {
  return started && started.version > page.version ? { ...page, version: started.version, reviewStartedAt: started.reviewStartedAt } : page;
}

const REFUSALS: readonly string[] = ["not_latest", "not_confirmed"] satisfies ReopenRefusal[];
const refusal = (code: unknown): ReopenRefusal | null => (typeof code === "string" && REFUSALS.includes(code) ? (code as ReopenRefusal) : null);

async function send(path: string, method: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> {
  try {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } catch {
    return null;
  }
}

export function httpReviewApi(runId: string): ReviewApi {
  return {
    async markStarted() {
      const res = await send(`/api/runs/${runId}/page`, "PATCH", { markReviewStarted: true });
      const version = res?.json.version;
      if (typeof version !== "number") return null;
      const at = res!.json.reviewStartedAt;
      return { version, reviewStartedAt: typeof at === "string" ? at : null };
    },
    async saveLine(row, patch) {
      const res = await send(`/api/reviews/${row.id}`, "PATCH", { expectedVersion: row.version, ...patch });
      if (!res || res.status >= 300) return { ok: false, reason: res?.status === 409 ? "conflict" : "failed" };
      return { ok: true, line: res.json as unknown as SavedLine };
    },
    async addLine(afterId, values) {
      const res = await send(`/api/runs/${runId}/rows`, "POST", { afterId, values });
      if (!res || res.status >= 300) return { ok: false, reason: "failed" };
      return { ok: true, row: res.json as unknown as ReviewRow };
    },
    async savePage(page, values) {
      const res = await send(`/api/runs/${runId}/page`, "PATCH", { expectedVersion: page.version, values });
      if (!res || res.status >= 300) return { ok: false, reason: res?.status === 409 ? "conflict" : "failed" };
      return { ok: true, page: res.json as unknown as PageState };
    },
    async confirm(entries) {
      const res = await send(`/api/runs/${runId}/confirm`, "POST", { entries });
      if (!res) return { ok: false, reason: "failed" };
      if (res.status === 422 && Array.isArray(res.json.problems)) {
        return { ok: false, reason: "notReady", lineIds: (res.json.problems as Array<{ id: string }>).map((p) => p.id) };
      }
      if (res.status === 409) return { ok: false, reason: "conflict" };
      if (res.status >= 300) return { ok: false, reason: "failed" };
      return { ok: true, confirmed: Number(res.json.confirmed ?? entries.length) };
    },
    async reopenPreview() {
      try {
        const res = await fetch(`/api/runs/${runId}/reopen`);
        if (!res.ok) return null;
        const json = (await res.json()) as Record<string, unknown>;
        const closedDays = Array.isArray(json.closedDays) ? json.closedDays.filter((d): d is string => typeof d === "string") : [];
        return { canReopen: json.canReopen === true, reason: refusal(json.reason), records: Number(json.records ?? 0), closedDays };
      } catch {
        return null;
      }
    },
    async reopen() {
      const res = await send(`/api/runs/${runId}/reopen`, "POST", {});
      if (!res) return { ok: false, reason: "failed" };
      if (res.status === 409) return { ok: false, reason: refusal(res.json.code) ?? "failed" };
      if (res.status === 429) return { ok: false, reason: "busy" };
      const { page, rows } = res.json as { page?: PageState | null; rows?: ReviewRow[] | null };
      if (res.status >= 300 || !page || !rows) return { ok: false, reason: "failed" };
      return { ok: true, review: { page, rows } };
    },
  };
}

/**
 * Development only: the server's line rules in memory, so the deck can be clicked through on
 * stored readings. `closedDays`: the closed days a reopen warns about (the dev board's `&closed=1`).
 */
export function localReviewApi({ closedDays = [] }: { closedDays?: string[] } = {}): ReviewApi {
  return {
    async markStarted() {
      return null;
    },
    async saveLine(row, patch) {
      let reviewFields = row.reviewFields;
      if (patch.values) reviewFields = remainingReviewFields(reviewFields, row.values, patch.values);
      if (patch.markChecked) reviewFields = reviewFields.filter((f) => !patch.markChecked!.includes(f));
      return { ok: true, line: { values: patch.values ?? row.values, reviewFields, status: patch.status ?? row.status, version: row.version + 1 } };
    },
    async addLine(_afterId, values) {
      return { ok: true, row: { id: crypto.randomUUID(), extractedEntryId: null, lineOrder: 0, values, reviewFields: [], status: "draft", version: 1, candidate: null } };
    },
    async savePage(page, values) {
      return { ok: true, page: { ...page, values, version: page.version + 1 } };
    },
    async confirm(entries) {
      return { ok: true, confirmed: entries.length };
    },
    async reopenPreview(review) {
      const records = review.rows.filter((r) => r.status === "confirmed").length;
      return { canReopen: records > 0, reason: records > 0 ? null : "not_confirmed", records, closedDays };
    },
    async reopen(review) {
      if (!review.rows.some((r) => r.status === "confirmed")) return { ok: false, reason: "not_confirmed" };
      return { ok: true, review: { ...review, rows: review.rows.map((r) => (r.status === "confirmed" ? { ...r, status: "draft", version: r.version + 1 } : r)) } };
    },
  };
}
