/**
 * Browser recording for the fix sheet (P1): the microphone through MediaRecorder (webm/opus in
 * Chrome, mp4 in Safari), then decoded and resampled to 24 kHz mono and encoded as PCM16 WAV,
 * the one format Muse Voice Transcribe takes. Client-only.
 */
import { VOICE_SAMPLE_RATE, encodeWav } from "./wav";

/** The server refuses longer clips; recording stops itself just before. */
export const MAX_CLIP_MS = 15_000;

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined" &&
    typeof OfflineAudioContext !== "undefined"
  );
}

export type Recording = { stop: () => Promise<Uint8Array>; cancel: () => void };

/** Ask for the microphone and start recording. Rejects when he refuses the microphone. */
export async function startRecording(onLimit: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  const timer = setTimeout(onLimit, MAX_CLIP_MS - 250);
  const end = () => {
    clearTimeout(timer);
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  };
  recorder.start();
  return {
    async stop() {
      end();
      await stopped;
      return toWav(new Blob(chunks, { type: recorder.mimeType }));
    },
    cancel: end,
  };
}

async function toWav(blob: Blob): Promise<Uint8Array> {
  const decoded = await new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE).decodeAudioData(await blob.arrayBuffer());
  // A one-channel context mixes stereo down and resamples to the model's rate.
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * VOICE_SAMPLE_RATE)), VOICE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), VOICE_SAMPLE_RATE);
}
