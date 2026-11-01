import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { WelcomeFlow } from "@/components/more/welcome-flow";
import { welcomeStep } from "@/components/more/welcome-steps";
import { requireUser } from "@/lib/server/auth";
import { loadShopProfile } from "@/lib/server/shop-data";

export const metadata = { title: "Welcome" };
// The welcome is the khata's red cover; the browser chrome follows it.
export const viewport: Viewport = { themeColor: "#972622" };

/** Shown once, to a signed-in user whose shop has no profile yet. `?step=` opens a step (for checks). */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const { step } = await searchParams;
  const { supabase } = await requireUser("/welcome");
  if (await loadShopProfile(supabase)) redirect("/");
  const start = welcomeStep(step);
  return (
    <main className="column welcome pt-[7px]">
      <WelcomeFlow start={start} />
    </main>
  );
}
