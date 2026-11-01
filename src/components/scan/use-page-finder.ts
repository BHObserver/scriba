"use client";

import { type RefObject, useEffect, useState } from "react";
import type { PageStatus } from "./detect";
import { type Quad, dist, scaleQuad } from "./geometry";
import type { Scanner } from "./scanner";
import { LIVE_SIDE } from "./sizes";

/** The page in the live preview, in the video's own pixels. */
export type LivePage = {
  status: PageStatus;
  quad: Quad | null;
  video: { width: number; height: number } | null;
  /** When the page last started holding still (found or locked), for the auto shutter. */
  steadySince: number | null;
};

const IDLE: LivePage = { status: "none", quad: null, video: null, steadySince: null };
/** A frame every this many ms at most (about ten a second). */
const FRAME_MS = 100;
/** Corners moving less than this share of the frame's diagonal between frames is "holding still". */
const STEADY = 0.012;
/** Misses before the outline lets go, so one bad frame doesn't make it flicker. */
const KEEP_FOR = 3;

/**
 * Look for the page in the preview about ten times a second, in the worker (docs/PLAN_V3.md,
 * C2). The outline is smoothed a little so it follows the paper without shaking.
 */
export function usePageFinder(video: RefObject<HTMLVideoElement | null>, scannerRef: RefObject<Scanner | null>, on: boolean): LivePage {
  const [live, setLive] = useState<LivePage>(IDLE);

  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
    let shown: Quad | null = null;
    let last: Quad | null = null;
    let status: PageStatus = "none";
    let misses = 0;
    let steadySince: number | null = null;

    const tick = async () => {
      const started = performance.now();
      const v = video.current;
      const scanner = scannerRef.current;
      if (v && scanner && v.readyState >= 2 && v.videoWidth > 0) {
        const k = Math.min(1, LIVE_SIDE / Math.max(v.videoWidth, v.videoHeight));
        const w = Math.round(v.videoWidth * k);
        const h = Math.round(v.videoHeight * k);
        canvas ??= typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
        if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
        const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          try {
            const found = await scanner.frame(ctx.getImageData(0, 0, w, h));
            if (stopped) return;
            const now = performance.now();
            const quad = found.quad ? scaleQuad(found.quad, v.videoWidth / w, v.videoHeight / h) : null;
            const diag = Math.hypot(v.videoWidth, v.videoHeight);
            if (!quad || found.status === "none") {
              misses++;
              if (misses >= KEEP_FOR) {
                shown = null;
                last = null;
                status = "none";
                steadySince = null;
              }
            } else {
              misses = 0;
              const moved = last ? Math.max(...quad.map((c, i) => dist(c, last![i]!))) / diag : 1;
              // Small moves are smoothed; a jump (a new page, a big move) is followed at once.
              shown = shown && moved < 0.08 ? (shown.map((c, i) => [(c[0] + quad[i]![0]) / 2, (c[1] + quad[i]![1]) / 2]) as unknown as Quad) : quad;
              const holding = (found.status === "found" || found.status === "khata") && moved < STEADY && found.status === status;
              steadySince = holding ? (steadySince ?? now) : null;
              last = quad;
              status = found.status;
            }
            setLive({ status, quad: shown, video: { width: v.videoWidth, height: v.videoHeight }, steadySince });
          } catch {
            // A dropped frame (the worker restarted); the next one will do.
          }
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), Math.max(0, FRAME_MS - (performance.now() - started)));
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      setLive(IDLE);
    };
  }, [on, scannerRef, video]);

  return on ? live : IDLE;
}
