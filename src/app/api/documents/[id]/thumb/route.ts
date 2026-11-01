import { NextResponse } from "next/server";
import { STORAGE_BUCKET } from "@/lib/config";
import { THUMB_WIDTHS, type ThumbWidth, pageThumbnail } from "@/lib/images/crop";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { hasPhoto } from "@/lib/shop/rows";

/**
 * `?w=96|320`: a small upright copy of one page for History, so a list of days doesn't load
 * every full photo. Read through his own client, so only his pages can be shown. The page is
 * turned the way its latest reading was; the client adds that turn to the URL, so a re-read
 * at another turn gets a fresh image instead of the cached one.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/thumb">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const width = Number(new URL(request.url).searchParams.get("w"));
  if (!THUMB_WIDTHS.includes(width as ThumbWidth)) return jsonError(`Width must be one of ${THUMB_WIDTHS.join(", ")}.`, 400);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const [{ data: doc }, { data: run }] = await Promise.all([
    supabase.from("ledger_documents").select("storage_path, dataset_label").eq("id", id).maybeSingle(),
    supabase
      .from("extraction_runs")
      .select("processing_mode")
      .eq("document_id", id)
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!doc || !hasPhoto(doc)) return jsonError("No photo for this page.", 404);
  const { data: file } = await supabase.storage.from(STORAGE_BUCKET).download(doc.storage_path as string);
  if (!file) return jsonError("No photo for this page.", 404);

  const image = await pageThumbnail(new Uint8Array(await file.arrayBuffer()), turnsForProcessingMode(run?.processing_mode as string | undefined), width as ThumbWidth).catch(
    () => null,
  );
  if (!image) return jsonError("The photo couldn't be opened.", 422);
  return new NextResponse(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
