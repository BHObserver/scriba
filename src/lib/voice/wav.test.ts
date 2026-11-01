import { describe, expect, test } from "bun:test";
import { VOICE_SAMPLE_RATE, encodeWav, readWavInfo, wavProblem } from "./wav";

const limits = { minMs: 300, maxMs: 15_000 };
const tone = (seconds: number, rate = VOICE_SAMPLE_RATE) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => Math.sin(i / 10));

describe("encodeWav → readWavInfo", () => {
  test("round-trips the format Meta accepts", () => {
    const wav = encodeWav(tone(2), VOICE_SAMPLE_RATE);
    expect(wav.length).toBe(44 + 2 * 48_000);
    expect(readWavInfo(wav)).toEqual({ format: 1, channels: 1, sampleRate: 24_000, bitsPerSample: 16, dataBytes: 96_000, durationMs: 2000 });
    expect(wavProblem(readWavInfo(wav), limits)).toBeNull();
  });

  test("clips samples outside [-1, 1] instead of wrapping", () => {
    const wav = encodeWav(Float32Array.from([2, -2, 0]), 16_000);
    const view = new DataView(wav.buffer);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([32767, -32768, 0]);
  });
});

describe("readWavInfo", () => {
  test("skips chunks before the audio (LIST, fact)", () => {
    const plain = encodeWav(tone(1, 16_000), 16_000);
    const list = new Uint8Array([..."LIST"].map((c) => c.charCodeAt(0)).concat([3, 0, 0, 0, 1, 2, 3, 0]));
    const wav = new Uint8Array([...plain.subarray(0, 36), ...list, ...plain.subarray(36)]);
    expect(readWavInfo(wav)?.durationMs).toBe(1000);
  });

  test("not a WAV file", () => {
    expect(readWavInfo(new Uint8Array(10))).toBeNull();
    expect(readWavInfo(new TextEncoder().encode("x".repeat(100)))).toBeNull();
    expect(wavProblem(null, limits)).toBe("not_wav");
  });
});

describe("wavProblem", () => {
  const base = { format: 1, channels: 1, sampleRate: 24_000, bitsPerSample: 16, dataBytes: 0, durationMs: 2000 };
  test.each([
    [{ ...base, channels: 2 }, "wrong_format"],
    [{ ...base, sampleRate: 44_100 }, "wrong_format"],
    [{ ...base, bitsPerSample: 32 }, "wrong_format"],
    [{ ...base, format: 3 }, "wrong_format"],
    [{ ...base, durationMs: 100 }, "too_short"],
    [{ ...base, durationMs: 15_001 }, "too_long"],
    [{ ...base, sampleRate: 16_000 }, null],
  ])("%o → %s", (info, problem) => {
    expect(wavProblem(info, limits)).toBe(problem as never);
  });
});
