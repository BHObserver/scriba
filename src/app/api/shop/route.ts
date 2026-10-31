import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, jsonError } from "@/lib/server/auth";
import { loadShopProfile, saveShopProfile } from "@/lib/server/shop-data";

const bodySchema = z.object({
  shopName: z.string().trim().min(1).max(80),
  language: z.enum(["bn", "en"]),
  openingCashPoisha: z.number().int().min(0).max(100_000_000_000),
});

/** The shop profile, or `null` before onboarding (`/welcome`). */
export async function GET() {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ profile: await loadShopProfile(auth.supabase) });
}

/** Create or change the shop name, language and usual morning cash. */
export async function PUT(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid shop details.", 400);
  const saved = await saveShopProfile(auth.supabase, auth.user.id, parsed.data).then(
    () => true,
    () => false,
  );
  if (!saved) return jsonError("The shop details couldn't be saved.", 500);
  return NextResponse.json({ profile: await loadShopProfile(auth.supabase) });
}
