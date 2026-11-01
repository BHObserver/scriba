import { checkHref } from "@/components/check/back-href";
import type { MarkKind } from "@/components/kit";
import type { I18n } from "@/lib/i18n/format";
import { addDays } from "@/lib/insights/calendar";
import type { CloseStatus } from "@/lib/shop/history";
import type { PageState } from "@/lib/shop/rows";

/** What History shows of a page: its state, its lines, and the size of its upright photo. */
export type HistoryPageView = {
  documentId: string;
  state: PageState;
  waitingLines: number;
  confirmedLines: number;
  /** Sample pages have none; they show a drawn ruled page instead. */
  photo: { width: number; height: number; turns: 0 | 1 | 2 | 3 } | null;
  /** The day view lists a checked page's confirmed lines; the day list doesn't need them. */
  recordIds?: string[];
};

/** What a thumbnail needs (also used by the all-photos details page). */
export type ThumbPage = Pick<HistoryPageView, "documentId" | "photo">;

export type HistoryDayView = {
  date: string;
  /** In capture order. */
  pages: HistoryPageView[];
  salesPoisha: number;
  waitingPages: number;
  close: CloseStatus | null;
};

/** Days shown at first, and added each time he asks for older ones. */
export const HISTORY_DAYS = 30;

/** `?days=` as a whole number of days to show, in steps of 30, never fewer than 30. */
export function shownDays(param: string | string[] | undefined): number {
  const n = Math.floor(Number(typeof param === "string" ? param : NaN));
  if (!Number.isFinite(n) || n <= HISTORY_DAYS) return HISTORY_DAYS;
  return Math.min(Math.ceil(n / HISTORY_DAYS) * HISTORY_DAYS, 3650);
}

export type HistorySection = { key: string; label: string; days: HistoryDayView[] };

/** "This week" (the seven days ending today), then one section per month, newest first. */
export function historySections(days: readonly HistoryDayView[], asOf: string, i18n: I18n): HistorySection[] {
  const weekStart = addDays(asOf, -6);
  const sections: HistorySection[] = [];
  for (const day of days) {
    const week = day.date >= weekStart && day.date <= asOf;
    const key = week ? "week" : day.date.slice(0, 7);
    let section = sections.at(-1);
    if (!section || section.key !== key) {
      section = { key, label: week ? i18n.t("kh.week") : i18n.monthYear(day.date), days: [] };
      sections.push(section);
    }
    section.days.push(day);
  }
  return sections;
}

/**
 * "শনিবার, ৩১ অক্টোবর"; today and yesterday by name. A day card in the list already has the
 * weekday under its title, so there the title is just the date (`weekday: false`).
 */
export function dayTitle(date: string, asOf: string, i18n: I18n, { weekday = true } = {}): string {
  if (date === asOf) return i18n.t("kh.today", i18n.dayMonth(date));
  if (date === addDays(asOf, -1)) return i18n.t("kh.yesterday", i18n.dayMonth(date));
  return weekday ? `${i18n.weekday(date)}, ${i18n.dayMonth(date)}` : i18n.dayMonth(date);
}

export function pageMark(state: PageState): MarkKind {
  return state === "checked" ? "ok" : "wait";
}

/** "৫টি পাতা" / "1 page": English needs the singular. */
export function pagesText(n: number, i18n: I18n): string {
  return n === 1 ? i18n.t("kh.pages.one") : i18n.t("kh.pages", n);
}

export function linesText(n: number, i18n: I18n): string {
  return n === 1 ? i18n.t("kh.lines.one") : i18n.t("kh.lines", n);
}

/** "দেখা হয়েছে · ৮টি লাইন" / "দেখা বাকি · ৫টি লাইন" / "এখনো পড়া হয়নি". */
export function pageStateText(page: Pick<HistoryPageView, "state" | "waitingLines" | "confirmedLines">, i18n: I18n): string {
  if (page.state === "unread") return i18n.t("kh.unread");
  if (page.state === "waiting") return `${i18n.t("kh.waiting")} · ${linesText(page.waitingLines, i18n)}`;
  return `${i18n.t("kh.checked")} · ${linesText(page.confirmedLines, i18n)}`;
}

/** How the day ended: the close and whether the cash matched, or that it wasn't closed. */
export function closeStatus(close: CloseStatus | null, i18n: I18n): { mark: MarkKind; text: string } {
  if (!close) return { mark: "wait", text: i18n.t("kh.notClosed") };
  if (close.changedSinceClose) return { mark: "look", text: i18n.t("kh.changed") };
  if (close.status === "short") return { mark: "look", text: i18n.t("kh.short", i18n.money(-close.gapPoisha)) };
  if (close.status === "over") return { mark: "look", text: i18n.t("kh.over", i18n.money(close.gapPoisha)) };
  return { mark: "ok", text: i18n.t("kh.closed") };
}

/**
 * Where a page opens: the check flow. A page still waiting brings the day's other waiting pages
 * along, so he can go through them in a row. Back returns to the day.
 */
export function pageHref(page: HistoryPageView, day: Pick<HistoryDayView, "date" | "pages">): string {
  const from = `/history/${day.date}`;
  if (page.state === "checked") return checkHref(page.documentId, { from });
  const queue = day.pages.filter((p) => p.state !== "checked").map((p) => p.documentId);
  return checkHref(page.documentId, { pages: queue, from });
}

/** The small upright copy of a page (GET /api/documents/[id]/thumb); the turn keeps the cache honest. */
export function thumbSrc(page: ThumbPage, width: 96 | 320): string | null {
  return page.photo ? `/api/documents/${page.documentId}/thumb?w=${width}&t=${page.photo.turns}` : null;
}

/** The photo's height at `width` once turned upright; sample pages use a khata page's 3 : 4. */
export function thumbHeight(page: ThumbPage, width: number): number {
  if (!page.photo || page.photo.width <= 0 || page.photo.height <= 0) return Math.round((width * 4) / 3);
  const sideways = page.photo.turns % 2 === 1;
  const [w, h] = sideways ? [page.photo.height, page.photo.width] : [page.photo.width, page.photo.height];
  return Math.round((width * h) / w);
}

/** The day should be closed (again): not closed yet, or lines came after the close; never a future day. */
export function canClose(day: Pick<HistoryDayView, "date" | "close">, asOf: string): boolean {
  return (day.close === null || day.close.changedSinceClose) && day.date <= asOf;
}

/** The people a search found, in the order they first appear (newest line first), at most three. */
export function searchParties(lines: ReadonlyArray<{ partyId: string | null; name: string | null }>, max = 3): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const line of lines) {
    if (seen.size >= max) break;
    if (line.partyId && line.name && !seen.has(line.partyId)) seen.set(line.partyId, line.name);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}
