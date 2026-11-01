"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * P4: "these are printed Scriba khata pages", remembered on this phone. A shop that prints the
 * khata uses it for every page, so the switch shouldn't need setting each time.
 */
const KEY = "scriba.khataPages";
const listeners = new Set<() => void>();
/** Used when the browser keeps no storage (some private modes): the switch then lasts this visit. */
let memory = false;

function read(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === null ? memory : stored === "1";
  } catch {
    return memory;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

export function useKhataPages(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    memory = next;
    try {
      if (next) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    } catch {
      // No storage: `memory` holds it.
    }
    listeners.forEach((fn) => fn());
  }, []);
  return [on, set];
}
