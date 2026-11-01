/**
 * The one audio format Muse Voice Transcribe accepts for a file: a RIFF/WAVE container holding
 * mono 16-bit integer PCM at 16 or 24 kHz. The browser encodes it (encodeWav); the server checks
 * it before spending a request (readWavInfo). Both are pure and run anywhere.
 */

/** The model's native rate, per Meta's speech-to-text guide. */
export const VOICE_SAMPLE_RATE = 24_000;
export const ACCEPTED_SAMPLE_RATES = [16_000, 24_000] as const;

/** Float samples in [-1, 1] → a 44-byte-header PCM16 WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export type WavInfo = {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
  durationMs: number;
};

/** The header of a WAV file, or null when it isn't one. Walks the chunks, so LIST/fact chunks are fine. */
export function readWavInfo(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let fmt: Omit<WavInfo, "dataBytes" | "durationMs"> | null = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!fmt || fmt.sampleRate === 0 || fmt.channels === 0 || fmt.bitsPerSample === 0) return null;
      const dataBytes = Math.min(size, bytes.length - body);
      const bytesPerSecond = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
      return { ...fmt, dataBytes, durationMs: Math.round((dataBytes / bytesPerSecond) * 1000) };
    }
    at = body + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

export type WavProblem = "not_wav" | "wrong_format" | "too_short" | "too_long";

/** Why a clip can't be sent, or null when it can: mono PCM16 at 16/24 kHz, within the length limits. */
export function wavProblem(info: WavInfo | null, limits: { minMs: number; maxMs: number }): WavProblem | null {
  if (!info) return "not_wav";
  const rateOk = (ACCEPTED_SAMPLE_RATES as readonly number[]).includes(info.sampleRate);
  if (info.format !== 1 || info.channels !== 1 || info.bitsPerSample !== 16 || !rateOk) return "wrong_format";
  if (info.durationMs < limits.minMs) return "too_short";
  if (info.durationMs > limits.maxMs) return "too_long";
  return null;
}
