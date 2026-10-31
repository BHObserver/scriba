/**
 * Real image crops of handwritten lines, for what leaves the screen: a reminder's attachment
 * and (P3) reference examples. On screen, strips are CSS crops of the signed photo instead.
 *
 * A line's box is on the model's 0–1000 grid of the photo as it was read: EXIF orientation
 * applied, then the reading's quarter turns. Crops are made from that same upright image.
 * The output is a fresh JPEG: no metadata (and so no GPS location) is carried over.
 */
import sharp from "sharp";
import type { BoundingBox } from "@/lib/ledger/types";
import type { QuarterTurns } from "./orientation";

export type PixelRect = { left: number; top: number; width: number; height: number };

/** The box in pixels of a width × height image, padded so ascenders and the line's ends aren't cut. */
export function lineRect(box: BoundingBox, width: number, height: number): PixelRect | null {
  const clamp = (n: number) => Math.min(1000, Math.max(0, n));
  const [x0, x1] = [clamp(box.x_min), clamp(box.x_max)].sort((a, b) => a - b) as [number, number];
  const [y0, y1] = [clamp(box.y_min), clamp(box.y_max)].sort((a, b) => a - b) as [number, number];
  if (width <= 0 || height <= 0 || x1 - x0 < 1 || y1 - y0 < 1) return null;
  const padX = 10;
  const padY = Math.max(6, (y1 - y0) * 0.3);
  const left = Math.floor((clamp(x0 - padX) / 1000) * width);
  const top = Math.floor((clamp(y0 - padY) / 1000) * height);
  const right = Math.ceil((clamp(x1 + padX) / 1000) * width);
  const bottom = Math.ceil((clamp(y1 + padY) / 1000) * height);
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export type LineCrop = { photoKey: string; bytes: Uint8Array; turns: QuarterTurns; box: BoundingBox };

export const CROP_WIDTH = 900;
const GAP = 12;
const PAPER = { r: 0xf7, g: 0xf1, b: 0xe3 };

/** The lines, top to bottom in the order given, as one JPEG `CROP_WIDTH` wide. Null when none can be cut. */
export async function stackLineCrops(lines: readonly LineCrop[]): Promise<Buffer | null> {
  const upright = new Map<string, Promise<{ data: Buffer; width: number; height: number }>>();
  const uprightOf = (l: LineCrop) => {
    let p = upright.get(l.photoKey);
    if (!p) {
      p = sharp(l.bytes, { failOn: "error" })
        .rotate()
        .toBuffer()
        .then((b) => sharp(b).rotate(l.turns * 90).toBuffer({ resolveWithObject: true }))
        .then(({ data, info }) => ({ data, width: info.width, height: info.height }));
      upright.set(l.photoKey, p);
    }
    return p;
  };

  const parts: Array<{ input: Buffer; height: number }> = [];
  for (const l of lines) {
    const photo = await uprightOf(l);
    const rect = lineRect(l.box, photo.width, photo.height);
    if (!rect) continue;
    const { data, info } = await sharp(photo.data).extract(rect).resize({ width: CROP_WIDTH }).toBuffer({ resolveWithObject: true });
    parts.push({ input: data, height: info.height });
  }
  if (parts.length === 0) return null;

  const height = parts.reduce((sum, p) => sum + p.height, 0) + GAP * (parts.length - 1);
  let top = 0;
  const composite = parts.map((p) => {
    const at = top;
    top += p.height + GAP;
    return { input: p.input, top: at, left: 0 };
  });
  return sharp({ create: { width: CROP_WIDTH, height, channels: 3, background: PAPER } })
    .composite(composite)
    .jpeg({ quality: 82 })
    .toBuffer();
}
