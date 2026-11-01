import "server-only";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import type { Shop } from "@/lib/server/shop-data";
import type { HistoryDay } from "@/lib/shop/history";
import type { PageInfo } from "@/lib/shop/rows";
import type { HistoryDayView, HistoryPageView } from "./history-model";

/**
 * Only what History shows of a page; the photo's size and turn place its thumbnail. With
 * `lines`, the page's confirmed lines come along in the order they were written.
 */
export function toHistoryPage(shop: Shop, page: PageInfo, { lines = false } = {}): HistoryPageView {
  const doc = shop.documents.get(page.documentId);
  return {
    ...(lines ? { recordIds: shop.book.records.filter((r) => r.documentId === page.documentId).map((r) => r.id) } : {}),
    documentId: page.documentId,
    state: page.state,
    waitingLines: page.waitingLines,
    confirmedLines: page.confirmedLines,
    photo:
      page.hasPhoto && doc
        ? { width: doc.width, height: doc.height, turns: turnsForProcessingMode(shop.readings.get(page.documentId)?.processing_mode) }
        : null,
  };
}

export function toHistoryDay(shop: Shop, day: HistoryDay, options: { lines?: boolean } = {}): HistoryDayView {
  return {
    date: day.date,
    pages: day.pages.map((p) => toHistoryPage(shop, p, options)),
    salesPoisha: day.sales.poisha,
    waitingPages: day.waitingPages,
    close: day.close,
  };
}
