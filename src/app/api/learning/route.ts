import { NextResponse } from "next/server";
import { z } from "zod";
import { learningEnabled } from "@/lib/config";
import { apiUser, jsonError } from "@/lib/server/auth";
import { loadLearningPanel, setLearningSwitch } from "@/lib/server/learning-data";

/** What Scriba learned from his corrections (the learning panel's data). Nothing is sent to Meta. */
export async function GET() {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await loadLearningPanel(auth.supabase), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError("Could not read what Scriba learned.", 500);
  }
}

const bodySchema = z.object({ on: z.boolean() });

/** `{ on }`: read his new pages with his notes (prompt 5), or not. Pages already read stay as they are. */
export async function PUT(request: Request) {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;
  if (!learningEnabled()) return jsonError("Learning is turned off on this deployment.", 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);
  if (!(await setLearningSwitch(auth.supabase, parsed.data.on))) return jsonError("Could not save the switch.", 500);
  return NextResponse.json({ on: parsed.data.on });
}
