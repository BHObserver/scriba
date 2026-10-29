/**
 * Published Meta Model API prices, kept in exactly one place.
 * Source: https://dev.meta.ai/docs/pricing-rate-limits (retrieved 2026-10-29).
 *
 * Costs computed here are estimates from the usage the API reports. Image input is
 * billed through input tokens; Scriba never invents an image-token count.
 */
export const PRICING_SOURCE = {
  url: "https://dev.meta.ai/docs/pricing-rate-limits",
  retrieved: "2026-10-29",
} as const;

type TokenPrice = { inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number };

const STANDARD: TokenPrice = { inputPerMillion: 1.25, cachedInputPerMillion: 0.15, outputPerMillion: 4.25 };
const CONTRIBUTOR: TokenPrice = { inputPerMillion: 0.1, cachedInputPerMillion: 0.002, outputPerMillion: 0.2 };
const WONDER: TokenPrice = { inputPerMillion: 4.0, cachedInputPerMillion: 0.2, outputPerMillion: 20.0 };

export const MODEL_PRICES: Record<string, TokenPrice> = {
  "muse-wonder-1.0": WONDER,
  "muse-spark-1.3": STANDARD,
  "muse-spark-1.2": STANDARD,
  "muse-spark-1.3-contributor": CONTRIBUTOR,
  "muse-spark-1.2-contributor": CONTRIBUTOR,
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

/** Estimated USD cost, or null when the model's price or the usage is unknown. */
export function estimateCostUsd(modelId: string, usage: TokenUsage | null): number | null {
  const price = MODEL_PRICES[modelId];
  if (!price || !usage) return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const usd =
    (uncached * price.inputPerMillion +
      usage.cachedInputTokens * price.cachedInputPerMillion +
      usage.outputTokens * price.outputPerMillion) /
    1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

export function isContributorModel(modelId: string): boolean {
  return modelId.endsWith("-contributor");
}
