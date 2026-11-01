import { NextResponse } from "next/server";
import { z } from "zod";
import { STORAGE_BUCKET, getLimitsConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/extraction/cache-key";
import { inspectImage } from "@/lib/images/inspect";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { createServiceSupabase } from "@/lib/supabase/server";

/** A corner as a fraction of the photo's width and height; a dragged dot may sit just outside. */
const corner = z.tuple([z.number().min(-0.05).max(1.05), z.number().min(-0.05).max(1.05)]);

const bodySchema = z.object({
  storagePath: z.string().max(200),
  clientSha256: z.string().regex(/^[0-9a-f]{64}$/),
  corners: z.tuple([corner, corner, corner, corner]),
  cornersSource: z.enum(["detected", "khata", "adjusted"]),
});

/**
 * Keep the camera's own photo beside a flattened page (docs/PLAN_V3.md, C2). The phone uploads
 * it to the private bucket after the reading has started, then calls this. As for the page
 * itself, the server re-reads the stored bytes and is the authority: the checksum must match,
 * the format must be a supported image, and the document must be the user's and not have a
 * camera photo yet. Anything that fails is deleted. Migration 20261102120000.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/documents/[id]/camera">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);
  const { storagePath, clientSha256, corners, cornersSource } = parsed.data;

  const [folder, file, ...rest] = storagePath.split("/");
  const fileMatch = file?.match(/^([0-9a-f-]{36})\.(jpg|png|webp)$/);
  if (folder !== user.id || rest.length > 0 || !fileMatch || !UUID_RE.test(fileMatch[1]!)) {
    return jsonError("Invalid storage path.", 400);
  }

  const storage = supabase.storage.from(STORAGE_BUCKET);
  const removeUpload = () => storage.remove([storagePath]);
  const refuse = async (message: string, status: number) => {
    await removeUpload();
    return jsonError(message, status);
  };

  const { data: doc } = await supabase.from("ledger_documents").select("id, storage_path, camera_path").eq("id", id).maybeSingle();
  if (!doc) return refuse("Not found.", 404);
  if (doc.camera_path) return refuse("This page already has its camera photo.", 409);
  if (doc.storage_path === storagePath) return jsonError("Invalid storage path.", 400);

  const { data: blob, error: downloadError } = await storage.download(storagePath);
  if (downloadError || !blob) return jsonError("The uploaded file could not be found.", 404);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (bytes.byteLength > getLimitsConfig().maxUploadBytes) return refuse("The photo is too large.", 413);
  if (sha256Hex(bytes) !== clientSha256) return refuse("The stored file does not match the photo taken (checksum mismatch).", 422);
  const inspection = inspectImage(bytes);
  if (!inspection.ok) return refuse(inspection.message, 415);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[inspection.mimeType];
  if (fileMatch[2] !== extension) return refuse("The file extension does not match the image contents.", 415);

  const { data: updated, error } = await createServiceSupabase()
    .from("ledger_documents")
    .update({
      camera_path: storagePath,
      camera_sha256: clientSha256,
      camera_width: inspection.width,
      camera_height: inspection.height,
      page_corners: corners,
      corners_source: cornersSource,
    })
    .eq("id", doc.id)
    .eq("owner_id", user.id)
    .is("camera_path", null)
    .select("id");
  if (error || !updated?.length) return refuse("The camera photo could not be recorded.", 500);
  return NextResponse.json({ kept: true }, { status: 201 });
}
