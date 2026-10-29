/**
 * How the photo is oriented before it is sent to Meta. Safe to import on the client.
 *
 * The stored original is never changed. A rotated mode sends a rotated copy, made
 * on the server after the checksum check. The first live runs showed why this
 * matters: a sideways photo produced a confident, self-consistent misreading
 * that every arithmetic check passed, while the same photo upright was read
 * correctly.
 */
export const PROCESSING_MODES = ["baseline_original", "rotate_90", "rotate_180", "rotate_270"] as const;
export type ProcessingMode = (typeof PROCESSING_MODES)[number];

/** Clockwise quarter turns applied to the photo as displayed. */
export type QuarterTurns = 0 | 1 | 2 | 3;

const MODE_BY_TURNS: Record<QuarterTurns, ProcessingMode> = {
  0: "baseline_original",
  1: "rotate_90",
  2: "rotate_180",
  3: "rotate_270",
};

export function processingModeForTurns(turns: number): ProcessingMode {
  return MODE_BY_TURNS[(((Math.round(turns) % 4) + 4) % 4) as QuarterTurns];
}

/** Unknown modes are treated as the unrotated original. */
export function turnsForProcessingMode(mode: string | null | undefined): QuarterTurns {
  const index = PROCESSING_MODES.indexOf(mode as ProcessingMode);
  return (index < 0 ? 0 : index) as QuarterTurns;
}

export function describeTurns(turns: QuarterTurns): string {
  return turns === 0 ? "as uploaded" : `turned ${turns * 90}° clockwise`;
}
