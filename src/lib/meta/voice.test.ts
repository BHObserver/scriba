import { describe, expect, test } from "bun:test";
import { estimateVoiceCostUsd } from "@/lib/pricing";
import { encodeWav } from "@/lib/voice/wav";
import { buildTranscribeRequest, createTranscriber } from "./voice";

const meta = { apiKey: "test-key", baseURL: "https://api.example.test/v1/" };
const voice = { modelId: "muse-voice-transcribe-1.0", timeoutMs: 5_000 };
const wav = encodeWav(new Float32Array(24_000), 24_000);

type Captured = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, captured: Captured[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("buildTranscribeRequest", () => {
  test("push-to-talk WAV with the language bias", () => {
    expect(buildTranscribeRequest("muse-voice-transcribe-1.0", ["Bengali"])).toEqual({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      mode: "PUSH_TO_TALK",
      languageBias: ["Bengali"],
    });
  });
});

describe("createTranscriber", () => {
  test("sends one multipart request and returns the transcript", async () => {
    const captured: Captured[] = [];
    const transcribe = createTranscriber(meta, voice, { fetch: fakeFetch(200, { sessionId: "s1", transcript: " একশো আশি ", audioDurationMs: 1000, turns: [] }, captured) });
    const result = await transcribe(wav, ["Bengali"]);
    expect(result).toMatchObject({ ok: true, transcript: "একশো আশি", audioDurationMs: 1000, sessionId: "s1" });
    expect(captured).toHaveLength(1);
    const { url, init } = captured[0]!;
    expect(url).toBe("https://api.example.test/v1/asr/transcribe");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
    const form = init.body as FormData;
    const request = form.get("request") as Blob;
    expect(request.type).toStartWith("application/json");
    expect(JSON.parse(await request.text())).toEqual(buildTranscribeRequest(voice.modelId, ["Bengali"]));
    const audio = form.get("audio") as File;
    expect(audio.type).toBe("audio/wav");
    expect(audio.size).toBe(wav.length);
  });

  test("no API key: no request at all", async () => {
    const captured: Captured[] = [];
    const result = await createTranscriber({ ...meta, apiKey: null }, voice, { fetch: fakeFetch(200, {}, captured) })(wav, ["Bengali"]);
    expect(result).toMatchObject({ ok: false, category: "not_configured" });
    expect(captured).toHaveLength(0);
  });

  test.each([
    [400, "invalid_request"],
    [401, "auth"],
    [402, "billing"],
    [404, "model_not_found"],
    [413, "payload_too_large"],
    [429, "rate_limited"],
    [500, "server_error"],
  ])("HTTP %i → %s, with the key never echoed", async (status, category) => {
    const result = await createTranscriber(meta, voice, { fetch: fakeFetch(status, { error: { message: "bad Bearer test-key" } }) })(wav, ["Bengali"]);
    expect(result).toMatchObject({ ok: false, category, httpStatus: status });
    expect(JSON.stringify(result)).not.toContain("test-key");
  });

  test("a 200 without a transcript is a failure, not an empty number", async () => {
    const result = await createTranscriber(meta, voice, { fetch: fakeFetch(200, { sessionId: "s" }) })(wav, ["Bengali"]);
    expect(result).toMatchObject({ ok: false, category: "unknown" });
  });

  test("network failure and timeout", async () => {
    const throwing = (err: Error) => (async () => Promise.reject(err)) as unknown as typeof fetch;
    expect(await createTranscriber(meta, voice, { fetch: throwing(new TypeError("fetch failed")) })(wav, ["Bengali"])).toMatchObject({ ok: false, category: "network" });
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    expect(await createTranscriber(meta, voice, { fetch: throwing(timeout) })(wav, ["Bengali"])).toMatchObject({ ok: false, category: "timeout" });
  });
});

test("voice cost: $0.18 an hour, whole seconds only", () => {
  expect(estimateVoiceCostUsd(3_600_000)).toBe(0.18);
  expect(estimateVoiceCostUsd(10_999)).toBe(0.0005);
  expect(estimateVoiceCostUsd(999)).toBe(0);
});
