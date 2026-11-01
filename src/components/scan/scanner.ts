"use client";

/**
 * The page finder from the screen's side (C2). Work goes to a worker; where there is no worker
 * that can draw (no `OffscreenCanvas`), or the worker fails, the same code runs on the main thread.
 */

import type { Quad } from "./geometry";
import { type FlatPage, type Found, type StillPage, findInStill, findPage, flattenStill } from "./scan-core";
import type { ScanReply, ScanRequest } from "./scan.worker";

export type { FlatPage, Found, StillPage };

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Job = ScanRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

export class Scanner {
  private worker: Worker | null = null;
  private next = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return;
    try {
      this.worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<ScanReply>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error));
      };
      this.worker.onerror = () => this.fail();
    } catch {
      this.worker = null;
    }
  }

  /** The worker broke: every waiting job is retried on the main thread by its caller. */
  private fail() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error("worker"));
    this.pending.clear();
  }

  private send<T>(job: Job, transfer: Transferable[] = []): Promise<T> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("worker"));
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...job, id }, transfer);
    });
  }

  /** The page in a preview frame (the frame's pixels are handed over, not copied). */
  async frame(px: ImageData): Promise<Found> {
    if (!this.worker) return findPage(px);
    return this.send<Found>({ kind: "frame", width: px.width, height: px.height, data: px.data }, [px.data.buffer]);
  }

  async still(blob: Blob): Promise<StillPage> {
    try {
      return await this.send<StillPage>({ kind: "still", blob });
    } catch {
      return findInStill(blob);
    }
  }

  async flatten(blob: Blob, quad: Quad, khata: boolean, quality: number): Promise<FlatPage> {
    try {
      return await this.send<FlatPage>({ kind: "flatten", blob, quad, khata, quality });
    } catch {
      return flattenStill(blob, quad, khata, quality);
    }
  }

  close() {
    this.fail();
  }
}
