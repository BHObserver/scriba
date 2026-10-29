import { createHash } from "node:crypto";
import type { ProcessingMode } from "@/lib/images/orientation";

export { PROCESSING_MODES, type ProcessingMode } from "@/lib/images/orientation";

export type CacheKeyParts = {
  ownerId: string;
  imageSha256: string;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  processingMode: ProcessingMode;
};

/**
 * Deterministic extraction cache key. A cached result is reused only when every
 * part matches, and the owner is part of the key so results never cross users.
 */
export function extractionCacheKey(parts: CacheKeyParts): string {
  const canonical = JSON.stringify([
    // Bump when the bytes sent to Meta change for the same inputs (cache-2: small photos upscaled).
    "scriba-cache-2",
    parts.ownerId,
    parts.imageSha256.toLowerCase(),
    parts.modelId,
    parts.promptVersion,
    parts.schemaVersion,
    parts.processingMode,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
