"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SpokenNumber } from "@/lib/voice/number-words";
import { type Recording, startRecording, voiceSupported } from "@/lib/voice/recorder";

export type VoiceError = "denied" | "too_short" | "busy" | "failed" | "off";

export type VoiceState =
  | { s: "idle" }
  | { s: "listening" }
  | { s: "sending" }
  | { s: "heard"; transcript: string; number: SpokenNumber }
  | { s: "error"; error: VoiceError };

const noSubscribe = () => () => {};

function errorFor(status: number, code: unknown): VoiceError {
  if (code === "too_short") return "too_short";
  if (code === "off") return "off";
  if (status === 429) return "busy";
  return "failed";
}

/**
 * The fix sheet's microphone: listening → sending → heard. What was heard goes to `onHeard`;
 * nothing is saved here. Closing the sheet mid-recording releases the microphone.
 */
export function useVoice(lang: "bn" | "en", onHeard: (number: SpokenNumber) => void) {
  const supported = useSyncExternalStore(noSubscribe, voiceSupported, () => false);
  const [state, setState] = useState<VoiceState>({ s: "idle" });
  const recording = useRef<Recording | null>(null);
  // Bumped by stop/cancel/unmount so a late microphone grant or a late answer is ignored.
  const turn = useRef(0);
  const heard = useRef(onHeard);
  useEffect(() => {
    heard.current = onHeard;
  });

  const stop = useCallback(async () => {
    const rec = recording.current;
    recording.current = null;
    const mine = ++turn.current;
    if (!rec) {
      setState({ s: "idle" });
      return;
    }
    setState({ s: "sending" });
    try {
      const wav = await rec.stop();
      const res = await fetch(`/api/voice?lang=${lang}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav as Uint8Array<ArrayBuffer> });
      const body = (await res.json().catch(() => null)) as { transcript?: string; number?: SpokenNumber; code?: unknown } | null;
      if (mine !== turn.current) return;
      if (!res.ok || !body?.number) {
        setState({ s: "error", error: errorFor(res.status, body?.code) });
        return;
      }
      setState({ s: "heard", transcript: body.transcript ?? "", number: body.number });
      heard.current(body.number);
    } catch {
      if (mine === turn.current) setState({ s: "error", error: "failed" });
    }
  }, [lang]);

  const start = useCallback(async () => {
    const mine = ++turn.current;
    setState({ s: "listening" });
    try {
      const rec = await startRecording(() => void stop());
      if (mine !== turn.current) rec.cancel();
      else recording.current = rec;
    } catch (err) {
      // Refused or no microphone → "allow the mic"; anything else (no recorder support) → "say it again or type".
      const refused = err instanceof DOMException && ["NotAllowedError", "NotFoundError", "SecurityError"].includes(err.name);
      if (mine === turn.current) setState({ s: "error", error: refused ? "denied" : "failed" });
    }
  }, [stop]);

  const reset = useCallback(() => {
    turn.current++;
    recording.current?.cancel();
    recording.current = null;
    setState({ s: "idle" });
  }, []);

  useEffect(
    () => () => {
      turn.current++;
      recording.current?.cancel();
    },
    [],
  );

  return { supported, state, start, stop, reset };
}
