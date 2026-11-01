"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { CashPart, DaySummary } from "@/lib/insights/day";
import type { DaySales } from "@/lib/insights/trends";
import { partLabel, plainMoney, weekTop } from "./money-model";

/** One whole in parts: a thin bar, and a legend that carries the values (DESIGN_SPEC `Split`). */
export function Split({ parts }: { parts: Array<{ label: string; poisha: number; tone: "a" | "b" }> }) {
  const i18n = useI18n();
  const shown = parts.filter((p) => p.poisha > 0);
  return (
    <>
      <span
        className={cx("split", shown.length === 0 && "empty")}
        role="img"
        aria-label={parts.map((p) => `${p.label} ${i18n.money(p.poisha)}`).join(", ")}
      >
        {shown.map((p) => (
          <i key={p.label} className={`sw-${p.tone}`} style={{ flex: `${p.poisha} 1 0` }} />
        ))}
      </span>
      <span className="legend" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.label} className="lg">
            <i className={`sw-${p.tone}`} />
            <span>{`${p.label} ${plainMoney(p.poisha, i18n)}`}</span>
          </span>
        ))}
      </span>
    </>
  );
}

/**
 * Seven days of sales: one series, today in full ink blue, a hairline at the average. Hover,
 * focus or tap a day for its value; a hidden table carries all seven for screen readers.
 */
export function WeekBars({ days, averagePoisha }: { days: readonly DaySales[]; averagePoisha: number }) {
  const i18n = useI18n();
  const [tip, setTip] = useState<number | null>(null);
  const top = weekTop(days);
  const pct = (poisha: number) => `${(poisha / top) * 100}%`;
  const shown = tip ?? days.length - 1;
  return (
    <figure style={{ margin: 0 }}>
      <div className="wk-plot">
        {averagePoisha > 0 ? (
          <i className="wk-avg" style={{ bottom: pct(averagePoisha) }} aria-hidden="true">
            <span>{i18n.t("td.week.avg", plainMoney(Math.round(averagePoisha / 100) * 100, i18n))}</span>
          </i>
        ) : null}
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            className={cx("wk-col", i === days.length - 1 && "now", tip === i && "on")}
            onMouseEnter={() => setTip(i)}
            onMouseLeave={() => setTip(null)}
            onFocus={() => setTip(i)}
            onBlur={() => setTip(null)}
            onClick={() => setTip(i)}
            aria-label={i18n.t("td.week.bar", i18n.weekday(d.date), i18n.dayMonth(d.date), i18n.money(d.sales.poisha))}
          >
            {shown === i ? (
              <span className="wk-val" style={{ bottom: pct(d.sales.poisha) }}>
                {i18n.money(d.sales.poisha)}
              </span>
            ) : null}
            <i className="wk-bar" style={{ height: pct(d.sales.poisha) }} />
          </button>
        ))}
      </div>
      <div className="wk-days" aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.date} className={i === days.length - 1 ? "now" : undefined}>
            {i18n.weekdayShort(d.date)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{i18n.t("td.week")}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{`${i18n.weekday(d.date)}, ${i18n.dayMonth(d.date)}`}</th>
              <td>{i18n.money(d.sales.poisha)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** How the drawer figure is made, one row per part; rows with lines open them. */
export function Receipt({ day, onPart, flush }: { day: DaySummary; onPart: (part: CashPart) => void; flush?: boolean }) {
  const i18n = useI18n();
  const sign = (p: CashPart) => (p.key === "opening" ? "" : p.sign > 0 ? "+ " : "− ");
  return (
    <div className={cx("rcpt", flush && "flush")}>
      {day.expectedCash.parts.map((p) => (
        <button key={p.key} type="button" className="rc-row" disabled={p.recordIds.length === 0} onClick={() => onPart(p)}>
          <span className="rc-l">{partLabel(p, day, i18n)}</span>
          <span className="rc-n">{sign(p) + plainMoney(p.poisha, i18n)}</span>
        </button>
      ))}
      <div className="rc-row total">
        <span className="rc-l">{i18n.t("dr.should")}</span>
        <span className="rc-n">{i18n.money(day.expectedCash.poisha)}</span>
      </div>
    </div>
  );
}
