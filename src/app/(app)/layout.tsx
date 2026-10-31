import { RouteTransition } from "@/components/shell/route-transition";
import { TabBar } from "@/components/shell/tab-bar";
import { requireUser } from "@/lib/server/auth";

/** The signed-in shell: the khata's red binding band on top, the tab bar below, screens between. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <>
      <main className="app-main">
        <RouteTransition>{children}</RouteTransition>
      </main>
      <TabBar />
    </>
  );
}
