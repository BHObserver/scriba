import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/config";
import { type LineCrop, stackLineCrops } from "@/lib/images/crop";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import type { BoundingBox } from "@/lib/ledger/types";
import { hasPhoto } from "@/lib/shop/rows";

/**
 * Confirmed lines cut from his photos and stacked top to bottom in the order given, as one
 * JPEG. Everything is read through the client passed in (his own), so only his photos can
 * be cut. Lines without a photo or a box are skipped; null when none is left.
 */
export async function cutConfirmedLines(supabase: SupabaseClient, ids: readonly string[]): Promise<Buffer | null> {
  const { data: records } = await supabase.from("confirmed_records").select("id, document_id, run_id, extracted_entry_id").in("id", ids);
  const rows = ids.flatMap((id) => records?.find((r) => r.id === id) ?? []);
  const entryIds = rows.map((r) => r.extracted_entry_id).filter((id): id is string => !!id);
  const docIds = [...new Set(rows.map((r) => r.document_id as string))];
  const runIds = [...new Set(rows.map((r) => r.run_id as string))];
  if (entryIds.length === 0) return null;

  const [{ data: entries }, { data: docs }, { data: runs }] = await Promise.all([
    supabase.from("extracted_entries").select("id, bbox").in("id", entryIds),
    supabase.from("ledger_documents").select("id, storage_path, dataset_label").in("id", docIds),
    supabase.from("extraction_runs").select("id, processing_mode").in("id", runIds),
  ]);
  const photos = new Map<string, Promise<Uint8Array | null>>();
  const photo = (path: string) => {
    let p = photos.get(path);
    if (!p) {
      p = supabase.storage
        .from(STORAGE_BUCKET)
        .download(path)
        .then(async ({ data }) => (data ? new Uint8Array(await data.arrayBuffer()) : null));
      photos.set(path, p);
    }
    return p;
  };

  const lines: LineCrop[] = [];
  for (const r of rows) {
    const box = entries?.find((e) => e.id === r.extracted_entry_id)?.bbox as BoundingBox | null | undefined;
    const doc = docs?.find((d) => d.id === r.document_id);
    if (!box || !doc || !hasPhoto(doc)) continue;
    const bytes = await photo(doc.storage_path as string);
    if (!bytes) continue;
    const turns = turnsForProcessingMode(runs?.find((x) => x.id === r.run_id)?.processing_mode as string | undefined);
    lines.push({ photoKey: doc.storage_path as string, bytes, turns, box });
  }
  return stackLineCrops(lines).catch(() => null);
}
