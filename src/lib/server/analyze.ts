import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLimitsConfig, getMetaConfig } from "@/lib/config";
import { type AnalyzeRequest, analyzeDocument } from "@/lib/extraction/pipeline";
import { getExtractionProfile, isTwoPassVersion, withTwoPass } from "@/lib/extraction/prompt";
import { TWO_PASS_CALL_TIMEOUT_MS } from "@/lib/extraction/two-pass";
import { cropBlocksForReading } from "@/lib/images/crop";
import { prepareImageForModel } from "@/lib/images/rotate";
import { snapReadingBoxes } from "@/lib/images/snap-boxes";
import { createMetaCaller } from "@/lib/meta/transport";
import { createServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseExtractionRepo } from "./extraction-repo";
import { createPersonalizer, learningSwitchOn } from "./learning-data";

/** The single production entry point that can spend Meta credits. */
export async function runAnalyze(userClient: SupabaseClient, ownerId: string, request: AnalyzeRequest) {
  const meta = getMetaConfig();
  const limits = getLimitsConfig();
  const repo = createSupabaseExtractionRepo({ userClient, serviceClient: createServiceSupabase(), ownerId });
  // Prompt 5 or 7 only when he switched learning on (P3, T6); his notes are read through his own client.
  const personalize = (await learningSwitchOn(userClient)) ? createPersonalizer(userClient) : undefined;
  // U3: a two-pass run makes two steps in a row, so each call gets a shorter timeout.
  const twoPass = isTwoPassVersion(withTwoPass(getExtractionProfile()).promptVersion);
  return analyzeDocument(
    {
      repo,
      callModel: createMetaCaller(twoPass ? { ...meta, timeoutMs: Math.min(meta.timeoutMs, TWO_PASS_CALL_TIMEOUT_MS) } : meta),
      now: () => new Date(),
      prepareImage: prepareImageForModel,
      personalize,
      cropBlocks: cropBlocksForReading, // U3: used only when SCRIBA_TWO_PASS is on
      snapBoxes: (image, extraction) => snapReadingBoxes(image.imageBytes, extraction), // F2 fix 6
    },
    {
      modelId: meta.modelId,
      extractionsPerHour: limits.extractionsPerHour,
      extractionsPerDay: limits.extractionsPerDay,
      stalePendingMs: limits.stalePendingMs,
    },
    request,
  );
}
