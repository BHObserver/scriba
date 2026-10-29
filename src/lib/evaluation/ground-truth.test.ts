import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groundTruthSchema, groundTruthTemplate } from "./ground-truth";

describe("ground-truth format", () => {
  test("the public synthetic example in docs/ is valid", () => {
    const example = JSON.parse(readFileSync(join(import.meta.dir, "../../../docs/examples/ground-truth.example.json"), "utf8"));
    const parsed = groundTruthSchema.parse(example);
    expect(parsed.entries.find((e) => e.type === "subtotal")?.expected_flag).toBe(true);
  });

  test("the blank template is valid and starts empty, not from model output", () => {
    const t = groundTruthSchema.parse(groundTruthTemplate("S07"));
    expect(t.sample_id).toBe("S07");
    expect(t.entries[0]!.amount).toBe("");
  });

  test("unknown fields and wrong types are rejected", () => {
    expect(groundTruthSchema.safeParse({ format: "scriba-ground-truth-1", sample_id: "x" }).success).toBe(false);
  });
});
