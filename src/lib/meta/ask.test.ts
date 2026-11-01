import { describe, expect, test } from "bun:test";
import type { AskConfig } from "@/lib/config";
import { ASK_SCHEMA_NAME } from "@/lib/ask/prompt";
import { askQuery } from "@/lib/ask/query";
import { buildAskRequest, createAskCaller } from "./ask";

const config: AskConfig = {
  enabled: true,
  modelId: "muse-wonder-1.0",
  reasoningEffort: "low",
  maxOutputTokens: 2000,
  timeoutMs: 10_000,
  maxQuestionChars: 200,
  perHour: 30,
  perDay: 120,
};
/** A stand-in for fetch: the SDK only calls it. */
const fake = (fn: (url: unknown, init?: RequestInit) => Promise<Response>) => fn as unknown as typeof fetch;

const vocabulary = { customers: ["করিম মিয়া"], suppliers: ["হক স্টোর"], items: ["চাল"] };

describe("Ask Scriba's model call", () => {
  test("one text-only request with the strict shape schema, not stored", () => {
    const body = buildAskRequest(config, "করিমের কাছে কত বাকি?", vocabulary);
    expect(body.model).toBe("muse-wonder-1.0");
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(2000);
    expect(body.text.format).toMatchObject({ type: "json_schema", name: ASK_SCHEMA_NAME, strict: true });
    expect(body.input).toHaveLength(1);
    expect(body.input[0]!.content.map((c) => c.type)).toEqual(["input_text"]);
    expect(body.input[0]!.content[0]!.text).toContain("Question: করিমের কাছে কত বাকি?");
  });

  test("no key: no request", async () => {
    let calls = 0;
    const caller = createAskCaller({ apiKey: null, baseURL: "https://example.invalid/v1" }, config, {
      fetch: fake(async () => {
        calls++;
        return new Response("{}");
      }),
    });
    expect(await caller("আজ কত বিক্রি?", vocabulary)).toMatchObject({ ok: false, category: "not_configured" });
    expect(calls).toBe(0);
  });

  test("the reply's text and usage are read; a failure is never retried", async () => {
    const shape = askQuery({ intent: "party_due", party: "করিম মিয়া" });
    const sent: unknown[] = [];
    const reply = {
      id: "resp_1",
      model: "muse-wonder-1.0",
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(shape) }] }],
      usage: { input_tokens: 900, output_tokens: 120, output_tokens_details: { reasoning_tokens: 40 }, total_tokens: 1020 },
    };
    const ok = createAskCaller({ apiKey: "test-key", baseURL: "https://example.invalid/v1" }, config, {
      fetch: fake(async (_url, init) => {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify(reply), { headers: { "content-type": "application/json" } });
      }),
    });
    const result = await ok("করিমের কাছে কত বাকি?", vocabulary);
    expect(result.ok && JSON.parse(result.summary.outputText!)).toEqual(shape);
    expect(result.ok && result.usage?.outputTokens).toBe(120);
    expect(sent).toHaveLength(1);

    let calls = 0;
    const failing = createAskCaller({ apiKey: "test-key", baseURL: "https://example.invalid/v1" }, config, {
      fetch: fake(async () => {
        calls++;
        return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500, headers: { "content-type": "application/json" } });
      }),
    });
    expect(await failing("আজ কত বিক্রি?", vocabulary)).toMatchObject({ ok: false, category: "server_error" });
    expect(calls).toBe(1);
  });
});
