/** Everything the Today screen shows, from one book, in one call. */
import { type DuesList, duesList } from "./accounts";
import type { Book } from "./book";
import { type DaySummary, daySummary } from "./day";
import { type DayPage, type NoteSentence, scribaNote } from "./note";
import { type WeekComparison, weekComparison } from "./trends";

export type TodayInsights = {
  asOf: string;
  /** Nothing confirmed yet: Today shows only the morning cash and the way to the camera. */
  isNewShop: boolean;
  day: DaySummary;
  week: WeekComparison;
  customerDues: DuesList;
  supplierDues: DuesList;
  note: NoteSentence[];
};

/** `pages` are the pages photographed for `asOf`, in capture order, with their check state. */
export function todayInsights(book: Book, asOf: string, pages: readonly DayPage[]): TodayInsights {
  const day = daySummary(book, asOf);
  const week = weekComparison(book, asOf);
  const customerDues = duesList(book, "customer", asOf);
  const supplierDues = duesList(book, "supplier", asOf);
  return {
    asOf,
    isNewShop: book.records.length === 0,
    day,
    week,
    customerDues,
    supplierDues,
    note: scribaNote({ day, pages, customerDues, week }),
  };
}
