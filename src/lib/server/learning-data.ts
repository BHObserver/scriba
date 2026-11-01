import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { learningEnabled } from "@/lib/config";
import type { Personalizer } from "@/lib/extraction/pipeline";
import { personalUserText } from "@/lib/extraction/prompt";
import { type LearningSample, buildWriterProfile, personalHints } from "@/lib/learning/profile";
import { hasPhoto } from "@/lib/shop/rows";
import { cutConfirmedLines } from "./line-crops";

/** His newest confirmed lines are what the profile learns from. */
const SAMPLE_LIMIT = 1000;
/**
 * The learning switch lives in his auth metadata ("on" / "off"), not in a table: it is his
 * own preference about his own readings, and it needs no migration. Off unless he turns it on.
 */
const SWITCH_KEY = "scriba_learning";

type SampleRow = {
  id: string;
  document_id: string;
  confirmed_at: string;
  item_name: string | null;
  unit: string | null;
  quantity_text: string | null;
  unit_rate_text: string | null;
  amount_text: string | null;
  balance_text: string | null;
  extracted_entries: {
    quantity_text: string | null;
    unit_rate_text: string | null;
    amount_text: string | null;
    balance_text: string | null;
    bbox: unknown;
  } | null;
};

/** Each confirmed line next to what the model read on it, through his own client (RLS). */
export async function loadLearningSamples(supabase: SupabaseClient): Promise<LearningSample[]> {
  const [records, docs] = await Promise.all([
    supabase
      .from("confirmed_records")
      .select(
        "id, document_id, confirmed_at, item_name, unit, quantity_text, unit_rate_text, amount_text, balance_text, extracted_entries(quantity_text, unit_rate_text, amount_text, balance_text, bbox)",
      )
      .order("confirmed_at", { ascending: false })
      .range(0, SAMPLE_LIMIT - 1),
    supabase.from("ledger_documents").select("id, dataset_label").range(0, 4999),
  ]);
  if (records.error || docs.error) throw new Error("Could not read the lines to learn from.");
  const withPhoto = new Set((docs.data ?? []).filter(hasPhoto).map((d) => d.id as string));
  return (records.data as unknown as SampleRow[]).map((r) => {
    const e = r.extracted_entries;
    return {
      recordId: r.id,
      documentId: r.document_id,
      confirmedAt: r.confirmed_at,
      read: e ? { quantityText: e.quantity_text, rateText: e.unit_rate_text, amountText: e.amount_text, balanceText: e.balance_text } : null,
      confirmed: {
        item: r.item_name,
        unit: r.unit,
        quantityText: r.quantity_text,
        rateText: r.unit_rate_text,
        amountText: r.amount_text,
        balanceText: r.balance_text,
      },
      hasCrop: !!e?.bbox && withPhoto.has(r.document_id),
    };
  });
}

/** Whether new pages are read with his notes: his switch, unless the deployment turned learning off. */
export async function learningSwitchOn(supabase: SupabaseClient): Promise<boolean> {
  if (!learningEnabled()) return false;
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata?.[SWITCH_KEY] === "on";
}

export async function setLearningSwitch(supabase: SupabaseClient, on: boolean): Promise<boolean> {
  const { error } = await supabase.auth.updateUser({ data: { [SWITCH_KEY]: on ? "on" : "off" } });
  return !error;
}

/**
 * Prompt 5's notes for one page: learned from every other page he confirmed, never from the
 * page being read. The reference image is cut now, before the cache key is made, so the key
 * always matches what is sent; if it can't be cut, the notes go without it.
 */
export function createPersonalizer(supabase: SupabaseClient): Personalizer {
  return async (doc) => {
    const profile = buildWriterProfile(await loadLearningSamples(supabase), { excludeDocumentId: doc.id });
    let hints = personalHints(profile);
    if (!hints) return null;
    let reference: { imageBytes: Uint8Array; mimeType: string } | null = null;
    if (hints.references.length > 0) {
      const image = await cutConfirmedLines(supabase, hints.references.map((r) => r.recordId)).catch(() => null);
      if (image) reference = { imageBytes: new Uint8Array(image), mimeType: "image/jpeg" };
      else hints = personalHints({ ...profile, references: [] });
    }
    if (!hints) return null;
    return { key: hints.key, text: personalUserText(hints, { withImage: reference !== null }), reference };
  };
}

export type LearningPanel = {
  /** The deployment offers the switch (SCRIBA_LEARNING isn't off). */
  available: boolean;
  on: boolean;
  /** The three swaps seen most, each with its latest line that has a photo (for the strip). */
  confusions: Array<{ written: number; read: number; count: number; exampleId: string | null }>;
  corrected: { numbers: number; pages: number };
  learnedFrom: number;
  /** The lines prompt 5 would show the model, as confirmed record ids. */
  references: string[];
};

export async function loadLearningPanel(supabase: SupabaseClient): Promise<LearningPanel> {
  const [samples, on] = await Promise.all([loadLearningSamples(supabase), learningSwitchOn(supabase)]);
  const profile = buildWriterProfile(samples);
  const croppable = new Set(samples.filter((s) => s.hasCrop).map((s) => s.recordId));
  return {
    available: learningEnabled(),
    on,
    confusions: profile.confusions.slice(0, 3).map((c) => ({
      written: c.written,
      read: c.read,
      count: c.count,
      exampleId: c.recordIds.find((id) => croppable.has(id)) ?? null,
    })),
    corrected: profile.corrected,
    learnedFrom: profile.learnedFrom,
    references: profile.references.map((r) => r.recordId),
  };
}
