import { NextResponse } from "next/server";
import { z } from "zod";
import { dhakaDate } from "@/lib/ledger/dates";
import { apiUser, jsonError } from "@/lib/server/auth";
import { saveDayClose } from "@/lib/server/shop-data";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  countedCashPoisha: z.number().int().min(0).max(100_000_000_000),
  note: z.string().trim().max(500).nullish(),
});

/**
 * Close a day with the cash he counted. The expected cash, its breakdown and the gap are
 * computed on the server from his confirmed lines; the client sends only what he counted.
 */
export async function POST(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid close request.", 400);
  if (parsed.data.date > dhakaDate(new Date())) return jsonError("A day can't be closed before it starts.", 400);

  const snapshot = await saveDayClose(auth.supabase, auth.user.id, {
    date: parsed.data.date,
    countedCashPoisha: parsed.data.countedCashPoisha,
    note: parsed.data.note || null,
  }).catch(() => null);
  if (!snapshot) return jsonError("The day couldn't be closed. Nothing was saved; try again.", 500);
  return NextResponse.json({ close: snapshot });
}
