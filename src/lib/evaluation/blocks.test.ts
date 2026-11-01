import { describe, expect, test } from "bun:test";
import { groupingAgreement, kindsFound } from "./blocks";

// The V01 page: seven day-sales lines, then Pran's visit (lines 8-12).
const truth = [
  { kind: "day_sales", lines: [1, 2, 3, 4, 5, 6, 7] },
  { kind: "supplier_visit", lines: [8, 9, 10, 11, 12] },
];
const read = (blocks: string[]) => blocks.map((block, i) => ({ line: i + 1, block }));

describe("grouping agreement", () => {
  test("the same grouping under other names agrees on every pair", () => {
    expect(groupingAgreement(truth, read([..."xxxxxxx", ..."yyyyy"]))).toEqual({ numerator: 66, denominator: 66 });
  });

  test("one block for the whole page gets the pairs across the two blocks wrong", () => {
    // 12 lines make 66 pairs; 7 × 5 = 35 of them cross blocks.
    expect(groupingAgreement(truth, read(Array(12).fill("b1")))).toEqual({ numerator: 31, denominator: 66 });
  });

  test("a line moved to the wrong block costs its pairs; lines the reading lacks are not scored; no block is no grouping", () => {
    // Line 8 now pairs wrongly with the 7 sales lines and with the 4 other visit lines.
    expect(groupingAgreement(truth, read([..."xxxxxxx", "x", ..."yyyy"]))).toEqual({ numerator: 55, denominator: 66 });
    expect(groupingAgreement(truth, read([..."xxxxxx"])).denominator).toBe(15);
    expect(groupingAgreement(truth, [{ line: 1, block: null }, { line: 2, block: null }])).toEqual({ numerator: 0, denominator: 1 });
  });
});

describe("kinds found", () => {
  test("each truth block's kind counts once per block the reading has of that kind", () => {
    expect(kindsFound(truth, ["supplier_visit", "day_sales"])).toEqual({ numerator: 2, denominator: 2 });
    expect(kindsFound(truth, ["customer_account", "day_sales", "day_sales"])).toEqual({ numerator: 1, denominator: 2 });
    expect(kindsFound([...truth, { kind: "day_sales", lines: [13] }], ["day_sales"])).toEqual({ numerator: 1, denominator: 3 });
  });
});
