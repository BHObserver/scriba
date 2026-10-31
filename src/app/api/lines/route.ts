import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE, apiUser, jsonError } from "@/lib/server/auth";
import { lineDetails, loadShop, searchData } from "@/lib/server/shop-data";

const bodySchema = z.object({ ids: z.array(z.string().regex(UUID_RE)).min(1).max(300) });

/** The confirmed lines behind a figure (drill-down), with their handwriting strips. */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);
  const shop = await loadShop(auth.supabase);
  return NextResponse.json({ lines: await lineDetails(auth.supabase, shop, parsed.data.ids) });
}

/** History search: `?q=` a name (spelling variants and merged parties included) or an item. */
export async function GET(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80);
  const shop = await loadShop(auth.supabase);
  return NextResponse.json({ query: q, lines: await lineDetails(auth.supabase, shop, searchData(shop, q)) });
}
