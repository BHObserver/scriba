"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Sheet, StatusMark } from "@/components/kit";
import { RecordRow, useLines } from "@/components/money/drill-sheet";
import { useI18n } from "@/lib/i18n/client";
import { type HistoryDayView, type HistoryPageView, linesText, pageHref, pageMark, pageStateText } from "./history-model";
import { PageThumb } from "./page-thumb";

/**
 * The day's pages, two to a row. A page still to check opens the check deck; a checked page
 * opens its lines, each under its handwriting, with a link to the page's full record.
 */
export function DayPages({ day }: { day: HistoryDayView }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [open, setOpen] = useState<{ page: HistoryPageView; n: number } | null>(null);
  const [shown, setShown] = useState(false);

  return (
    <>
      <div className="kh-pages">
        {day.pages.map((page, i) => {
          const body = (
            <>
              <PageThumb page={page} width={140} label={page.photo ? undefined : t("kh.samplePage")} />
              <b>{t("kh.page", i + 1)}</b>
              <span className="kh-st">
                <StatusMark kind={pageMark(page.state)} />
                <span>{pageStateText(page, i18n)}</span>
              </span>
              {page.photo ? null : <span className="kh-page-sample">{t("kh.samplePage")}</span>}
            </>
          );
          return page.state === "checked" && page.recordIds ? (
            <button
              key={page.documentId}
              type="button"
              className="card kh-page"
              onClick={() => {
                setOpen({ page, n: i + 1 });
                setShown(true);
              }}
            >
              {body}
            </button>
          ) : (
            <Link key={page.documentId} href={pageHref(page, day)} className="card kh-page">
              {body}
            </Link>
          );
        })}
      </div>
      <PageLinesSheet page={open?.page ?? null} n={open?.n ?? 0} open={shown} onClose={() => setShown(false)} />
    </>
  );
}

function PageLinesSheet({ page, n, open, onClose }: { page: HistoryPageView | null; n: number; open: boolean; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const ids = page?.recordIds ?? [];
  const { lines, failed, retry } = useLines(open && ids.length > 0 ? ids : null);
  return (
    <Sheet open={open} onClose={onClose} label={t("kh.page", n)}>
      <div className="dr-head">
        <span className="t-sec">{t("kh.page", n)}</span>
        <span className="t-small">{`${t("kh.checked")} · ${linesText(ids.length, i18n)}`}</span>
      </div>
      {ids.length === 0 ? (
        <p className="t-body">{t("dr.none")}</p>
      ) : failed ? (
        <div className="look-panel" role="alert">
          <span>{t("dr.error")}</span>
          <Button variant="line" className="btn-sm" onClick={retry}>
            {t("dr.retry")}
          </Button>
        </div>
      ) : lines === null ? (
        <div className="dr-list" aria-busy="true">
          <span className="sr-only">{t("dr.loading")}</span>
          {ids.slice(0, 3).map((id) => (
            <div key={id} className="dr-skel" />
          ))}
        </div>
      ) : (
        <div className="dr-list">
          {lines.map((line) => (
            <RecordRow key={line.id} line={line} />
          ))}
        </div>
      )}
      {page ? (
        <div className="dr-foot">
          <Link href={`/documents/${page.documentId}`} className="kh-res-who">
            {t("kh.pageRecord")}
          </Link>
        </div>
      ) : null}
    </Sheet>
  );
}
