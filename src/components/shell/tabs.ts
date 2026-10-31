import type { MessageKey } from "@/lib/i18n/messages";

export type TabId = "today" | "khata" | "dues" | "more";

/**
 * Bottom-bar destinations. Routes that don't exist yet point at the closest working page, so
 * every tab leads somewhere real; each build session switches its tab when its page lands:
 * B4 today → "/", B6 khata → "/history", B5 dues → "/parties", B2 camera → "/capture".
 */
export const TABS: ReadonlyArray<{ id: TabId; label: MessageKey; href: string; match: readonly string[] }> = [
  { id: "today", label: "tab.today", href: "/", match: ["/"] },
  { id: "khata", label: "tab.khata", href: "/documents", match: ["/documents", "/history"] },
  { id: "dues", label: "tab.dues", href: "/records", match: ["/records", "/parties"] },
  { id: "more", label: "tab.more", href: "/settings", match: ["/settings", "/evaluation"] },
];

export const CAMERA_HREF = "/documents#upload";

export function activeTab(pathname: string): TabId | null {
  for (const tab of TABS) {
    for (const prefix of tab.match) {
      if (prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)) return tab.id;
    }
  }
  return null;
}
