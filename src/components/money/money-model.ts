/**
 * What the Today and close-the-day screens show, from the insights engine's results. Pure, so
 * it is tested without a browser. No figure is computed here: every amount comes from the
 * engine (`DaySummary`, `WeekComparison`), which computed it from confirmed lines.
 */
import { checkHref } from "@/components/check/back-href";
import type { I18n } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CashPart, CashPartKey, DaySummary } from "@/lib/insights/day";
import type { DaySales } from "@/lib/insights/trends";
import type { Figure, RecordType } from "@/lib/insights/types";
import type { PageState } from "@/lib/shop/rows";

/** One page of the day, as the screens need it (capture order gives its number). */
export type DayPageView = { documentId: string; state: PageState; waitingLines: number; confirmedLines: number };

/** What a tap on a number opens: the drawer receipt, or the lines behind one figure. */
export type DrillKey = "expected" | "sales" | "out" | Exclude<CashPartKey, "opening">;

const PART_TYPE: Record<Exclude<CashPartKey, "opening">, RecordType> = {
  cash_sale: "cash_sale",
  repayment: "repayment",
  purchase: "purchase",
  supplier_payment: "supplier_payment",
  expense: "expense",
};

/** The lines behind a drill key, and the title of their sheet. */
export function drillFigure(day: DaySummary, key: Exclude<DrillKey, "expected">): { title: MessageKey; figure: Figure } {
  if (key === "sales") return { title: "dr.sales", figure: day.sales };
  if (key === "out") return { title: "dr.out", figure: day.moneyOut };
  const part = day.expectedCash.parts.find((p) => p.key === key);
  return { title: `type.${PART_TYPE[key]}`, figure: part ?? { poisha: 0, recordIds: [] } };
}

/** "Money out" tile legend: stock bought, paid to suppliers, costs. */
export function outParts(day: DaySummary): Array<{ label: MessageKey; figure: Figure }> {
  return [
    { label: "td.out.stock", figure: day.purchases },
    { label: "td.out.suppliers", figure: day.supplierPayments },
    { label: "td.out.costs", figure: day.expenses },
  ];
}

/** A figure without the taka sign, for the cover's equation and the legends: "৪,৩২০". */
export function plainMoney(poisha: number, i18n: I18n): string {
  return i18n.money(poisha).replace("৳", "");
}

/** The cover's equation under the drawer figure. */
export function drawerEquation(day: DaySummary, i18n: I18n): string {
  return i18n.t(
    "td.sub",
    plainMoney(day.opening.poisha, i18n),
    plainMoney(day.cashSales.poisha, i18n),
    plainMoney(day.repayments.poisha, i18n),
    plainMoney(day.moneyOut.poisha, i18n),
  );
}

/** A receipt row's label: the morning cash says where it came from, the rest are line types. */
export function partLabel(part: CashPart, day: DaySummary, i18n: I18n): string {
  if (part.key !== "opening") return i18n.t(`type.${PART_TYPE[part.key]}`);
  return day.opening.source === "counted" && day.opening.date
    ? i18n.t("dr.opening.counted", i18n.dayMonth(day.opening.date))
    : i18n.t("dr.opening");
}

/** The bars' top: the week's best day rounded up to a thousand taka (never zero). */
export function weekTop(days: readonly DaySales[]): number {
  const max = Math.max(0, ...days.map((d) => d.sales.poisha));
  return Math.max(100_000, Math.ceil(max / 100_000) * 100_000);
}

/** The line under "Sales, last seven days". */
export function weekLine(total: number, diff: number | null, i18n: I18n): string {
  const sum = i18n.money(total);
  if (diff === null) return i18n.t("td.week.total", sum);
  if (diff === 0) return i18n.t("td.week.same", sum);
  return i18n.t(diff > 0 ? "td.week.up" : "td.week.down", sum, i18n.money(Math.abs(diff)));
}

/** Pages he still has to check, in capture order, and where the first one opens. */
export function waitingPages(pages: readonly DayPageView[], from?: string): { ids: string[]; href: string | null } {
  const ids = pages.filter((p) => p.state !== "checked").map((p) => p.documentId);
  return { ids, href: ids.length > 0 ? checkHref(ids[0]!, { pages: ids, from }) : null };
}

/** Likely reasons for a gap between counted and expected cash (counted − expected). */
export function gapReasons(gapPoisha: number): MessageKey[] {
  return gapPoisha < 0 ? ["cl.why.cost", "cl.why.page", "cl.why.change"] : ["cl.why.sale", "cl.why.page", "cl.why.left"];
}

/**
 * The close screen's state:
 *  - "review": nothing counted yet;
 *  - "match" / "gap": he just counted, against today's expected cash;
 *  - "closed": the day was closed earlier and he hasn't counted again.
 */
export type CloseMode = "review" | "match" | "gap" | "closed";

export function closeMode(day: DaySummary, counted: number | null): CloseMode {
  if (counted !== null) return counted === day.expectedCash.poisha ? "match" : "gap";
  return day.close ? "closed" : "review";
}

type LineReading = { name: string | null; item: string | null; quantityText: string | null; unit: string | null; rateText: string | null; type: RecordType };

/** The parts of a line's reading that were written: name, item, "২ কেজি × ৬০". */
export function readingParts(line: LineReading, i18n: I18n): string[] {
  const qty = line.quantityText ? i18n.digits(line.unit ? `${line.quantityText} ${line.unit}` : line.quantityText) : null;
  const rate = line.rateText ? i18n.digits(line.rateText) : null;
  return [line.name, line.item, qty && rate ? `${qty} × ${rate}` : qty].filter((p): p is string => Boolean(p && p.trim()));
}

/** A drill-down line's reading in one row: "করিম · চাল · ২ কেজি × ৬০". Names stay as written. */
export function lineWhat(line: LineReading, i18n: I18n): string {
  const parts = readingParts(line, i18n);
  return parts.length > 0 ? parts.join(" · ") : i18n.t(`type.${line.type}`);
}
