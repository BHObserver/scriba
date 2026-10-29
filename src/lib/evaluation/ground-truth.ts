/**
 * Private ground-truth annotation format. Written by a person from the photograph,
 * independently of any model output, and stored only in the private database or
 * a git-ignored local file.
 */
import { z } from "zod";
import { LEDGER_TYPES, REVIEWABLE_FIELDS, TRANSACTION_TYPES } from "@/lib/ledger/types";

export const GROUND_TRUTH_FORMAT = "scriba-ground-truth-1";

const nullableText = z.string().trim().max(200).nullable().default(null);

export const groundTruthEntrySchema = z.object({
  line: z.number().int().min(1),
  type: z.enum(TRANSACTION_TYPES),
  customer: nullableText,
  item: nullableText,
  /** Numbers as written or normalized ("৩", "3", "1,020"); compared after normalization. */
  quantity: nullableText,
  unit: nullableText,
  rate: nullableText,
  amount: nullableText,
  balance: nullableText,
  /** Fields the annotator could not read in the photo: excluded from scoring. */
  unreadable: z.array(z.enum(REVIEWABLE_FIELDS)).default([]),
  /** The source itself is inconsistent here on purpose (e.g. a wrong written total). */
  expected_flag: z.boolean().default(false),
  note: z.string().max(300).optional(),
});

export const groundTruthSchema = z.object({
  format: z.literal(GROUND_TRUTH_FORMAT),
  sample_id: z.string().trim().min(1).max(40),
  /** "development" samples may inform prompt changes; "held_out" samples must not. */
  split: z.enum(["development", "held_out"]),
  writer: z.string().trim().min(1).max(60),
  manual_transcription_seconds: z.number().int().positive().nullable().default(null),
  page: z.object({ ledger_type: z.enum(LEDGER_TYPES) }),
  entries: z.array(groundTruthEntrySchema).min(1).max(200),
});

export type GroundTruth = z.infer<typeof groundTruthSchema>;
export type GroundTruthEntry = z.infer<typeof groundTruthEntrySchema>;

/** A blank template to fill in by looking at the photograph (never from model output). */
export function groundTruthTemplate(sampleId: string): GroundTruth {
  return {
    format: GROUND_TRUTH_FORMAT,
    sample_id: sampleId,
    split: "development",
    writer: "author",
    manual_transcription_seconds: null,
    page: { ledger_type: "customer_credit" },
    entries: [
      {
        line: 1,
        type: "opening_balance",
        customer: null,
        item: null,
        quantity: null,
        unit: null,
        rate: null,
        amount: "",
        balance: null,
        unreadable: [],
        expected_flag: false,
      },
    ],
  };
}
