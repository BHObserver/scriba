import type { I18n } from "@/lib/i18n/format";
import { addDays } from "@/lib/insights/calendar";
import type { OpeningCash } from "@/lib/insights/day";

/** Where today's morning cash came from, in his words. */
export function openingSub(opening: OpeningCash, asOf: string, i18n: I18n): string {
  if (opening.source === "closed") return i18n.t("more.morning.closed");
  if (opening.source === "counted" && opening.date) {
    return opening.date === addDays(asOf, -1) ? i18n.t("more.morning.sub") : i18n.t("more.morning.counted", i18n.dayMonth(opening.date));
  }
  return i18n.t("more.morning.usual");
}
