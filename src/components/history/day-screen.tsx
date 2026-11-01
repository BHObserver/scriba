import { ButtonLink, SampleBadge, StatusMark, TopBar } from "@/components/kit";
import { getI18n } from "@/lib/i18n/server";
import { DayPages } from "./day-pages";
import { type HistoryDayView, canClose, closeStatus, dayTitle } from "./history-model";

/**
 * A day of the khata: its pages in capture order (DayPages), a reminder that
 * unchecked pages count nowhere, and how the day ended, with the way to close or see it.
 */
export async function DayScreen({ asOf, sample, day }: { asOf: string; sample: boolean; day: HistoryDayView }) {
  const i18n = await getI18n();
  const { t } = i18n;
  const status = closeStatus(day.close, i18n);
  const today = day.date === asOf;
  const closeHref = today ? "/close" : `/close?date=${day.date}`;
  return (
    <div className="khata">
      <TopBar
        title={dayTitle(day.date, asOf, i18n)}
        sub={t("kh.sales", i18n.money(day.salesPoisha))}
        backHref="/history"
        right={sample ? <SampleBadge /> : undefined}
      />
      <div className="pad money-body">
        {day.pages.length > 0 ? (
          <>
            <h2 className="t-label kh-sec">{t("kh.dayPages")}</h2>
            <DayPages day={day} />
          </>
        ) : null}
        {day.waitingPages > 0 ? <div className="look-panel">{t("kh.waitNote")}</div> : null}
        <section className="card kh-close">
          <span className="kh-st">
            <StatusMark kind={status.mark} />
            <span>{status.text}</span>
          </span>
          {canClose(day, asOf) ? (
            <ButtonLink href={closeHref} variant="red" wide>
              {t("td.close")}
            </ButtonLink>
          ) : today ? null : (
            <ButtonLink href={closeHref} variant="line" wide>
              {t("kh.openDay")}
            </ButtonLink>
          )}
        </section>
        {today ? (
          <ButtonLink href="/" variant="line" wide>
            {t("kh.openDay")}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
