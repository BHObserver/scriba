"use client";

import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { PageLayout } from "@/lib/extraction/prompt";
import { processingModeForTurns, type QuarterTurns } from "@/lib/images/orientation";
import { type Reading, readingFromAnalyze, readingFromNetworkError } from "./problems";

/** `layout` is left out by "check again", so the server keeps the one the page was read with. */
export type PageToRead = { documentId: string; turns: QuarterTurns; layout?: PageLayout };
/** A reading plus the orientation the page was sent in, so the screen shows the photo that way. */
export type QueuedReading = Reading & { turns: QuarterTurns };

type ReadingQueue = {
  /** Readings this session started, by document id. Pages not in here fall back to the stored run. */
  readings: ReadonlyMap<string, QueuedReading>;
  /** Send pages to be read: one paid request each, two at a time, in page order. Never retried. */
  read: (pages: readonly PageToRead[]) => void;
  /** Drop a finished reading so the screen shows the stored run again ("check again"). */
  forget: (documentId: string) => void;
};

const ReadingQueueContext = createContext<ReadingQueue | null>(null);

/** Two requests at a time keeps the first page's wait short without queueing behind the last. */
const CONCURRENCY = 2;

async function analyzeOnce(page: PageToRead): Promise<Reading> {
  // One request id per deliberate tap; the server de-duplicates a re-sent request with the same id.
  const requestId = crypto.randomUUID();
  try {
    const res = await fetch(`/api/documents/${page.documentId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, mode: "use_cache", processingMode: processingModeForTurns(page.turns), layout: page.layout }),
    });
    return readingFromAnalyze(res.status, await res.json().catch(() => ({})));
  } catch {
    return readingFromNetworkError(navigator.onLine);
  }
}

/**
 * Lives in the signed-in layout, so a reading started on /capture keeps going while the user moves
 * to /check and between pages. A reload loses it; /check then shows the stored run's state instead.
 */
export function ReadingQueueProvider({ children }: { children: ReactNode }) {
  const [readings, setReadings] = useState<ReadonlyMap<string, QueuedReading>>(new Map());
  const inFlight = useRef(new Set<string>());

  const read = useCallback((pages: readonly PageToRead[]) => {
    const fresh = pages.filter((p) => !inFlight.current.has(p.documentId));
    if (fresh.length === 0) return;
    for (const p of fresh) inFlight.current.add(p.documentId);
    setReadings((prev) => {
      const next = new Map(prev);
      for (const p of fresh) next.set(p.documentId, { phase: "reading", turns: p.turns });
      return next;
    });
    let cursor = 0;
    const worker = async () => {
      while (cursor < fresh.length) {
        const page = fresh[cursor++]!;
        const result = await analyzeOnce(page);
        inFlight.current.delete(page.documentId);
        setReadings((prev) => new Map(prev).set(page.documentId, { ...result, turns: page.turns }));
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, fresh.length); i++) void worker();
  }, []);

  const forget = useCallback((documentId: string) => {
    if (inFlight.current.has(documentId)) return;
    setReadings((prev) => {
      if (!prev.has(documentId)) return prev;
      const next = new Map(prev);
      next.delete(documentId);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ readings, read, forget }), [readings, read, forget]);
  return <ReadingQueueContext value={value}>{children}</ReadingQueueContext>;
}

export function useReadingQueue(): ReadingQueue {
  const value = use(ReadingQueueContext);
  if (!value) throw new Error("useReadingQueue must be used inside the signed-in layout.");
  return value;
}
