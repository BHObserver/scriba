"use client";

import { useI18n } from "@/lib/i18n/client";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "del" | "clear";
const KEYS: readonly KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "clear"];

/** 3×4 number pad with 60 px keys; digits are shown in the locale's script and reported as ASCII. */
export function Keypad({ onKey }: { onKey: (key: KeypadKey) => void }) {
  const { t, digits } = useI18n();
  return (
    <div className="keypad">
      {KEYS.map((k) => (
        <button key={k} type="button" className={k.length > 1 ? "key key-fn" : "key"} onClick={() => onKey(k)}>
          {k === "del" ? t("key.del") : k === "clear" ? t("key.clear") : digits(k)}
        </button>
      ))}
    </div>
  );
}
