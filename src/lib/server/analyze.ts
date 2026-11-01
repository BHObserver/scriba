import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLimitsConfig, getMetaConfig } from "@/lib/config";
import { type AnalyzeRequest, analyzeDocument } from "@/lib/extraction/pipeline";
import { prepareImageForModel } from "@/lib/images/rotate";
import { createMetaCaller } from "@/lib/meta/transport";
import { createServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseExtractionRepo } from "./extraction-repo";
import { createPersonalizer, learningSwitchOn } from "./learning-data";

/** The single production entry point that can spend Meta credits. */
export async function runAnalyze(userClient: SupabaseClient, ownerId: string, request: AnalyzeRequest) {
  const meta = getMetaConfig();
  const limits = getLimitsConfig();
  const repo = createSupabaseExtractionRepo({ userClient, serviceClient: createServiceSupabase(), ownerId });
  // Prompt 5 only when he switched learning on (P3); his notes are read through his own client.
  const personalize = (await learningSwitchOn(userClient)) ? createPersonalizer(userClient) : undefined;
  return analyzeDocument(
    { repo, callModel: createMetaCaller(meta), now: () => new Date(), prepareImage: prepareImageForModel, personalize },
    {
      modelId: meta.modelId,
      extractionsPerHour: limits.extractionsPerHour,
      extractionsPerDay: limits.extractionsPerDay,
      stalePendingMs: limits.stalePendingMs,
    },
    request,
  );
}
