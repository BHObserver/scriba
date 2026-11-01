/**
 * The page finder's jobs, runnable in the worker or, where a worker can't draw, on the main
 * thread (docs/PLAN_V3.md, C2): find the page in a preview frame, find it in the still, and
 * flatten the still. Photos are decoded with their EXIF orientation applied, as the tray, the
 * server and the reader show them.
 */

import { type Detection, type Pixels, detectPage } from "./detect";
import { type Quad, capPixels, flatSize, scaleQuad } from "./geometry";
import { KHATA_ASPECT, findKhataCorners } from "./markers";
import { DETECT_SIDE, FLAT_MAX_PIXELS } from "./sizes";
import { warpPage } from "./warp";

export type Found = Detection & { khata: boolean };
/** A still's page: the quad is in the still's own pixels, as displayed. */
export type StillPage = Found & { width: number; height: number };
export type FlatPage = { blob: Blob; width: number; height: number };

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function canvas(width: number, height: number): { canvas: AnyCanvas; ctx: Ctx } {
  const c: AnyCanvas =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = c.getContext("2d", { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new Error("No 2D canvas.");
  return { canvas: c, ctx };
}

function encode(c: AnyCanvas, quality: number): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed."))), "image/jpeg", quality));
}

/** The page in one frame, locked to the Scriba khata's corner squares when they're all there. */
export function findPage(px: Pixels): Found {
  const d = detectPage(px);
  if (!d.quad || d.status === "none") return { ...d, khata: false };
  const exact = findKhataCorners(px, d.quad);
  // A lock overrides "cut": the squares fix the sheet even if its paper edge is hidden.
  return exact ? { status: "khata", quad: exact, fraction: d.fraction, khata: true } : { ...d, khata: false };
}

/** Find the page in a still, at DETECT_SIDE, and return the quad in the still's own pixels. */
export async function findInStill(blob: Blob): Promise<StillPage> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const { width, height } = bitmap;
    const k = Math.min(1, DETECT_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * k));
    const h = Math.max(1, Math.round(height * k));
    const { ctx } = canvas(w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const found = findPage(ctx.getImageData(0, 0, w, h));
    return { ...found, quad: found.quad ? scaleQuad(found.quad, width / w, height / h) : null, width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * The page inside `quad` (in the still's displayed pixels), squared up and encoded as JPEG.
 * A Scriba khata page keeps A5's shape; other paper keeps the lengths of its own edges.
 */
export async function flattenStill(blob: Blob, quad: Quad, khata: boolean, quality: number): Promise<FlatPage> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  let src: Pixels;
  let k: number;
  try {
    // A very large photo is read at the cap; the page can't be bigger than that anyway.
    const size = capPixels({ width: bitmap.width, height: bitmap.height }, FLAT_MAX_PIXELS);
    k = size.width / bitmap.width;
    const { ctx } = canvas(size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    src = ctx.getImageData(0, 0, size.width, size.height);
  } finally {
    bitmap.close();
  }
  const q = scaleQuad(quad, k);
  const { width, height } = capPixels(flatSize(q, khata ? KHATA_ASPECT : undefined), FLAT_MAX_PIXELS);
  const data = warpPage(src, q, width, height);
  const out = canvas(width, height);
  out.ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const encoded = await encode(out.canvas, quality);
  out.canvas.width = 0;
  return { blob: encoded, width, height };
}
