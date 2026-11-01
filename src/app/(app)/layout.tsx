import { redirect } from "next/navigation";
import { ReadingQueueProvider } from "@/components/capture/reading-queue";
import { RouteTransition } from "@/components/shell/route-transition";
import { TabBar } from "@/components/shell/tab-bar";
import { requireUser } from "@/lib/server/auth";
import { loadShopProfile } from "@/lib/server/shop-data";

/**
 * The signed-in shell: the khata's red binding band on top, the tab bar below, screens between.
 * The reading queue sits above the screens, so a page keeps being read while the user moves on.
 * A shop without a profile opens its halkhata first (/welcome).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase } = await requireUser();
  if (!(await loadShopProfile(supabase))) redirect("/welcome");
  return (
    <ReadingQueueProvider>
      <main className="app-main">
        <RouteTransition>{children}</RouteTransition>
      </main>
      <TabBar />
    </ReadingQueueProvider>
  );
}
