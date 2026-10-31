import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";

const bodySchema = z.object({ displayName: z.string().trim().min(1).max(200) });

/** Rename a customer or supplier. Lines keep their written name; screens show this one. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/parties/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError("Not found.", 404);
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Write a name.", 400);
  const { data, error } = await auth.supabase.from("parties").update({ display_name: parsed.data.displayName }).eq("id", id).select("id");
  if (error) return jsonError("The name couldn't be saved.", 500);
  if (!data || data.length === 0) return jsonError("Not found.", 404);
  return NextResponse.json({ id, displayName: parsed.data.displayName });
}
