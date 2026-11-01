/**
 * Per-user limits on voice clips, kept in memory (P1).
 *
 * A clip costs about $0.0005, so this guards against a runaway loop, not normal use. Memory is
 * per server instance, so on a serverless host the real ceiling is a few times the limit; the
 * clip length cap and closed sign-ups (F1) bound the rest. Extractions, which cost ~200× more,
 * keep their database-backed limits.
 */
export type WindowLimits = { perHour: number; perDay: number };
export type Take = { ok: true } | { ok: false; retryAfterSeconds: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function createWindowLimiter(limits: WindowLimits, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    take(key: string): Take {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((h) => t - h < DAY);
      const lastHour = recent.filter((h) => t - h < HOUR);
      if (lastHour.length >= limits.perHour) return { ok: false, retryAfterSeconds: Math.ceil((lastHour[0]! + HOUR - t) / 1000) };
      if (recent.length >= limits.perDay) return { ok: false, retryAfterSeconds: Math.ceil((recent[0]! + DAY - t) / 1000) };
      recent.push(t);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
