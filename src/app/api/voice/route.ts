import { NextResponse } from "next/server";
import { getMetaConfig, getVoiceConfig } from "@/lib/config";
import { createTranscriber, type VoiceLanguage } from "@/lib/meta/voice";
import { estimateVoiceCostUsd } from "@/lib/pricing";
import { apiUser, jsonError } from "@/lib/server/auth";
import { readYesNo } from "@/lib/voice/answer-words";
import { parseSpokenNumber } from "@/lib/voice/number-words";
import { createWindowLimiter } from "@/lib/voice/rate-limit";
import { readWavInfo, wavProblem } from "@/lib/voice/wav";

export const maxDuration = 60;

// 15 s of 24 kHz PCM16 is 720 KB; anything much bigger isn't a clip from the fix sheet.
const MAX_BYTES = 1_000_000;

let limiter: ReturnType<typeof createWindowLimiter> | null = null;

/**
 * Hear one number (P1) or a yes or no (U2): the body is a WAV clip (`audio/wav`), `?lang=en` on
 * the English screen. Returns what Muse Voice Transcribe heard and the number(s) and yes/no the
 * code read from it. Nothing is saved: the screen places the answer and the person confirms it.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const voice = getVoiceConfig();
  if (!voice.enabled) return jsonError("Voice is switched off on this deployment.", 503, { code: "off" });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return jsonError("The recording is too long.", 413, { code: "too_long" });
  const bytes = new Uint8Array(await request.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (bytes.length > MAX_BYTES) return jsonError("The recording is too long.", 413, { code: "too_long" });
  const problem = wavProblem(readWavInfo(bytes), voice);
  if (problem) return jsonError("The recording can't be used.", problem === "too_short" ? 422 : 400, { code: problem });

  limiter ??= createWindowLimiter(voice);
  const take = limiter.take(auth.user.id);
  if (!take.ok) return jsonError("Too many recordings just now.", 429, { code: "busy", retryAfterSeconds: take.retryAfterSeconds });

  const languages: VoiceLanguage[] = new URL(request.url).searchParams.get("lang") === "en" ? ["English", "Bengali"] : ["Bengali"];
  const result = await createTranscriber(getMetaConfig(), voice)(bytes, languages);
  if (!result.ok) {
    console.error("voice failed", result.category, result.httpStatus);
    return jsonError(result.message, result.category === "rate_limited" ? 429 : 502, { code: result.category === "rate_limited" ? "busy" : "failed" });
  }
  // Usage only; the transcript is the shopkeeper's words and is not logged.
  console.info("voice", { audioMs: result.audioDurationMs, usd: estimateVoiceCostUsd(result.audioDurationMs), elapsedMs: result.elapsedMs });
  return NextResponse.json({ transcript: result.transcript, number: parseSpokenNumber(result.transcript), yesNo: readYesNo(result.transcript) });
}
