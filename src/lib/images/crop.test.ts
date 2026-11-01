import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { CROP_WIDTH, cropBlocksForReading, lineRect, stackLineCrops } from "./crop";

describe("lineRect", () => {
  test("maps the 0–1000 grid to pixels with padding, clamped to the photo", () => {
    expect(lineRect({ x_min: 100, y_min: 500, x_max: 900, y_max: 540 }, 2000, 1000)).toEqual({ left: 180, top: 488, width: 1640, height: 64 });
    expect(lineRect({ x_min: 0, y_min: 0, x_max: 1000, y_max: 30 }, 1000, 1000)).toEqual({ left: 0, top: 0, width: 1000, height: 39 });
  });

  test("puts swapped corners in order and refuses empty boxes", () => {
    expect(lineRect({ x_min: 900, y_min: 540, x_max: 100, y_max: 500 }, 2000, 1000)).toEqual(lineRect({ x_min: 100, y_min: 500, x_max: 900, y_max: 540 }, 2000, 1000));
    expect(lineRect({ x_min: 100, y_min: 500, x_max: 100, y_max: 540 }, 2000, 1000)).toBeNull();
    expect(lineRect({ x_min: 100, y_min: 500, x_max: 900, y_max: 540 }, 0, 1000)).toBeNull();
  });
});

describe("stackLineCrops", () => {
  test("crops from the upright, turned photo and stacks the lines into one JPEG", async () => {
    // 400×200 photo: left half black, right half white. Turned once (90° clockwise) it is
    // 200×400 with the black half on top.
    const photo = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#fff" } })
      .composite([{ input: { create: { width: 200, height: 200, channels: 3, background: "#000" } }, left: 0, top: 0 }])
      .png()
      .toBuffer();
    const top = { x_min: 100, y_min: 100, x_max: 900, y_max: 300 };
    const bottom = { x_min: 100, y_min: 700, x_max: 900, y_max: 900 };
    const out = await stackLineCrops([
      { photoKey: "p", bytes: photo, turns: 1, box: top },
      { photoKey: "p", bytes: photo, turns: 1, box: bottom },
    ]);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(CROP_WIDTH);
    const { data, info } = await sharp(out!).greyscale().raw().toBuffer({ resolveWithObject: true });
    const at = (y: number) => data[y * info.width + Math.floor(info.width / 2)]!;
    expect(at(5)).toBeLessThan(40); // the first crop is from the black (top) half
    expect(at(info.height - 5)).toBeGreaterThan(215); // the last from the white half
  });

  test("returns null when no line has a usable box", async () => {
    const photo = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    expect(await stackLineCrops([{ photoKey: "p", bytes: photo, turns: 0, box: { x_min: 5, y_min: 5, x_max: 5, y_max: 9 } }])).toBeNull();
    expect(await stackLineCrops([])).toBeNull();
  });
});

describe("cropBlocksForReading (U3)", () => {
  const halves = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#fff" } }).composite([
      { input: { create: { width: width / 2, height, channels: 3, background: "#000" } }, left: 0, top: 0 },
    ]);
  const centre = async (bytes: Uint8Array) => {
    const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
    return data[Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)]!;
  };

  test("cuts each rect, upscales a small block (at most 3× per side) and says what it cut, in whole pixels", async () => {
    const page = { imageBytes: new Uint8Array(await halves(1000, 600).png().toBuffer()), mimeType: "image/png" };
    const [left, right] = await cropBlocksForReading(page, [
      { x_min: 0, y_min: 0, x_max: 500, y_max: 1000 },
      { x_min: 500.4, y_min: 100, x_max: 1000, y_max: 900 },
    ]);
    expect(left!.rect).toEqual({ x_min: 0, y_min: 0, x_max: 500, y_max: 1000 });
    expect(right!.rect).toEqual({ x_min: 500, y_min: 100, x_max: 1000, y_max: 900 });
    expect(left!.image.mimeType).toBe("image/jpeg");
    expect(await sharp(left!.image.imageBytes).metadata()).toMatchObject({ format: "jpeg", width: 1500, height: 1800 });
    expect(await sharp(right!.image.imageBytes).metadata()).toMatchObject({ width: 1500, height: 1440 });
    expect(await centre(left!.image.imageBytes)).toBeLessThan(40);
    expect(await centre(right!.image.imageBytes)).toBeGreaterThan(215);
  });

  test("a block already as large as the model sees is not resized", async () => {
    const page = { imageBytes: new Uint8Array(await halves(2000, 2000).jpeg().toBuffer()), mimeType: "image/jpeg" };
    const [all] = await cropBlocksForReading(page, [{ x_min: 0, y_min: 0, x_max: 1000, y_max: 1000 }]);
    expect(await sharp(all!.image.imageBytes).metadata()).toMatchObject({ width: 2000, height: 2000 });
  });

  test("cuts from the photo as displayed: EXIF orientation is applied first", async () => {
    // 400×200 stored, left half black; orientation 6 shows it turned clockwise: 200×400, black on top.
    const stored = await halves(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const [top] = await cropBlocksForReading({ imageBytes: new Uint8Array(stored), mimeType: "image/jpeg" }, [{ x_min: 0, y_min: 0, x_max: 1000, y_max: 500 }]);
    expect(await sharp(top!.image.imageBytes).metadata()).toMatchObject({ width: 600, height: 600 });
    expect(await centre(top!.image.imageBytes)).toBeLessThan(40);
  });
});
