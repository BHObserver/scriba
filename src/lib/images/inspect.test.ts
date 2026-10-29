import { describe, expect, test } from "bun:test";
import { sha256Hex } from "@/lib/extraction/cache-key";
import { makeJpeg, makePng, makeWebpLossless } from "../../../tests/helpers/image-fixtures";
import { inspectImage } from "./inspect";

describe("supported images", () => {
  test("PNG dimensions", () => {
    const r = inspectImage(makePng(640, 480));
    expect(r).toMatchObject({ ok: true, mimeType: "image/png", width: 640, height: 480 });
  });

  test("JPEG dimensions and GPS metadata detection", () => {
    expect(inspectImage(makeJpeg(1200, 900))).toMatchObject({ ok: true, width: 1200, height: 900, hasExif: false });
    expect(inspectImage(makeJpeg(1200, 900, { gps: true }))).toMatchObject({ ok: true, hasExif: true, hasGpsMetadata: true });
    expect(inspectImage(makeJpeg(1200, 900, { gps: false }))).toMatchObject({ ok: true, hasExif: true, hasGpsMetadata: false });
  });

  test("JPEG with data after the end-of-image marker is accepted", () => {
    expect(inspectImage(makeJpeg(800, 600, { trailer: true })).ok).toBe(true);
  });

  test("WebP lossless dimensions", () => {
    expect(inspectImage(makeWebpLossless(300, 200))).toMatchObject({ ok: true, mimeType: "image/webp", width: 300, height: 200 });
  });
});

describe("rejected files", () => {
  test("unsupported type (a PDF / text file)", () => {
    expect(inspectImage(new TextEncoder().encode("%PDF-1.7 hello"))).toMatchObject({ ok: false, reason: "unsupported_type" });
  });

  test("a renamed file is identified by its bytes, not its name or claimed type", () => {
    expect(inspectImage(new TextEncoder().encode("GIF89a......"))).toMatchObject({ ok: false });
  });

  test("HEIC gets a specific, actionable message", () => {
    const heic = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
    expect(inspectImage(heic)).toMatchObject({ ok: false, reason: "heic" });
  });

  test("truncated JPEG (no end-of-image marker) is corrupt", () => {
    const full = makeJpeg(800, 600);
    expect(inspectImage(full.subarray(0, full.length - 2))).toMatchObject({ ok: false, reason: "corrupt" });
  });

  test("truncated PNG (no IEND) is corrupt", () => {
    const full = makePng(64, 64);
    expect(inspectImage(full.subarray(0, full.length - 12))).toMatchObject({ ok: false, reason: "corrupt" });
  });

  test("truncated WebP is corrupt", () => {
    const full = makeWebpLossless(64, 64);
    expect(inspectImage(full.subarray(0, full.length - 3))).toMatchObject({ ok: false, reason: "corrupt" });
  });

  test("empty, tiny and oversized images", () => {
    expect(inspectImage(new Uint8Array())).toMatchObject({ ok: false, reason: "empty" });
    expect(inspectImage(makePng(10, 10))).toMatchObject({ ok: false, reason: "too_small" });
    expect(inspectImage(makeJpeg(13000, 100))).toMatchObject({ ok: false, reason: "too_large_dimensions" });
  });
});

describe("byte integrity", () => {
  test("inspection never modifies the original bytes", () => {
    const bytes = makeJpeg(1024, 768, { gps: true });
    const before = sha256Hex(bytes);
    inspectImage(bytes);
    expect(sha256Hex(bytes)).toBe(before);
  });

  test("checksum is stable and sensitive to a single changed byte", () => {
    const a = makePng(64, 64);
    const b = new Uint8Array(a);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
    b[40] = b[40]! ^ 1;
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });
});
