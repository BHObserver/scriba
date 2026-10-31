import type { KeypadKey } from "./keypad";

/** Apply a keypad key to a typed number (ASCII digits). A lone zero is replaced; length is capped. */
export function applyKey(current: string, key: KeypadKey, maxLength = 9): string {
  if (key === "clear") return "";
  if (key === "del") return current.slice(0, -1);
  if (current === "0") return key;
  return current.length >= maxLength ? current : current + key;
}
