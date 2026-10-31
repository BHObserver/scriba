import { ReadingQueueProvider } from "@/components/capture/reading-queue";
import { RouteTransition } from "@/components/shell/route-transition";
import { TabBar } from "@/components/shell/tab-bar";
import { requireUser } from "@/lib/server/auth";

/**
 * The signed-in shell: the khata's red binding band on top, the tab bar below, screens between.
 * The reading queue sits above the screens, so a page keeps being read while the user moves on.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <ReadingQueueProvider>
      <main className="app-main">
        <RouteTransition>{children}</RouteTransition>
      </main>
      <TabBar />
    </ReadingQueueProvider>
  );
}
