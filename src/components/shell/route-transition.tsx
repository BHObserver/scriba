"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";

/**
 * Screen transition for every page in the shell: navigations are React transitions, so keying
 * on the path makes the old screen fade out and the new one rise in (globals.css, 220 ms).
 * The binding band and tab bar have their own view-transition names and stay still.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="screen-in" exit="screen-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
