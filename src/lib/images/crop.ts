/**
 * Real image crops of handwritten lines, for what leaves the screen: a reminder's attachment
 * and (P3) reference examples. On screen, strips are CSS crops of the signed photo instead.
 *
 * A line's box is on the model's 0–1000 grid of the photo as it was read: EXIF orientation
 * applied, then the reading's quarter turns. Crops are made from that same upright image.
 * The output is a fresh JPEG: no metadata (and so no GPS location) is carried over.
 */
import sharp from "sharp";
import type { BlockCrop } from "@/lib/extraction/two-pass";
import type { BoundingBox } from "@/lib/ledger/types";
import type { QuarterTurns } from "./orientation";
import { MODEL_TARGET_PIXELS, type PreparedImage } from "./rotate";

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

/** U3: a block's crop is upscaled toward MODEL_TARGET_PIXELS like a small photo, but at most this much per side. */
const MAX_CROP_UPSCALE = 3;

/**
 * U3: blocks cut from the page for a two-pass reading, from the image as the model saw it (EXIF
 * orientation applied; a prepared copy is already upright). Each crop is a fresh JPEG, upscaled
 * like a small photo. The rect returned is the one actually cut, after rounding to whole pixels,
 * so the crop's boxes map back to the page exactly.
 */
export async function cropBlocksForReading(page: PreparedImage, rects: BoundingBox[]): Promise<BlockCrop[]> {
  const { data, info } = await sharp(page.imageBytes, { failOn: "error" }).rotate().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const grid = (px: number, size: number) => Math.round((px / size) * 100_000) / 100;
  return Promise.all(
    rects.map(async (r) => {
      const left = Math.min(width - 1, Math.max(0, Math.floor((r.x_min / 1000) * width)));
      const top = Math.min(height - 1, Math.max(0, Math.floor((r.y_min / 1000) * height)));
      const right = Math.min(width, Math.max(left + 1, Math.ceil((r.x_max / 1000) * width)));
      const bottom = Math.min(height, Math.max(top + 1, Math.ceil((r.y_max / 1000) * height)));
      const [w, h] = [right - left, bottom - top];
      const scale = w * h < MODEL_TARGET_PIXELS ? Math.min(MAX_CROP_UPSCALE, Math.sqrt(MODEL_TARGET_PIXELS / (w * h))) : 1;
      let image = sharp(data, { raw: { width, height, channels } }).extract({ left, top, width: w, height: h });
      if (scale > 1) image = image.resize({ width: Math.round(w * scale), height: Math.round(h * scale), kernel: "lanczos3" });
      const bytes = await image.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
      return {
        image: { imageBytes: new Uint8Array(bytes), mimeType: "image/jpeg" },
        rect: { x_min: grid(left, width), y_min: grid(top, height), x_max: grid(right, width), y_max: grid(bottom, height) },
      };
    }),
  );
}

/** History thumbnails come in two widths: the day list's small page and the day view's card. */
export const THUMB_WIDTHS = [96, 320] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

/** The whole page, upright as it was read, scaled to `width` as a small JPEG without metadata. */
export async function pageThumbnail(bytes: Uint8Array, turns: QuarterTurns, width: ThumbWidth): Promise<Buffer> {
  // Shrink while decoding (EXIF orientation applied in the same pass), then turn the small copy.
  // A quarter turn makes the photo's height the thumbnail's width.
  const sideways = turns % 2 === 1;
  const small = await sharp(bytes, { failOn: "error" })
    .rotate()
    .resize(sideways ? { height: width, withoutEnlargement: true } : { width, withoutEnlargement: true })
    .toBuffer();
  return sharp(small)
    .rotate(turns * 90)
    .jpeg({ quality: width > 100 ? 72 : 65 })
    .toBuffer();
}
