/**
 * Prepares the bytes sent to Meta for a processing mode. Server-side only.
 *
 * A photo that is already large enough and needs no turn is sent as the verified
 * original, untouched. Otherwise a copy is re-encoded in the same format: EXIF
 * orientation is applied first, so the turn is relative to the photo as the
 * browser displayed it to the user, and metadata (including any GPS location) is
 * not carried into the copy.
 *
 * Small photos are upscaled. Meta resizes images itself and stops adding image
 * tokens at about 3.3 megapixels (4,263 tokens, measured 30 Oct 2026). A
 * WhatsApp-sized 958x1280 photo reached the model as only 1,777 tokens, and the
 * handwritten digits were misread more often.
 *
 * Changing what is sent here must bump the version in extractionCacheKey, so a
 * result from the old preparation is never reused for the new one.
 */
import sharp from "sharp";
import { type ProcessingMode, turnsForProcessingMode } from "./orientation";

export type PreparedImage = { imageBytes: Uint8Array; mimeType: string };

/** Above this, Meta downsizes the image and the model sees no extra detail. */
export const MODEL_TARGET_PIXELS = 3_300_000;

export async function prepareImageForModel(imageBytes: Uint8Array, mimeType: string, mode: ProcessingMode): Promise<PreparedImage> {
  const turns = turnsForProcessingMode(mode);
  const { width = 0, height = 0 } = await sharp(imageBytes, { failOn: "error" }).metadata();
  const scale = width * height > 0 && width * height < MODEL_TARGET_PIXELS ? Math.sqrt(MODEL_TARGET_PIXELS / (width * height)) : 1;
  if (turns === 0 && scale === 1) return { imageBytes, mimeType };

  let image = sharp(imageBytes, { failOn: "error" }).autoOrient().rotate(turns * 90);
  if (scale > 1) {
    // The long edge is the same before and after a turn, so this bound is orientation-proof.
    const longEdge = Math.floor(Math.max(width, height) * scale);
    image = image.resize({ width: longEdge, height: longEdge, fit: "inside", kernel: "lanczos3" });
  }
  const encoded =
    mimeType === "image/png"
      ? image.png()
      : mimeType === "image/webp"
        ? image.webp({ quality: 92 })
        : image.jpeg({ quality: 92, chromaSubsampling: "4:4:4" });
  return { imageBytes: new Uint8Array(await encoded.toBuffer()), mimeType: mimeType === "image/png" || mimeType === "image/webp" ? mimeType : "image/jpeg" };
}
