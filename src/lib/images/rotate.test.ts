import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { makePng } from "../../../tests/helpers/image-fixtures";
import { inspectImage } from "./inspect";
import { describeTurns, processingModeForTurns, turnsForProcessingMode } from "./orientation";
import { MODEL_TARGET_PIXELS, prepareImageForModel } from "./rotate";

describe("orientation modes", () => {
  test("quarter turns map to processing modes and back", () => {
    expect([0, 1, 2, 3].map(processingModeForTurns)).toEqual(["baseline_original", "rotate_90", "rotate_180", "rotate_270"]);
    expect(processingModeForTurns(4)).toBe("baseline_original");
    expect(processingModeForTurns(-1)).toBe("rotate_270");
    expect(turnsForProcessingMode("rotate_270")).toBe(3);
    expect(turnsForProcessingMode("something_else")).toBe(0);
    expect(describeTurns(1)).toBe("turned 90° clockwise");
  });
});

describe("preparing the image for Meta", () => {
  // Above MODEL_TARGET_PIXELS, so no upscaling is involved.
  const LARGE: [number, number] = [2100, 1600];

  test("a large photo in the original mode is sent as the verified bytes, untouched", async () => {
    const original = makePng(...LARGE);
    const prepared = await prepareImageForModel(original, "image/png", "baseline_original");
    expect(prepared.imageBytes).toBe(original);
    expect(prepared.mimeType).toBe("image/png");
  });

  test("a quarter turn swaps the dimensions and keeps the format", async () => {
    const prepared = await prepareImageForModel(makePng(...LARGE), "image/png", "rotate_90");
    const inspection = inspectImage(prepared.imageBytes);
    expect(inspection.ok && [inspection.mimeType, inspection.width, inspection.height]).toEqual(["image/png", 1600, 2100]);
  });

  test("a JPEG stays a JPEG, and a half turn keeps the dimensions", async () => {
    const jpeg = new Uint8Array(await sharp(makePng(...LARGE)).jpeg().toBuffer());
    const prepared = await prepareImageForModel(jpeg, "image/jpeg", "rotate_180");
    const inspection = inspectImage(prepared.imageBytes);
    expect(inspection.ok && [inspection.mimeType, inspection.width, inspection.height]).toEqual(["image/jpeg", 2100, 1600]);
  });

  test("a small photo is upscaled to the model's detail limit, keeping its shape and turn", async () => {
    const jpeg = new Uint8Array(await sharp(makePng(960, 1280)).jpeg().toBuffer());
    const upright = inspectImage((await prepareImageForModel(jpeg, "image/jpeg", "baseline_original")).imageBytes);
    const turned = inspectImage((await prepareImageForModel(jpeg, "image/jpeg", "rotate_90")).imageBytes);
    if (!upright.ok || !turned.ok) throw new Error("prepared image did not decode");
    expect(upright.width * upright.height).toBeGreaterThan(MODEL_TARGET_PIXELS * 0.99);
    expect(upright.width * upright.height).toBeLessThanOrEqual(MODEL_TARGET_PIXELS);
    expect(upright.height / upright.width).toBeCloseTo(1280 / 960, 2);
    expect([turned.width, turned.height]).toEqual([upright.height, upright.width]);
  });

  test("undecodable bytes are rejected, not passed on", async () => {
    await expect(prepareImageForModel(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg", "rotate_90")).rejects.toThrow();
  });
});
