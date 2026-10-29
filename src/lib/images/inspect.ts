/**
 * Inspect uploaded image bytes without decoding or modifying them.
 *
 * Works on Uint8Array only, so it runs in the browser (pre-upload checks) and on
 * the server (authoritative checks). It identifies the real format from magic
 * bytes, reads dimensions from the header, detects truncated files, and notes
 * EXIF GPS metadata so the user can be warned before an untouched original is
 * sent to the model.
 */

export const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const EXTENSION_FOR: Record<SupportedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const IMAGE_LIMITS = {
  minSide: 32,
  maxSide: 12_000,
  maxPixels: 60_000_000,
} as const;

export type ImageInspection =
  | {
      ok: true;
      mimeType: SupportedMimeType;
      width: number;
      height: number;
      hasExif: boolean;
      hasGpsMetadata: boolean;
    }
  | { ok: false; reason: ImageRejection; message: string };

export type ImageRejection = "unsupported_type" | "heic" | "corrupt" | "too_small" | "too_large_dimensions" | "empty";

const ascii = (b: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...b.subarray(start, start + length));

function reject(reason: ImageRejection, message: string): ImageInspection {
  return { ok: false, reason, message };
}

export function sniffMimeType(b: Uint8Array): SupportedMimeType | "heic" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heim|heis)$/.test(ascii(b, 8, 4))) {
    return "heic";
  }
  return null;
}

// ---------------------------------------------------------------------------

type Dimensions = { width: number; height: number; hasExif?: boolean; hasGpsMetadata?: boolean };

function inspectPng(b: Uint8Array): Dimensions | null {
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // A complete PNG ends with an IEND chunk: length(4) "IEND" crc(4).
  if (b.length < 12 || ascii(b, b.length - 8, 4) !== "IEND") return null;
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function exifHasGps(b: Uint8Array, start: number, length: number): boolean {
  // APP1 payload: "Exif\0\0" then a TIFF header.
  if (length < 14 || ascii(b, start, 4) !== "Exif") return false;
  const tiff = start + 6;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const order = ascii(b, tiff, 2);
  const little = order === "II";
  if (!little && order !== "MM") return false;
  const u16 = (o: number) => v.getUint16(o, little);
  const u32 = (o: number) => v.getUint32(o, little);
  const end = start + length;
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > end) return false;
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > end) return false;
    if (u16(entry) === 0x8825) return true; // GPSInfo IFD pointer
  }
  return false;
}

function inspectJpeg(b: Uint8Array): Dimensions | null {
  let offset = 2;
  let dims: { width: number; height: number } | null = null;
  let hasExif = false;
  let hasGpsMetadata = false;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);

  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null;
    const marker = b[offset + 1]!;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = v.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > b.length) return null;
    const payload = offset + 4;

    if (marker === 0xe1 && !hasExif && ascii(b, payload, 4) === "Exif") {
      hasExif = true;
      try {
        hasGpsMetadata = exifHasGps(b, payload, length - 2);
      } catch {
        hasGpsMetadata = false;
      }
    }
    if (JPEG_SOF.has(marker) && length >= 7) {
      dims = { height: v.getUint16(payload + 1), width: v.getUint16(payload + 3) };
    }
    if (marker === 0xda) {
      // Start of scan: entropy-coded data follows. A complete file has an EOI
      // marker after it. Data after EOI (e.g. a motion-photo trailer) is allowed.
      const scanStart = offset + 2 + length;
      for (let i = scanStart; i + 1 < b.length; i++) {
        if (b[i] === 0xff && b[i + 1] === 0xd9) {
          return dims ? { ...dims, hasExif, hasGpsMetadata } : null;
        }
      }
      return null; // truncated: no end-of-image marker
    }
    offset += 2 + length;
  }
  return null;
}

function inspectWebp(b: Uint8Array): Dimensions | null {
  if (b.length < 30) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const riffSize = v.getUint32(4, true);
  if (riffSize + 8 > b.length) return null; // truncated
  const chunk = ascii(b, 12, 4);
  const u24 = (o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const b0 = b[21]!, b1 = b[22]!, b2 = b[23]!, b3 = b[24]!;
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === "VP8X") {
    const flags = b[20]!;
    return { width: 1 + u24(24), height: 1 + u24(27), hasExif: (flags & 0x08) !== 0 };
  }
  return null;
}

export function inspectImage(bytes: Uint8Array): ImageInspection {
  if (bytes.length === 0) return reject("empty", "The file is empty.");
  const type = sniffMimeType(bytes);
  if (type === "heic") {
    return reject("heic", "HEIC photos are not supported by the model. Export the photo as JPEG and upload that.");
  }
  if (!type) return reject("unsupported_type", "Only JPEG, PNG and WebP photographs are supported.");

  let dims: Dimensions | null = null;
  try {
    dims = type === "image/png" ? inspectPng(bytes) : type === "image/jpeg" ? inspectJpeg(bytes) : inspectWebp(bytes);
  } catch {
    dims = null;
  }
  if (!dims || dims.width <= 0 || dims.height <= 0) {
    return reject("corrupt", "The image appears to be damaged or incomplete. Try exporting or copying it again.");
  }
  if (dims.width < IMAGE_LIMITS.minSide || dims.height < IMAGE_LIMITS.minSide) {
    return reject("too_small", `The image is too small (${dims.width}×${dims.height}) to read handwriting.`);
  }
  if (
    dims.width > IMAGE_LIMITS.maxSide ||
    dims.height > IMAGE_LIMITS.maxSide ||
    dims.width * dims.height > IMAGE_LIMITS.maxPixels
  ) {
    return reject("too_large_dimensions", `The image dimensions (${dims.width}×${dims.height}) exceed Scriba's limit.`);
  }
  return {
    ok: true,
    mimeType: type,
    width: dims.width,
    height: dims.height,
    hasExif: dims.hasExif ?? false,
    hasGpsMetadata: dims.hasGpsMetadata ?? false,
  };
}
