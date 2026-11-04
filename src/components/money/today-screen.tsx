"use client";

import Link from "next/link";
import { useState } from "react";
import { AskPill, AskSheet } from "@/components/ask/ask-sheet";
import { ButtonLink, Cover, EmptyState, Money, Seal, StatusMark } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { DaySummary } from "@/lib/insights/day";
import type { NoteSentence } from "@/lib/insights/note";
import { addDays } from "@/lib/insights/calendar";
import { noteText } from "@/lib/insights/text";
import type { DaySales } from "@/lib/insights/trends";
import { type Drill, DrillSheet } from "./drill-sheet";
import { Split, WeekBars } from "./money-kit";
import { type DayPageView, drawerEquation, outParts, plainMoney, waitingPages, weekLine } from "./money-model";

export type TodayView = {
  /** The day shown: today, or the khata's last day while today has no page (`homeDay`). */
  asOf: string;
  /** The calendar day in Dhaka. */
  today: string;
  shopName: string | null;
  sample: boolean;
  /** Nothing confirmed yet: only the morning cash and the way to the camera. */
  isNewShop: boolean;
  day: DaySummary;
  week: { days: DaySales[]; averagePoisha: number; totalPoisha: number; diffPoisha: number | null };
  dues: { totalPoisha: number; people: number; flagged: number };
  note: NoteSentence[];
  pages: DayPageView[];
  duesHref: string;
  /** The riskiest customer's name, for Ask Scriba's first suggestion. */
  askName: string | null;
};

/**
 * আজ: the red cover with what should be in the drawer, the day's sales and money out, Scriba's
 * note, closing the day, seven days of sales and the dues. Every figure was computed by code
 * from confirmed lines, and every number opens the lines behind it.
 */
