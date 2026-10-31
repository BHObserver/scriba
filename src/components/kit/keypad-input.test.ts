import { expect, test } from "bun:test";
import { applyKey, groupTyped } from "./keypad-input";

test("keypad input", () => {
  expect(applyKey("", "1")).toBe("1");
  expect(applyKey("18", "0")).toBe("180");
  expect(applyKey("0", "5")).toBe("5");
  expect(applyKey("180", "del")).toBe("18");
  expect(applyKey("", "del")).toBe("");
  expect(applyKey("180", "clear")).toBe("");
  expect(applyKey("123", "4", 3)).toBe("123");
});

test("keypad decimal point", () => {
  expect(applyKey("1", ".")).toBe("1.");
  expect(applyKey("1.", "5")).toBe("1.5");
  expect(applyKey("1.5", ".")).toBe("1.5");
  expect(applyKey("", ".")).toBe("0.");
  expect(applyKey("0", ".")).toBe("0.");
  expect(applyKey("0.", "5")).toBe("0.5");
  expect(applyKey("2.125", "1")).toBe("2.125");
  expect(applyKey("1.5", "del")).toBe("1.");
});

test("typed numbers are grouped on the whole part only", () => {
  expect(groupTyped("180")).toBe("180");
  expect(groupTyped("12345")).toBe("12,345");
  expect(groupTyped("12345.5")).toBe("12,345.5");
  expect(groupTyped("1.")).toBe("1.");
  expect(groupTyped("")).toBe("");
});
