/**
 * Explicit live check of voice correction (P1) and spoken answers (U2): send ONE WAV clip to Muse
 * Voice Transcribe and print what it heard, and the number and yes/no the code reads from it.
 * Never run by tests or builds.
 * Each run spends a little credit ($0.18 per audio hour, so about $0.0005 for a 10 s clip).
 *
 *   bun run live:voice <clip.wav>             # Bangla bias, as on the Bangla screen
 *   bun run live:voice <clip.wav> --lang=en   # English + Bangla bias, as on the English screen
 *   bun run live:voice <clip.wav> --dry-run   # check the clip, send nothing
 *
 * The clip must be mono 16-bit PCM at 16 or 24 kHz, 0.3–15 s, as the app records it.
 * Reads META_MODEL_API_KEY from .env.local (Bun loads it automatically).
 */
import { readFileSync } from "node:fs";
import { getMetaConfig, getVoiceConfig } from "@/lib/config";
import { buildTranscribeRequest, createTranscriber, type VoiceLanguage } from "@/lib/meta/voice";
import { estimateVoiceCostUsd } from "@/lib/pricing";
import { readYesNo } from "@/lib/voice/answer-words";
import { parseSpokenNumber } from "@/lib/voice/number-words";
import { readWavInfo, wavProblem } from "@/lib/voice/wav";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const lang = args.find((a) => a.startsWith("--lang="))?.slice("--lang=".length) ?? "bn";
if (!path || !["bn", "en"].includes(lang)) {
  console.error("Usage: bun run live:voice <clip.wav> [--lang=bn|en] [--dry-run]");
  process.exit(2);
}

const voice = getVoiceConfig();
const bytes = new Uint8Array(readFileSync(path));
const info = readWavInfo(bytes);
const problem = wavProblem(info, voice);
console.log("Clip:", info ? `${info.sampleRate} Hz, ${info.channels} ch, ${info.bitsPerSample}-bit, ${info.durationMs} ms` : "not a WAV file");
if (problem) {
  console.error(`Rejected: ${problem}. The app would not send this clip.`);
  process.exit(1);
}

const languages: VoiceLanguage[] = lang === "en" ? ["English", "Bengali"] : ["Bengali"];
console.log("Request:", JSON.stringify(buildTranscribeRequest(voice.modelId, languages)));
if (args.includes("--dry-run")) process.exit(0);

const result = await createTranscriber(getMetaConfig(), voice)(bytes, languages);
if (!result.ok) {
  console.error(`Failed (${result.category}, HTTP ${result.httpStatus ?? "none"}): ${result.message}`);
  process.exit(1);
}
console.log("Heard:", JSON.stringify(result.transcript));
console.log("Number:", JSON.stringify(parseSpokenNumber(result.transcript)));
console.log("Yes/no:", JSON.stringify(readYesNo(result.transcript)));
console.log(`Audio ${result.audioDurationMs} ms · about $${estimateVoiceCostUsd(result.audioDurationMs).toFixed(6)} · ${result.elapsedMs} ms round trip · session ${result.sessionId ?? "?"}`);
