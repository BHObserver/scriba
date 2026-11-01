/**
 * The shutter's photo (docs/PLAN_V3.md, C1).
 *
 * A real still from the camera (`ImageCapture.takePhoto`, Chrome and Edge on Android) is sharper
 * than a frame of the preview video and focused for a still. It is usually 3:4, which fits a page
 * better than the preview's 9:16, so the page fills more of it. Without `ImageCapture` (Safari,
 * Firefox), or when the still fails, takes too long or isn't the same way up as the preview he
 * framed the page in, the shot is the preview's frame at the moment he pressed, as before.
 *
 * The result is the original: it is stored and read as it is, never resized later.
 */

export type Size = { width: number; height: number };

/** Stills above this are scaled down: plenty for a page (the model sees about 3.3 MP), and quick to upload. */
export const STILL_MAX_PIXELS = 12_000_000;
const STILL_TIMEOUT_MS = 5_000;
/** Each try at fitting the upload limit shrinks the sides by this much. */
const SHRINK = 0.8;
const ENCODE_TRIES = 3;

/** A still is used only when it is the same way up as the preview. A square fits either. */
export function sameOrientation(a: Size, b: Size): boolean {
  if (a.width === a.height || b.width === b.height) return true;
  return a.height > a.width === b.height > b.width;
}

/** The size to encode a still at: scaled down to at most `maxPixels`, never up. */
export function fitPixels(size: Size, maxPixels: number): Size {
  const pixels = size.width * size.height;
  if (pixels <= maxPixels) return size;
  const k = Math.sqrt(maxPixels / pixels);
  return { width: Math.max(1, Math.floor(size.width * k)), height: Math.max(1, Math.floor(size.height * k)) };
}

/** The camera's own JPEG is kept when it already fits, so it isn't compressed twice. */
export function keepsAsTaken(still: { type: string; bytes: number; size: Size }, maxBytes: number): boolean {
  return still.type === "image/jpeg" && still.bytes <= maxBytes && still.size.width * still.size.height <= STILL_MAX_PIXELS;
}

type PhotoCapture = { takePhoto(): Promise<Blob> };
type PhotoCaptureClass = new (track: MediaStreamTrack) => PhotoCapture;

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error: unknown) => (clearTimeout(timer), reject(error)),
    );
  });
}

/** The still drawn at `size`, shrunk until the JPEG fits `maxBytes`. Null when it never does. */
async function encodeWithin(bitmap: ImageBitmap, size: Size, opts: { maxBytes: number; quality: number }): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  let { width, height } = size;
  try {
    for (let i = 0; i < ENCODE_TRIES; i++) {
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
      const blob = await toJpeg(canvas, opts.quality);
      if (blob && blob.size <= opts.maxBytes) return blob;
      width = Math.floor(width * SHRINK);
      height = Math.floor(height * SHRINK);
    }
    return null;
  } finally {
    canvas.width = 0;
  }
}

/** A full-resolution still the same way up as the preview, or null to fall back to the frame. */
async function takeStill(track: MediaStreamTrack, preview: Size, opts: { maxBytes: number; quality: number }): Promise<Blob | null> {
  const ImageCaptureClass = (globalThis as { ImageCapture?: PhotoCaptureClass }).ImageCapture;
  if (!ImageCaptureClass || track.readyState !== "live") return null;
  try {
    const blob = await withTimeout(new ImageCaptureClass(track).takePhoto(), STILL_TIMEOUT_MS);
    if (!blob || blob.size === 0) return null;
    // EXIF orientation applied, as the tray and the server will show it.
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    try {
      const size = { width: bitmap.width, height: bitmap.height };
      if (!sameOrientation(size, preview)) return null;
      if (keepsAsTaken({ type: blob.type, bytes: blob.size, size }, opts.maxBytes)) return blob;
      return await encodeWithin(bitmap, fitPixels(size, STILL_MAX_PIXELS), opts);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/**
 * The shot for one press of the shutter: a still when the camera gives a good one, else the
 * preview's frame from the moment he pressed. Null only when neither can be encoded.
 */
export async function takeShot(
  video: HTMLVideoElement,
  track: MediaStreamTrack | null,
  opts: { maxBytes: number; quality: number },
): Promise<Blob | null> {
  const frame = document.createElement("canvas");
  frame.width = video.videoWidth;
  frame.height = video.videoHeight;
  frame.getContext("2d")?.drawImage(video, 0, 0);
  try {
    const still = track ? await takeStill(track, { width: frame.width, height: frame.height }, opts) : null;
    return still ?? (await toJpeg(frame, opts.quality));
  } finally {
    frame.width = 0;
  }
}
