import { afterEach, describe, expect, test } from "bun:test";
import { MONEY_OUT_TYPES } from "@/lib/ledger/types";
import { buildExtractionRequest } from "@/lib/meta/transport";
import { PROMPT_VERSION, getExtractionProfile } from "./prompt";

const typeEnum = (schema: Record<string, unknown>) =>
  (schema as { properties: { entries: { items: { properties: { type: { enum: string[] } } } } } }).properties.entries.items.properties.type.enum;

describe("extraction profiles", () => {
  afterEach(() => {
    delete process.env.SCRIBA_PROMPT_VERSION;
  });

  test("prompt 4 with schema 2 is the default, and teaches every money-out type", () => {
    const p = getExtractionProfile();
    expect(p.promptVersion).toBe(PROMPT_VERSION);
    expect(p.promptVersion).toBe("scriba-prompt-4");
    expect(p.schemaVersion).toBe("scriba-extraction-2");
    for (const t of MONEY_OUT_TYPES) {
      expect(typeEnum(p.jsonSchema)).toContain(t);
      expect(p.instructions).toContain(`- ${t}:`);
    }
  });

  test("prompt 3 stays selectable, with the schema it was measured with", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-3";
    const p = getExtractionProfile();
    expect(p.schemaVersion).toBe("scriba-extraction-1");
    expect(typeEnum(p.jsonSchema)).toEqual(["credit_sale", "cash_sale", "repayment", "opening_balance", "closing_balance", "subtotal", "adjustment", "unknown"]);
    const request = buildExtractionRequest(
      { modelId: "m", reasoningEffort: "low", maxOutputTokens: 100 },
      { imageBytes: new Uint8Array([1]), mimeType: "image/png" },
    );
    expect(request.instructions).toBe(p.instructions);
    expect(request.text.format.name).toBe("scriba_ledger_extraction_v1");
  });

  test("an unknown prompt version fails loudly", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-9";
    expect(() => getExtractionProfile()).toThrow(/SCRIBA_PROMPT_VERSION/);
  });
});
