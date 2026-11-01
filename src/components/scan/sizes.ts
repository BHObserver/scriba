/** Sizes the page finder works at (docs/PLAN_V3.md, C2). */

/** Live preview frames are scaled to this long side before detection (about ten a second). */
export const LIVE_SIDE = 640;
/** The still is scaled to this long side to find its corners once, more exactly than live. */
export const DETECT_SIDE = 1280;
/** The flattened page never exceeds the still's own cap (`still-photo.ts`). */
export const FLAT_MAX_PIXELS = 12_000_000;
/** JPEG quality of the flattened page (as for the shutter's own encode). */
export const FLAT_QUALITY = 0.92;
