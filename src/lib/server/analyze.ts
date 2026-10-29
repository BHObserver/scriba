import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLimitsConfig, getMetaConfig } from "@/lib/config";
import { type AnalyzeRequest, analyzeDocument } from "@/lib/extraction/pipeline";
import { prepareImageForModel } from "@/lib/images/rotate";
import { createMetaCaller } from "@/lib/meta/transport";
import { createServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseExtractionRepo } from "./extraction-repo";

/** The single production entry point that can spend Meta credits. */
export async function runAnalyze(userClient: SupabaseClient, ownerId: string, request: AnalyzeRequest) {
  const meta = getMetaConfig();
  const limits = getLimitsConfig();
  const repo = createSupabaseExtractionRepo({ userClient, serviceClient: createServiceSupabase(), ownerId });
  return analyzeDocument(
    { repo, callModel: createMetaCaller(meta), now: () => new Date(), prepareImage: prepareImageForModel },
    {
      modelId: meta.modelId,
      extractionsPerHour: limits.extractionsPerHour,
      extractionsPerDay: limits.extractionsPerDay,
      stalePendingMs: limits.stalePendingMs,
    },
    request,
  );
}
