import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { mergeParty, unmergeParty } from "@/lib/server/shop-data";

const bodySchema = z.object({ into: z.string().regex(UUID_RE) });

const PROBLEMS = {
  missing: [404, "Not found."],
  same: [400, "Pick another name to merge with."],
  kind: [400, "A customer and a supplier can't be merged."],
  source_merged: [409, "This name is already merged into another."],
  cycle: [409, "That name is already merged into this one."],
} as const;

/** Merge this party into `into`: two spellings of one person become one account. */
export async function POST(request: Request, ctx: RouteContext<"/api/parties/[id]/merge">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid merge request.", 400);
  const result = await mergeParty(auth.supabase, auth.user.id, id, parsed.data.into).catch(() => null);
  if (!result) return jsonError("The merge couldn't be saved.", 500);
  if (!result.ok) {
    const [status, message] = PROBLEMS[result.problem];
    return jsonError(message, status, { code: result.problem });
  }
  return NextResponse.json({ merged: id, into: parsed.data.into });
}

/** Undo a merge. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/parties/[id]/merge">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const done = await unmergeParty(auth.user.id, id).catch(() => null);
  if (done === null) return jsonError("The merge couldn't be undone.", 500);
  if (!done) return jsonError("This name isn't merged.", 404);
  return NextResponse.json({ unmerged: id });
}
