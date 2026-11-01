import type { ReactNode } from "react";
import { SampleBadge, TopBar } from "@/components/kit";

/**
 * The top of a details page (all photos, confirmed lines, accuracy, one photo's record): the
 * shell's top bar with the way back, the sample badge, and one line saying what these pages are.
 * Their audit internals (run history, token counts, metric definitions) stay in English.
 */
export function DetailsTop({ title, sub, backHref, sample, note }: { title: ReactNode; sub?: ReactNode; backHref: string; sample: boolean; note: string }) {
  return (
    <>
      <TopBar title={title} sub={sub} backHref={backHref} right={sample ? <SampleBadge /> : undefined} />
      <p className="t-small dt-note">{note}</p>
    </>
  );
}
