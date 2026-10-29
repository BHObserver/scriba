/**
 * Server-side configuration, read from environment variables.
 * Secrets are never exposed through NEXT_PUBLIC_ variables.
 */

function intFromEnv(name: string, fallback: number, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return n;
}

export const REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type MetaConfig = {
  apiKey: string | null;
  modelId: string;
  baseURL: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  timeoutMs: number;
};

export function getMetaConfig(): MetaConfig {
  const effort = (process.env.META_REASONING_EFFORT ?? "low").trim() as ReasoningEffort;
  if (!REASONING_EFFORTS.includes(effort)) {
    throw new Error(`META_REASONING_EFFORT must be one of ${REASONING_EFFORTS.join(", ")}.`);
  }
  return {
    apiKey: process.env.META_MODEL_API_KEY?.trim() || null,
    modelId: process.env.META_MODEL_ID?.trim() || "muse-wonder-1.0",
    baseURL: process.env.META_MODEL_BASE_URL?.trim() || "https://api.meta.ai/v1",
    reasoningEffort: effort,
    maxOutputTokens: intFromEnv("SCRIBA_MAX_OUTPUT_TOKENS", 8000, { min: 16, max: 32_000 }),
    timeoutMs: intFromEnv("META_REQUEST_TIMEOUT_MS", 240_000, { min: 5_000, max: 290_000 }),
  };
}

export type LimitsConfig = {
  maxUploadBytes: number;
  extractionsPerHour: number;
  extractionsPerDay: number;
  /** Lower-cased emails allowed to start paid extractions; empty means any signed-in user. */
  extractionAllowedEmails: string[];
  /** A pending run older than this is treated as uncertain (the server may have died). */
  stalePendingMs: number;
};

export function getLimitsConfig(): LimitsConfig {
  return {
    maxUploadBytes: intFromEnv("SCRIBA_MAX_UPLOAD_BYTES", 8 * 1024 * 1024, { min: 1024, max: 50_000_000 }),
    extractionsPerHour: intFromEnv("SCRIBA_EXTRACTIONS_PER_HOUR", 30),
    extractionsPerDay: intFromEnv("SCRIBA_EXTRACTIONS_PER_DAY", 150),
    extractionAllowedEmails: (process.env.SCRIBA_EXTRACTION_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    stalePendingMs: 6 * 60 * 1000,
  };
}

export type SupabasePublicConfig = { url: string; publishableKey: string };

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, publishableKey };
}

/** Which settings are present, for the settings page. Never returns secret values. */
export function configurationStatus() {
  const present = (name: string) => Boolean(process.env[name]?.trim());
  return {
    supabaseUrl: present("NEXT_PUBLIC_SUPABASE_URL"),
    supabasePublishableKey: present("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    supabaseSecretKey: present("SUPABASE_SECRET_KEY"),
    metaApiKey: present("META_MODEL_API_KEY"),
  };
}

export const STORAGE_BUCKET = "scriba-originals";
