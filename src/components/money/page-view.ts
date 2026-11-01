import type { PageInfo } from "@/lib/shop/rows";
import type { DayPageView } from "./money-model";

/** Only what the money screens show of a page, so the client gets no more than it needs. */
export function toPageView(page: PageInfo): DayPageView {
  return { documentId: page.documentId, state: page.state, waitingLines: page.waitingLines, confirmedLines: page.confirmedLines };
}
