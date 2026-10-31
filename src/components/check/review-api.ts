import type { EntryValues, ReviewableField } from "@/lib/ledger/types";
import type { Acknowledgements } from "@/lib/review/approval";
import type { ReviewRow } from "@/lib/review/state";
import { remainingReviewFields } from "@/lib/review/values";

/**
 * The deck talks to the same APIs as the details page's review workspace: one line saved at a
 * time (`PATCH /api/reviews/[id]`, versioned) and one confirmation (`POST /api/runs/[id]/confirm`)
 * that re-runs every check on the server. The dev board swaps in `localReviewApi`.
 */
export type LinePatch = { values?: EntryValues; status?: "draft" | "rejected"; markChecked?: ReviewableField[] };
export type SavedLine = Pick<ReviewRow, "values" | "reviewFields" | "status" | "version">;
export type ConfirmEntry = { id: string; expectedVersion: number; acknowledgements: Acknowledgements };
export type ApiFailure = { ok: false; reason: "conflict" | "failed" | "notReady"; lineIds?: string[] };

export type ReviewApi = {
  markStarted: () => void;
  saveLine: (row: ReviewRow, patch: LinePatch) => Promise<{ ok: true; line: SavedLine } | ApiFailure>;
  confirm: (entries: ConfirmEntry[]) => Promise<{ ok: true; confirmed: number } | ApiFailure>;
};

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
    markStarted() {
      void send(`/api/runs/${runId}/page`, "PATCH", { markReviewStarted: true });
    },
    async saveLine(row, patch) {
      const res = await send(`/api/reviews/${row.id}`, "PATCH", { expectedVersion: row.version, ...patch });
      if (!res || res.status >= 300) return { ok: false, reason: res?.status === 409 ? "conflict" : "failed" };
      return { ok: true, line: res.json as unknown as SavedLine };
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
  };
}

/** Development only: the server's line rules in memory, so the deck can be clicked through on stored readings. */
export function localReviewApi(): ReviewApi {
  return {
    markStarted() {},
    async saveLine(row, patch) {
      let reviewFields = row.reviewFields;
      if (patch.values) reviewFields = remainingReviewFields(reviewFields, row.values, patch.values);
      if (patch.markChecked) reviewFields = reviewFields.filter((f) => !patch.markChecked!.includes(f));
      return { ok: true, line: { values: patch.values ?? row.values, reviewFields, status: patch.status ?? row.status, version: row.version + 1 } };
    },
    async confirm(entries) {
      return { ok: true, confirmed: entries.length };
    },
  };
}
