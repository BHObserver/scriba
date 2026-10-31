"use client";

import { useI18n } from "@/lib/i18n/client";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "del" | "clear";
const KEYS: readonly KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "clear"];
/** Quantities and rates can be fractions (১.৫ কেজি): the point takes the clear key's place. */
const DECIMAL_KEYS: readonly KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "."];

/** 3×4 number pad with 60 px keys; digits are shown in the locale's script and reported as ASCII. */
export function Keypad({ onKey, decimal }: { onKey: (key: KeypadKey) => void; decimal?: boolean }) {
  const { t, digits } = useI18n();
  return (
    <div className="keypad">
      {(decimal ? DECIMAL_KEYS : KEYS).map((k) => (
        <button key={k} type="button" className={k.length > 1 ? "key key-fn" : "key"} onClick={() => onKey(k)} aria-label={k === "." ? t("key.point") : undefined}>
          {k === "del" ? t("key.del") : k === "clear" ? t("key.clear") : digits(k)}
        </button>
      ))}
    </div>
  );
}
