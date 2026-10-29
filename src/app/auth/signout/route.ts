import { type NextRequest, NextResponse } from "next/server";
import { createUserSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createUserSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
