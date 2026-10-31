"use client";

import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

const SIZE = { hero: "hero-n", tile: "tile-n", card: "card-n", inline: "num" } as const;

/** Integer poisha shown as taka in the locale's digits with lakh grouping: ৳১,২৩,৪৫০. */
export function Money({ poisha, size = "inline", className }: { poisha: number | null | undefined; size?: keyof typeof SIZE; className?: string }) {
  const { money } = useI18n();
  return <span className={cx(SIZE[size], className)}>{money(poisha)}</span>;
}
