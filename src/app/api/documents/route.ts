import { NextResponse } from "next/server";
import { z } from "zod";
import { STORAGE_BUCKET, getLimitsConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/extraction/cache-key";
import { inspectImage } from "@/lib/images/inspect";
import { MAX_MEMOS_PER_PAGE } from "@/lib/memo/schema";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { createServiceSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  storagePath: z.string().max(200),
  originalFilename: z.string().max(255).nullable(),
  clientSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** U4: this photo is a company's memo, photographed with this page. Absent: the photo is a page. */
  memoFor: z.string().regex(UUID_RE).optional(),
});

/** More memos than this on one page is a mistake, not a delivery. */

/**
 * Register an original photograph after the browser has uploaded it to the
 * private bucket (under the user's own folder, enforced by Storage policies).
 *
 * The server re-reads the stored bytes and is the authority on the metadata:
 * real format from magic bytes, dimensions, size and SHA-256. The checksum must
 * match the one the browser computed before upload, so the stored original is
 * proven identical to the file the user picked. Invalid files are deleted.
 *
 * U4: with `memoFor`, the photo is a company memo that belongs to that page. It is read on its
 * own (the same analyze route) and only ever proposes prices for the page's goods.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);
  const { storagePath, originalFilename, clientSha256, memoFor } = parsed.data;

  const [folder, file, ...rest] = storagePath.split("/");
  const fileMatch = file?.match(/^([0-9a-f-]{36})\.(jpg|png|webp)$/);
  if (folder !== user.id || rest.length > 0 || !fileMatch || !UUID_RE.test(fileMatch[1]!)) {
    return jsonError("Invalid storage path.", 400);
  }

  const storage = supabase.storage.from(STORAGE_BUCKET);
  const removeUpload = () => storage.remove([storagePath]);

  if (memoFor) {
    // The page must be one of his own (RLS), and a page, not another memo.
    const [{ data: page }, { count }] = await Promise.all([
      supabase.from("ledger_documents").select("id, kind").eq("id", memoFor).maybeSingle(),
      supabase.from("ledger_documents").select("id", { count: "exact", head: true }).eq("memo_for", memoFor),
    ]);
    if (!page || page.kind !== "page") {
      await removeUpload();
      return jsonError("The page this memo belongs to was not found.", 404);
    }
    if ((count ?? 0) >= MAX_MEMOS_PER_PAGE) {
      await removeUpload();
      return jsonError(`A page can have at most ${MAX_MEMOS_PER_PAGE} memos.`, 409);
    }
  }

  const { data: blob, error: downloadError } = await storage.download(storagePath);
  if (downloadError || !blob) return jsonError("The uploaded file could not be found.", 404);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const limits = getLimitsConfig();
  if (bytes.byteLength > limits.maxUploadBytes) {
    await removeUpload();
    return jsonError(`The photo is larger than ${Math.round(limits.maxUploadBytes / 1024 / 1024)} MB.`, 413);
  }

  const sha256 = sha256Hex(bytes);
  if (sha256 !== clientSha256) {
    await removeUpload();
    return jsonError("The stored file does not match the file you selected (checksum mismatch). Please upload again.", 422);
  }

  const inspection = inspectImage(bytes);
  if (!inspection.ok) {
    await removeUpload();
    return jsonError(inspection.message, 415, { reason: inspection.reason });
  }
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[inspection.mimeType];
  if (fileMatch[2] !== extension) {
    await removeUpload();
    return jsonError("The file extension does not match the image contents.", 415);
  }

  // The same photograph is stored once per user; a re-upload opens the existing document, as
  // long as it is the same kind of photo (the same page, or a memo of the same page).
  const { data: existing } = await supabase.from("ledger_documents").select("id, kind, memo_for").eq("sha256", sha256).maybeSingle();
  if (existing) {
    await removeUpload();
    if ((existing.memo_for ?? null) !== (memoFor ?? null)) {
      return jsonError(
        existing.kind === "memo" ? "This photo is already in Scriba as a company memo." : "This photo is already in Scriba as a page.",
        409,
        { documentId: existing.id },
      );
    }
    return NextResponse.json({ documentId: existing.id, duplicate: true, sha256 });
  }

  const service = createServiceSupabase();
  const { data: inserted, error } = await service
    .from("ledger_documents")
    .insert({
      owner_id: user.id,
      storage_path: storagePath,
      sha256,
      original_filename: originalFilename,
      mime_type: inspection.mimeType,
      byte_size: bytes.byteLength,
      width: inspection.width,
      height: inspection.height,
      has_gps_metadata: inspection.hasGpsMetadata,
      ...(memoFor ? { kind: "memo", memo_for: memoFor } : {}),
    })
    .select("id")
    .single();
  if (error || !inserted) {
    await removeUpload();
    return jsonError("The photo could not be recorded. Nothing was saved; please try again.", 500);
  }
  return NextResponse.json({ documentId: inserted.id, duplicate: false, sha256 }, { status: 201 });
}
