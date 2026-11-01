import type { MessageKey } from "@/lib/i18n/messages";

export type TabId = "today" | "khata" | "dues" | "more";

/**
 * Bottom-bar destinations. Routes that don't exist yet point at the closest working page, so
 * every tab leads somewhere real; each build session switches its tab when its page lands:
 * B4 today → "/", B5 dues → "/parties", B6 khata → "/history" (all done). The camera is "/capture" (B2).
 */
export const TABS: ReadonlyArray<{ id: TabId; label: MessageKey; href: string; match: readonly string[] }> = [
  { id: "today", label: "tab.today", href: "/", match: ["/"] },
  { id: "khata", label: "tab.khata", href: "/history", match: ["/history"] },
  { id: "dues", label: "tab.dues", href: "/parties", match: ["/parties"] },
  // Confirmed lines and accuracy are details pages reached from Settings (MASTER_PLAN routes).
  { id: "more", label: "tab.more", href: "/settings", match: ["/settings", "/evaluation", "/records", "/documents"] },
];

export const CAMERA_HREF = "/capture";

/** Flow screens (camera, checking a page, closing the day) take the whole screen: no tab bar. */
const FLOW_PREFIXES = ["/capture", "/check", "/close"] as const;

export function isFlowRoute(pathname: string): boolean {
  return FLOW_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function activeTab(pathname: string): TabId | null {
  for (const tab of TABS) {
    for (const prefix of tab.match) {
      if (prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)) return tab.id;
    }
  }
  return null;
}
