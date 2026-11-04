/**
 * F2 fix 6: a reading's line boxes put on the rows of writing in the photo the model read
 * (`ink-rows.ts`). Server-side only. Every picture of a line in the app, the khata's strips and
 * the handwriting notes' crops take the stored box, so this runs once, when a page is read.
 */
import sharp from "sharp";
import type { NormalizedExtraction } from "@/lib/extraction/parse";
import { type Gray, type LineIn, type SnapResult, snapLines } from "./ink-rows";

/** The width the photo is looked at: a line is about 15 px high, plenty to find its row. */
export const SNAP_WIDTH = 600;

/** The photo as the model saw it (orientation applied), grey, SNAP_WIDTH wide. */
export async function grayForSnap(imageBytes: Uint8Array): Promise<Gray> {
  const { data, info } = await sharp(imageBytes, { failOn: "error" })
    .rotate()
    .greyscale()
    .resize({ width: SNAP_WIDTH })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  if (channels === 1) return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
  const out = new Uint8Array(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i * channels]!;
  return { data: out, width: info.width, height: info.height };
}

/** The lines of a reading as the snapper takes them: a titled block's first line expects a heading above. */
export function linesOf(extraction: NormalizedExtraction): LineIn[] {
  const titled = new Set((extraction.blocks ?? []).filter((b) => b.title != null && b.title.trim() !== "").map((b) => b.id));
  const opened = new Set<string>();
  const byLine = [...extraction.entries].sort((a, b) => a.line - b.line);
  const opens = new Map<string, boolean>();
  for (const e of byLine) {
    const block = e.values.block ?? null;
    const first = block != null && !opened.has(block);
    if (block != null) opened.add(block);
    opens.set(e.candidateId, first && titled.has(block));
  }
  return extraction.entries.map((e) => ({ box: e.bbox, block: e.values.block ?? null, opensTitledBlock: opens.get(e.candidateId) ?? false }));
}

/** The reading with its boxes on the writing, and what the snapper found. */
export function snapExtraction(
  gray: Gray,
  extraction: NormalizedExtraction,
  trace?: (message: string) => void,
): { extraction: NormalizedExtraction; snap: SnapResult } {
  const snap = snapLines(gray, linesOf(extraction), trace);
  if (!snap.applied) return { extraction, snap };
  const entries = extraction.entries.map((e, i) => ({ ...e, bbox: snap.boxes[i] ?? e.bbox }));
  return { extraction: { ...extraction, entries }, snap };
}

/**
 * For the pipeline: never fails a reading. When the photo can't be looked at or the rows don't
 * fit, the model's boxes are kept, as before.
 */
export async function snapReadingBoxes(imageBytes: Uint8Array, extraction: NormalizedExtraction): Promise<NormalizedExtraction> {
  try {
    if (extraction.entries.length === 0) return extraction;
    return snapExtraction(await grayForSnap(imageBytes), extraction).extraction;
  } catch {
    return extraction;
  }
}
