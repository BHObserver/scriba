import { NextResponse } from "next/server";
import { STORAGE_BUCKET } from "@/lib/config";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";

/**
 * Delete a document, its extraction runs, reviews and confirmed records (cascade),
 * then the original photograph. Runs as the user, so RLS and Storage policies
 * restrict it to their own data.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { data: doc } = await supabase.from("ledger_documents").select("id, storage_path").eq("id", id).maybeSingle();
  if (!doc) return jsonError("Not found.", 404);

  const { error } = await supabase.from("ledger_documents").delete().eq("id", id);
  if (error) return jsonError("The document could not be deleted.", 500);

  const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
  return NextResponse.json({
    deleted: true,
    // The database rows are gone either way; report honestly if the file remains.
    originalRemoved: !storageError,
  });
}
