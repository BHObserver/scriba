import { notFound } from "next/navigation";
import { TabBar } from "@/components/shell/tab-bar";
import { KitBoard } from "./kit-board";

export const metadata = { title: "Kit" };

/**
 * Development only: every primitive on one screen inside the shell (binding band, tab bar), for
 * comparing with the prototype's kit board. Uses no data, so it is open without signing in.
 */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main className="app-main">
        <KitBoard />
      </main>
      <TabBar pulse />
    </>
  );
}
