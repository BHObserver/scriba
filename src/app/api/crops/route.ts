import { NextResponse } from "next/server";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { cutConfirmedLines } from "@/lib/server/line-crops";

const MAX_CROP_LINES = 8;

/**
 * `?records=id1,id2,…` (up to 8 confirmed lines): the handwritten lines cut from his photos,
 * stacked top to bottom as one JPEG, for a reminder's attachment and the learning panel.
 * Everything is read through his own client, so only his photos can be cut. Lines without a
 * photo or a box are skipped; 404 when none is left.
 */
export async function GET(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const ids = [...new Set((new URL(request.url).searchParams.get("records") ?? "").split(","))].filter((id) => UUID_RE.test(id));
  if (ids.length === 0 || ids.length > MAX_CROP_LINES) return jsonError(`Ask for 1 to ${MAX_CROP_LINES} lines.`, 400);

  const image = await cutConfirmedLines(auth.supabase, ids);
  if (!image) return jsonError("No photo for these lines.", 404);
  return new NextResponse(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=600", "Content-Disposition": 'inline; filename="scriba-lines.jpg"' },
  });
}
