/**
 * Synthetic image byte fixtures built in code, so no photograph is ever committed.
 * They are structurally valid enough for header inspection; they are not meant to
 * be visually meaningful.
 */
import { deflateSync } from "node:zlib";

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u32be(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function pngChunk(type: string, data: Uint8Array): number[] {
  const typeBytes = [...type].map((c) => c.charCodeAt(0));
  const crc = crc32(new Uint8Array([...typeBytes, ...data]));
  return [...u32be(data.length), ...typeBytes, ...data, ...u32be(crc)];
}

export function makePng(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array([...u32be(width), ...u32be(height), 8, 0, 0, 0, 0]);
  const raw = new Uint8Array(height * (width + 1)); // grayscale, filter byte per row
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", ihdr),
    ...pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    ...pngChunk("IEND", new Uint8Array()),
  ]);
}

function segment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, (len >>> 8) & 255, len & 255, ...payload];
}

export function makeJpeg(width: number, height: number, opts: { gps?: boolean; trailer?: boolean } = {}): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (opts.gps !== undefined) {
    // "Exif\0\0" + big-endian TIFF header + IFD0 with one entry
    const tag = opts.gps ? [0x88, 0x25] : [0x01, 0x0f]; // GPSInfo vs Make
    const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, ...tag, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    parts.push(...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]));
  }
  parts.push(...segment(0xc0, [8, (height >>> 8) & 255, height & 255, (width >>> 8) & 255, width & 255, 1, 1, 0x11, 0]));
  parts.push(...segment(0xda, [1, 1, 0, 0, 63, 0]));
  parts.push(0x12, 0x34, 0xff, 0x00, 0x56); // entropy data with a stuffed 0xFF00
  parts.push(0xff, 0xd9);
  if (opts.trailer) parts.push(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70); // e.g. motion-photo data
  return new Uint8Array(parts);
}

export function makeWebpLossless(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const bits = [w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f];
  const vp8l = [0x2f, ...bits, 0, 0, 0, 0, 0];
  const chunk = [0x56, 0x50, 0x38, 0x4c, vp8l.length, 0, 0, 0, ...vp8l];
  const body = [0x57, 0x45, 0x42, 0x50, ...chunk];
  const size = body.length;
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, size & 255, (size >> 8) & 255, 0, 0, ...body]);
}