export function TodayScreen(view: TodayView) {
  const i18n = useI18n();
  const { t } = i18n;
  const { day } = view;
  const [drill, setDrill] = useState<Drill | null>(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const show = (next: Drill) => {
    setDrill(next);
    setOpen(true);
  };
  const shownDay = `${i18n.weekday(view.asOf)}, ${i18n.dayMonth(view.asOf)}`;
  const isToday = view.asOf === view.today;
  const title = isToday ? t("today.title", shownDay) : t(view.asOf === addDays(view.today, -1) ? "today.title.yesterday" : "today.title.day", shownDay);
  // A day other than today: the note names it, and closing goes to that day.
  const on = isToday ? null : view.asOf === addDays(view.today, -1) ? t("du.yesterday") : i18n.dayMonth(view.asOf);
  const closeHref = isToday ? "/close" : `/close?date=${view.asOf}`;
  const waiting = waitingPages(view.pages);

  if (view.isNewShop) {
    const pending = view.note.filter((s) => s.kind === "pending_pages");
    return (
      <div className={cx("today", waiting.ids.length === 0 && "today-new")}>
        <div className="today-l">
          <Cover
            shopName={view.shopName}
            sample={view.sample}
            title={title}
            label={t("today.drawer")}
            hero={i18n.money(day.opening.poisha)}
            sub={t("today.onlyMorning")}
          />
        </div>
        <div className="pad money-body today-r">
          {waiting.href ? (
            <section className="card note">
              <span className="note-label">{t("td.note")}</span>
              {pending.map((s, i) => (
                <p key={i} className="t-body">
                  {noteText(s, i18n, on)}
                </p>
              ))}
              <ButtonLink href={waiting.href} variant="red" wide>
                {t("td.waiting")}
              </ButtonLink>
            </section>
          ) : (
            <>
              <section className="card">
                <EmptyState title={t("empty.today.t")} body={t("empty.today.b")} />
              </section>
              <span className="em-arrow" aria-hidden="true" />
            </>
          )}
        </div>
      </div>
    );
  }

  const equation = drawerEquation(day, i18n);
  return (
    <div className="today">
      <div className="today-l">
        <Cover
          shopName={view.shopName}
          sample={view.sample}
          title={title}
          label={t("today.drawer")}
          hero={i18n.money(day.expectedCash.poisha)}
          heroLabel={t("td.heroLabel", t("today.drawer"), i18n.money(day.expectedCash.poisha))}
          onHero={() => show({ key: "expected", fromReceipt: false })}
          sub={equation}
        />
        <div className="pad money-body">
          <div className="tiles">
            <button type="button" className="card tile" onClick={() => show({ key: "sales", fromReceipt: false })}>
              <span className="t-label">{t("td.sales")}</span>
              <Money poisha={day.sales.poisha} size="tile" />
              <Split
                parts={[
                  { label: t("td.cash"), poisha: day.cashSales.poisha, tone: "a" },
                  { label: t("td.credit"), poisha: day.creditSales.poisha, tone: "b" },
                ]}
              />
            </button>
            <button type="button" className="card tile" onClick={() => show({ key: "out", fromReceipt: false })}>
              <span className="t-label">{t("td.out")}</span>
              <Money poisha={day.moneyOut.poisha} size="tile" />
              <span className="legend plain">
                {outParts(day).map((p) => (
                  <span key={p.label} className="lg">
                    <span>{`${t(p.label)} ${plainMoney(p.figure.poisha, i18n)}`}</span>
                  </span>
                ))}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="pad money-body today-r">
        {view.note.length > 0 ? (
          <section className="card note">
            <span className="note-label">{t("td.note")}</span>
            {view.note.map((s, i) => (
              <p key={i} className="t-body">
                {noteText(s, i18n, on)}
              </p>
            ))}
            {waiting.href ? (
              <ButtonLink href={waiting.href} variant="line" wide style={{ marginTop: 6 }}>
                {t("td.waiting")}
              </ButtonLink>
            ) : null}
            <AskPill onOpen={() => setAsking(true)} />
          </section>
        ) : (
          <AskPill solo onOpen={() => setAsking(true)} />
        )}

        {day.close ? <ClosedRow day={day} href={closeHref} isToday={isToday} /> : (
          <ButtonLink href={closeHref} variant="red" wide>
            {t("td.close")}
          </ButtonLink>
        )}

        <section className="card wk">
          <div className="wk-head">
            <h2 className="t-sec">{t("td.week")}</h2>
            <span className="t-small">{weekLine(view.week.totalPoisha, view.week.diffPoisha, i18n)}</span>
          </div>
          <WeekBars days={view.week.days} averagePoisha={view.week.averagePoisha} />
        </section>

        {view.dues.people > 0 ? (
          <Link href={view.duesHref} className="card du-link">
            <span className="t-label">{t("td.dues")}</span>
            <Money poisha={view.dues.totalPoisha} size="tile" />
            {view.dues.flagged > 0 ? (
              <span className="why-look">{t("td.dues.flagged", view.dues.flagged)}</span>
            ) : (
              <span className="t-small">{t("td.dues.people", view.dues.people)}</span>
            )}
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </Link>
        ) : null}
        <p className="t-small money-hint">{t("td.hint")}</p>
      </div>

      <DrillSheet day={day} asOf={view.asOf} drill={drill} open={open} onDrill={show} onClose={() => setOpen(false)} />
      <AskSheet open={asking} onClose={() => setAsking(false)} name={view.askName} />
    </div>
  );
}

/** The day, once closed: the seal on a match, otherwise the gap in words. Opens the close screen. */
function ClosedRow({ day, href, isToday }: { day: DaySummary; href: string; isToday: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const close = day.close!;
  const gap = close.gapPoisha;
  const counted = i18n.money(close.countedPoisha);
  const body =
    gap === 0
      ? t(isToday ? "td.closed.matchB" : "td.closed.matchB.day", counted)
      : t(gap < 0 ? "td.closed.short" : "td.closed.over", counted, i18n.money(Math.abs(gap)));
  return (
    <Link href={href} className="card closed">
      {gap === 0 && !close.changedSinceClose ? <Seal size={64} /> : <StatusMark kind="look" />}
      <span className="closed-t">
        <b>{gap === 0 ? t(isToday ? "td.closed.match" : "td.closed.match.day") : t(isToday ? "td.closed.done" : "td.closed.done.day")}</b>
        <span className="t-small">{body}</span>
        {close.changedSinceClose ? <span className="why-look">{t("td.closed.changed")}</span> : null}
      </span>
    </Link>
  );
}
