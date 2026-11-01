/**
 * In-memory ExtractionRepo that mirrors the database guarantees the pipeline
 * relies on: unique request ids, at most one pending run per cache key, and
 * owner scoping.
 */
import { sha256Hex } from "@/lib/extraction/cache-key";
import type {
  DocumentForExtraction,
  ExtractionRepo,
  NewRun,
  RunFailure,
  RunRecord,
  RunSuccess,
} from "@/lib/extraction/pipeline";
import { callsOfRun } from "@/lib/extraction/two-pass";

export type StoredRun = RunRecord & NewRun & { success?: RunSuccess; failure?: RunFailure };

export class MemoryStore {
  documents = new Map<string, DocumentForExtraction>();
  objects = new Map<string, Uint8Array>();
  runs: StoredRun[] = [];
  cacheHits: Array<{ runId: string; documentId: string }> = [];
  failNextComplete = false;
  clock = () => new Date();

  addDocument(ownerId: string, bytes: Uint8Array, id = `doc-${this.documents.size + 1}`) {
    const doc: DocumentForExtraction = {
      id,
      ownerId,
      sha256: sha256Hex(bytes),
      storagePath: `${ownerId}/${id}.png`,
      mimeType: "image/png",
    };
    this.documents.set(id, doc);
    this.objects.set(doc.storagePath, bytes);
    return doc;
  }

  repoFor(userId: string): ExtractionRepo {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- object-literal methods below need the store
    const store = this;
    const own = (r: StoredRun) => r.ownerId === userId;
    return {
      async getDocument(id) {
        const d = store.documents.get(id);
        return d && d.ownerId === userId ? d : null;
      },
      async findRunByRequestId(requestId) {
        return store.runs.find((r) => own(r) && r.requestId === requestId) ?? null;
      },
      async findLatestSucceededRun(cacheKey) {
        return [...store.runs].reverse().find((r) => own(r) && r.cacheKey === cacheKey && r.status === "succeeded") ?? null;
      },
      async findPendingRun(cacheKey) {
        return store.runs.find((r) => own(r) && r.cacheKey === cacheKey && r.status === "pending") ?? null;
      },
      async latestPromptVersion(documentId) {
        return [...store.runs].reverse().find((r) => own(r) && r.documentId === documentId)?.promptVersion ?? null;
      },
      async countModelCallsSince(since) {
        // Like the database: only a succeeded run's result says how many calls it made.
        return store.runs
          .filter((r) => own(r) && r.startedAt >= since)
          .reduce((n, r) => n + callsOfRun(r.promptVersion, r.success?.extraction.reading?.calls ?? null), 0);
      },
      async insertPendingRun(run: NewRun) {
        // Synchronous check-and-insert: emulates the unique indexes atomically.
        if (store.runs.some((r) => r.requestId === run.requestId)) return { ok: false, conflict: "request_id" } as const;
        if (store.runs.some((r) => r.ownerId === run.ownerId && r.cacheKey === run.cacheKey && r.status === "pending")) {
          return { ok: false, conflict: "pending" } as const;
        }
        const record: StoredRun = {
          ...run,
          id: `run-${store.runs.length + 1}`,
          status: "pending",
          startedAt: store.clock(),
          errorCategory: null,
          errorMessage: null,
        };
        store.runs.push(record);
        return { ok: true, run: record } as const;
      },
      async downloadOriginal(doc) {
        const bytes = store.objects.get(doc.storagePath);
        if (!bytes) throw new Error("missing");
        return bytes;
      },
      async completeRun(runId, result) {
        if (store.failNextComplete) {
          store.failNextComplete = false;
          throw new Error("db down");
        }
        const r = store.runs.find((x) => x.id === runId)!;
        r.status = "succeeded";
        r.success = result;
      },
      async failRun(runId, failure) {
        const r = store.runs.find((x) => x.id === runId)!;
        r.status = failure.status;
        r.failure = failure;
        r.errorCategory = failure.errorCategory;
        r.errorMessage = failure.errorMessage;
      },
      async recordCacheHit(runId, documentId) {
        store.cacheHits.push({ runId, documentId });
      },
    };
  }
}
