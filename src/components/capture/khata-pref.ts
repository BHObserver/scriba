"use client";

import { useCallback, useSyncExternalStore } from "react";

/** A yes/no choice remembered on this phone (localStorage), shared by every screen using it. */
function phonePref(key: string, fallback: boolean): () => [boolean, (on: boolean) => void] {
  const listeners = new Set<() => void>();
  /** Used when the browser keeps no storage (some private modes): the choice then lasts this visit. */
  let memory = fallback;

  function read(): boolean {
    try {
      const stored = localStorage.getItem(key);
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

  return function usePref() {
    const on = useSyncExternalStore(subscribe, read, () => fallback);
    const set = useCallback((next: boolean) => {
      memory = next;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // No storage: `memory` holds it.
      }
      listeners.forEach((fn) => fn());
    }, []);
    return [on, set];
  };
}

/**
 * P4: "these are printed Scriba khata pages", remembered on this phone. A shop that prints the
 * khata uses it for every page, so the switch shouldn't need setting each time.
 */
export const useKhataPages = phonePref("scriba.khataPages", false);

/** C2: take the photo by itself once the page holds still (DESIGN_SPEC D5; on unless he turns it off). */
export const useAutoShutter = phonePref("scriba.autoShutter", true);
