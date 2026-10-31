import { groupSouthAsian } from "@/lib/numerals";
import type { KeypadKey } from "./keypad";

/** Digits after the point: quantities are kept to the gram (three places), money to the poisha (two). */
const MAX_FRACTION = 3;

/**
 * Apply a keypad key to a typed number (ASCII digits, at most one point). A lone zero is
 * replaced by the next digit; a point typed first becomes "0."; length is capped.
 */
export function applyKey(current: string, key: KeypadKey, maxLength = 9): string {
  if (key === "clear") return "";
  if (key === "del") return current.slice(0, -1);
  if (current.length >= maxLength) return current;
  if (key === ".") return current.includes(".") ? current : `${current || "0"}.`;
  if (current === "0") return key;
  const point = current.indexOf(".");
  if (point >= 0 && current.length - point > MAX_FRACTION) return current;
  return current + key;
}

/** A typed number for display: lakh grouping on the whole part only ("12345.5" → "12,345.5"). */
export function groupTyped(typed: string): string {
  const [whole = "", fraction] = typed.split(".");
  return fraction === undefined ? groupSouthAsian(whole) : `${groupSouthAsian(whole)}.${fraction}`;
}
