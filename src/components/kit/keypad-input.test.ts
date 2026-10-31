import { expect, test } from "bun:test";
import { applyKey } from "./keypad-input";

test("keypad input", () => {
  expect(applyKey("", "1")).toBe("1");
  expect(applyKey("18", "0")).toBe("180");
  expect(applyKey("0", "5")).toBe("5");
  expect(applyKey("180", "del")).toBe("18");
  expect(applyKey("", "del")).toBe("");
  expect(applyKey("180", "clear")).toBe("");
  expect(applyKey("123", "4", 3)).toBe("123");
});
