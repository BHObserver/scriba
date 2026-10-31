import { NextResponse } from "next/server";
import { STORAGE_BUCKET } from "@/lib/config";
import { type LineCrop, stackLineCrops } from "@/lib/images/crop";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import type { BoundingBox } from "@/lib/ledger/types";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { hasPhoto } from "@/lib/shop/rows";

const MAX_CROP_LINES = 8;

/**
 * `?records=id1,id2,…` (up to 8 confirmed lines): the handwritten lines cut from his photos,
 * stacked top to bottom as one JPEG, for a reminder's attachment. Everything is read through
 * his own client, so only his photos can be cut. Lines without a photo or a box are skipped;
 * 404 when none is left.
 */
export async function GET(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const ids = [...new Set((new URL(request.url).searchParams.get("records") ?? "").split(","))].filter((id) => UUID_RE.test(id));
  if (ids.length === 0 || ids.length > MAX_CROP_LINES) return jsonError(`Ask for 1 to ${MAX_CROP_LINES} lines.`, 400);

  const { data: records } = await supabase.from("confirmed_records").select("id, document_id, run_id, extracted_entry_id").in("id", ids);
  const rows = ids.flatMap((id) => records?.find((r) => r.id === id) ?? []);
  const entryIds = rows.map((r) => r.extracted_entry_id).filter((id): id is string => !!id);
  const docIds = [...new Set(rows.map((r) => r.document_id as string))];
  const runIds = [...new Set(rows.map((r) => r.run_id as string))];
  if (entryIds.length === 0) return jsonError("No photo for these lines.", 404);

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

  const image = await stackLineCrops(lines).catch(() => null);
  if (!image) return jsonError("No photo for these lines.", 404);
  return new NextResponse(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=600", "Content-Disposition": 'inline; filename="scriba-lines.jpg"' },
  });
}
