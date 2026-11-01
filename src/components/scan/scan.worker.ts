/// <reference lib="webworker" />
/** The page finder's worker (C2): keeps detection and flattening off the main thread. */

import type { Quad } from "./geometry";
import { findInStill, findPage, flattenStill } from "./scan-core";

export type ScanRequest =
  | { id: number; kind: "frame"; width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }
  | { id: number; kind: "still"; blob: Blob }
  | { id: number; kind: "flatten"; blob: Blob; quad: Quad; khata: boolean; quality: number };

export type ScanReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<ScanRequest>) => {
  const req = event.data;
  try {
    const result =
      req.kind === "frame"
        ? findPage({ data: req.data, width: req.width, height: req.height })
        : req.kind === "still"
          ? await findInStill(req.blob)
          : await flattenStill(req.blob, req.quad, req.khata, req.quality);
    scope.postMessage({ id: req.id, ok: true, result } satisfies ScanReply);
  } catch (e) {
    scope.postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies ScanReply);
  }
};
