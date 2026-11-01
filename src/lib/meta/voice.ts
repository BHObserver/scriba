/**
 * Muse Voice Transcribe, file mode: one WAV clip in, its transcript out (P1 voice correction).
 *
 * - POST {baseURL}/asr/transcribe, multipart: a JSON `request` part and the `audio` WAV part.
 * - PUSH_TO_TALK: the clip is one turn the person already delimited (press, speak, stop).
 * - One request per call, never retried: a failed clip is spoken again by the person.
 * - The transcript is only ever text for the person to check; no model reads it afterwards.
 *
 * Reads the API key from MetaConfig only; never import this from client code.
 */
import type { MetaConfig, VoiceConfig } from "@/lib/config";
import type { MetaErrorCategory } from "./transport";

export type VoiceLanguage = "Bengali" | "English";

export type TranscribeSuccess = { ok: true; transcript: string; audioDurationMs: number; sessionId: string | null; elapsedMs: number };
export type TranscribeFailure = { ok: false; category: MetaErrorCategory; httpStatus: number | null; message: string; elapsedMs: number };
export type TranscribeResult = TranscribeSuccess | TranscribeFailure;
export type Transcriber = (wav: Uint8Array, languages: VoiceLanguage[]) => Promise<TranscribeResult>;

/** The `request` part, exactly as sent. */
export function buildTranscribeRequest(modelId: string, languages: VoiceLanguage[]) {
  return { model: modelId, audioEncoding: "WAV" as const, mode: "PUSH_TO_TALK" as const, languageBias: languages };
}

function failureFor(status: number, detail: string): Omit<TranscribeFailure, "elapsedMs"> {
  const fail = (category: MetaErrorCategory, message: string) => ({ ok: false as const, category, httpStatus: status, message });
  switch (status) {
    case 400:
    case 406:
      return fail("invalid_request", `Meta rejected the recording: ${detail}`);
    case 401:
      return fail("auth", "Meta rejected the API key. Check META_MODEL_API_KEY.");
    case 402:
      return fail("billing", "Meta billing is not set up or credits are exhausted.");
    case 403:
      return fail("forbidden", `This key cannot use voice transcription: ${detail}`);
    case 404:
      return fail("model_not_found", `Voice model not found. Check META_VOICE_MODEL_ID. ${detail}`);
    case 413:
      return fail("payload_too_large", "The recording is too large.");
    case 429:
      return fail("rate_limited", "Meta's voice limit was reached. Try again in a minute.");
    default:
      return status >= 500 ? fail("server_error", `Meta had a server error (${status}).`) : fail("unknown", `Unexpected response from Meta (${status}).`);
  }
}

function safeDetail(raw: unknown): string {
  const body = raw as { error?: { message?: unknown } | string; message?: unknown } | null;
  const msg = typeof body?.error === "object" ? body.error?.message : (body?.error ?? body?.message);
  return (typeof msg === "string" ? msg : "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(sk|key|sb_secret)[-_][A-Za-z0-9_-]{8,}/g, "[redacted]")
    .slice(0, 200);
}

export function createTranscriber(meta: Pick<MetaConfig, "apiKey" | "baseURL">, voice: Pick<VoiceConfig, "modelId" | "timeoutMs">, opts: { fetch?: typeof fetch } = {}): Transcriber {
  const doFetch = opts.fetch ?? fetch;
  return async (wav, languages) => {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    if (!meta.apiKey) {
      return { ok: false, category: "not_configured", httpStatus: null, message: "META_MODEL_API_KEY is not set on the server.", elapsedMs: 0 };
    }
    const form = new FormData();
    form.append("request", new Blob([JSON.stringify(buildTranscribeRequest(voice.modelId, languages))], { type: "application/json" }));
    form.append("audio", new Blob([wav as Uint8Array<ArrayBuffer>], { type: "audio/wav" }), "speech.wav");
    let res: Response;
    try {
      res = await doFetch(`${meta.baseURL.replace(/\/$/, "")}/asr/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${meta.apiKey}`, Accept: "application/json" },
        body: form,
        signal: AbortSignal.timeout(voice.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return timedOut
        ? { ok: false, category: "timeout", httpStatus: null, message: "Meta didn't answer in time.", elapsedMs: elapsed() }
        : { ok: false, category: "network", httpStatus: null, message: "The connection to Meta failed.", elapsedMs: elapsed() };
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ...failureFor(res.status, safeDetail(body)), elapsedMs: elapsed() };
    const r = body as { transcript?: unknown; audioDurationMs?: unknown; sessionId?: unknown } | null;
    if (typeof r?.transcript !== "string") {
      return { ok: false, category: "unknown", httpStatus: res.status, message: "Meta's answer had no transcript.", elapsedMs: elapsed() };
    }
    return {
      ok: true,
      transcript: r.transcript.trim(),
      audioDurationMs: typeof r.audioDurationMs === "number" ? r.audioDurationMs : 0,
      sessionId: typeof r.sessionId === "string" ? r.sessionId : null,
      elapsedMs: elapsed(),
    };
  };
}
