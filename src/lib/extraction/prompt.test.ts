import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MONEY_OUT_TYPES } from "@/lib/ledger/types";
import { buildExtractionRequest } from "@/lib/meta/transport";
import {
  LINES_PROMPT_VERSION,
  PERSONAL_PAGE_TEXT,
  PROMPT_VERSION,
  getExtractionProfile,
  getPersonalProfile,
  layoutOfPromptVersion,
  personalUserText,
  withLayout,
  withTwoPass,
} from "./prompt";

const typeEnum = (schema: Record<string, unknown>) =>
  (schema as { properties: { entries: { items: { properties: { type: { enum: string[] } } } } } }).properties.entries.items.properties.type.enum;

describe("extraction profiles", () => {
  // Prompt 4 and the prompts built on it (5, its khata layout); the default is checked on its own.
  beforeEach(() => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-4";
  });
  afterEach(() => {
    delete process.env.SCRIBA_PROMPT_VERSION;
  });

  test("prompt 6 with schema 3 is the default since T6; prompt 4 stays selectable", () => {
    delete process.env.SCRIBA_PROMPT_VERSION;
    expect(getExtractionProfile()).toMatchObject({ promptVersion: PROMPT_VERSION, schemaVersion: "scriba-extraction-3" });
    expect(PROMPT_VERSION).toBe("scriba-prompt-6");
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-4";
    expect(getExtractionProfile()).toMatchObject({ promptVersion: LINES_PROMPT_VERSION, schemaVersion: "scriba-extraction-2" });
  });

  test("prompt 4 with schema 2 teaches every money-out type", () => {
    const p = getExtractionProfile();
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

  test("prompt 5 is prompt 4 plus the writer rules, sends notes, reference, then the page last", () => {
    const p5 = getPersonalProfile()!;
    expect(p5.promptVersion).toBe("scriba-prompt-5");
    expect(p5.schemaVersion).toBe(getExtractionProfile().schemaVersion);
    expect(p5.instructions.startsWith(getExtractionProfile().instructions)).toBe(true);
    expect(p5.instructions).toContain("Never transcribe a reference line");

    const hints = {
      confusions: [{ written: 8, read: 4, count: 3, recordIds: ["r1"] }],
      references: [{ recordId: "r1", documentId: "p1", text: "item চাল · qty ৩ · rate ৬০ · amount ১৮০" }],
      key: "k",
    };
    const text = personalUserText(hints, { withImage: true });
    expect(text).toContain("The next image shows 1 line by this writer");
    expect(text).toContain("1. item চাল · qty ৩ · rate ৬০ · amount ১৮০");
    expect(text).toContain("this writer's ৮ (eight) was read as ৪ (four), 3 times");
    // Without the image, the reference list is left out (it would point at nothing).
    expect(personalUserText(hints, { withImage: false })).not.toContain("next image");

    const request = buildExtractionRequest(
      { modelId: "m", reasoningEffort: "low", maxOutputTokens: 100 },
      { imageBytes: new Uint8Array([1]), mimeType: "image/png", personal: { text, reference: { imageBytes: new Uint8Array([2]), mimeType: "image/jpeg" } } },
    );
    expect(request.instructions).toBe(p5.instructions);
    expect(request.input[0]!.content.map((c) => c.type)).toEqual(["input_text", "input_image", "input_text", "input_image"]);
    const [notes, reference, pageText, page] = request.input[0]!.content as Array<{ text?: string; image_url?: string }>;
    expect(notes!.text).toBe(text);
    expect(reference!.image_url).toStartWith("data:image/jpeg;base64,");
    expect(pageText!.text).toBe(PERSONAL_PAGE_TEXT);
    expect(page!.image_url).toStartWith("data:image/png;base64,");

    const plain = buildExtractionRequest({ modelId: "m", reasoningEffort: "low", maxOutputTokens: 100 }, { imageBytes: new Uint8Array([1]), mimeType: "image/png" });
    expect(plain.instructions).toBe(getExtractionProfile().instructions);
    expect(plain.input[0]!.content).toHaveLength(2);
  });

  test("the writer's notes need prompt 4 or 6 underneath", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-3";
    expect(getPersonalProfile()).toBeNull();
  });

  test("prompt 7 is prompt 6 plus the writer rules, sent like prompt 5, and is never two-pass", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-6";
    process.env.SCRIBA_TWO_PASS = "1";
    try {
      const p7 = getPersonalProfile()!;
      expect(p7.promptVersion).toBe("scriba-prompt-7");
      expect(withTwoPass(p7).promptVersion).toBe("scriba-prompt-7");
      const notes = { text: "notes", reference: { imageBytes: new Uint8Array([2]), mimeType: "image/jpeg" } };
      const request = buildExtractionRequest(
        { modelId: "m", reasoningEffort: "low", maxOutputTokens: 100 },
        { imageBytes: new Uint8Array([1]), mimeType: "image/png", personal: notes, layout: "scriba_khata" },
      );
      expect(request.instructions).toBe(withLayout(p7, "scriba_khata").instructions);
      expect(request.text.format.name).toBe("scriba_ledger_extraction_v3");
      expect(request.input[0]!.content.map((c) => c.type)).toEqual(["input_text", "input_image", "input_text", "input_image"]);
      // Prompt 5's own text is unchanged by sharing its writer rules with prompt 7.
      process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-4";
      expect(getPersonalProfile()!.instructions).toEndWith("give your best reading and list that field in review.");
    } finally {
      delete process.env.SCRIBA_TWO_PASS;
    }
  });

  test("a Scriba khata page adds its column layout to prompts 4 and 5, and its version says so", () => {
    const p4 = getExtractionProfile();
    const k4 = withLayout(p4, "scriba_khata");
    expect(k4.promptVersion).toBe("scriba-prompt-4+khata-1");
    expect(k4.instructions.startsWith(p4.instructions)).toBe(true);
    expect(k4.instructions).toContain("The column decides the field");
    expect(k4.schemaVersion).toBe(p4.schemaVersion);
    expect(withLayout(getPersonalProfile()!, "scriba_khata").promptVersion).toBe("scriba-prompt-5+khata-1");
    expect(withLayout(p4, "free")).toBe(p4);

    expect(layoutOfPromptVersion(k4.promptVersion)).toBe("scriba_khata");
    expect(layoutOfPromptVersion("scriba-prompt-5+khata-1")).toBe("scriba_khata");
    expect(layoutOfPromptVersion("scriba-prompt-4")).toBe("free");
    expect(layoutOfPromptVersion(null)).toBe("free");

    // The request carries the layout in the instructions; the user message is unchanged.
    const request = buildExtractionRequest(
      { modelId: "m", reasoningEffort: "low", maxOutputTokens: 100 },
      { imageBytes: new Uint8Array([1]), mimeType: "image/png", layout: "scriba_khata" },
    );
    expect(request.instructions).toBe(k4.instructions);
    expect(request.input[0]!.content).toHaveLength(2);
  });

  test("the prompt's columns and row labels are the printed page's, in order", () => {
    const html = readFileSync(join(import.meta.dir, "..", "..", "..", "scripts", "khata", "page.html"), "utf8");
    const headings = [...html.matchAll(/<th>([^<]+)<\/th>/g)].map((m) => m[1]!);
    expect(headings).toHaveLength(7);
    for (const base of ["scriba-prompt-4", "scriba-prompt-6"]) {
      process.env.SCRIBA_PROMPT_VERSION = base;
      const layout = withLayout(getExtractionProfile(), "scriba_khata").instructions;
      const columns = layout.match(/^- Columns, left to right: (.+)\.$/m)![1]!;
      expect(columns.split(" | ").map((c) => c.replace(/ \(.+\)$/, ""))).toEqual(headings);
      for (const label of ["আগের পাতা থেকে জের", "মোট · পরের পাতায় জের", "বা জ", "Scriba খাতা", "দোকান", "পাতা নং"]) {
        expect(html).toContain(label);
        expect(layout).toContain(label);
      }
    }
  });

  test("the khata layout needs prompts 4 to 7 underneath", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-3";
    const p3 = getExtractionProfile();
    expect(withLayout(p3, "scriba_khata")).toBe(p3);
  });

  test("an unknown prompt version fails loudly", () => {
    process.env.SCRIBA_PROMPT_VERSION = "scriba-prompt-9";
    expect(() => getExtractionProfile()).toThrow(/SCRIBA_PROMPT_VERSION/);
  });
});
