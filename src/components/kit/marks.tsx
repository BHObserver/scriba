import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

export type MarkKind = "ok" | "look" | "wait";

/** A tick (checked), a turmeric "!" (needs a look) or a dot (waiting). Always placed next to words. */
export function StatusMark({ kind, className }: { kind: MarkKind; className?: string }) {
  return (
    <span className={cx("mark", `mark-${kind}`, className)} aria-hidden="true">
      {kind === "ok" ? <Check size={16} strokeWidth={3.5} /> : kind === "look" ? "!" : "·"}
    </span>
  );
}

export function Chip({ kind, children }: { kind?: "ok" | "look"; children: ReactNode }) {
  return (
    <span className={cx("chip", kind && `chip-${kind}`)}>
      <i className="chip-dot" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
