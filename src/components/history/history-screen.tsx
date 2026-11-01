"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AskPill, AskSheet } from "@/components/ask/ask-sheet";
import { Button, ButtonLink, EmptyState, SampleBadge, StatusMark } from "@/components/kit";
import { RecordRow } from "@/components/money/drill-sheet";
import { possessiveName } from "@/components/money/dues-model";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { LineDetail } from "@/lib/server/shop-data";
import { type HistoryDayView, closeStatus, dayTitle, historySections, pageMark, pagesText, searchParties } from "./history-model";
import { PageThumb } from "./page-thumb";

export type HistoryView = {
  asOf: string;
  sample: boolean;
  /** Newest first, as many as asked for. */
  days: HistoryDayView[];
  /** Where older days load, when there are more. */
  moreHref: string | null;
  /** A search from the URL (`?q=`), so back from a result returns to it. */
  query: string;
  searchLimit: number;
  /** The riskiest customer's name, for Ask Scriba's first suggestion. */
  askName: string | null;
};

type Found = { query: string; lines: LineDetail[] | null; failed: boolean };

/** Lines matching the query (GET /api/lines?q=), a moment after he stops typing. */
function useSearch(query: string) {
  const q = query.trim();
  const [found, setFound] = useState<Found | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/lines?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as { lines: LineDetail[] };
          setFound({ query: q, lines: body.lines, failed: false });
        })
        .catch(() => {
          if (!controller.signal.aborted) setFound({ query: q, lines: null, failed: true });
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, attempt]);
  const current = found && found.query === q ? found : null;
  return { q, lines: current?.lines ?? null, failed: current?.failed ?? false, retry: () => setAttempt((n) => n + 1) };
}

/**
 * খাতা: every day he has pages or confirmed lines for, newest first, with its sales, its
 * pages and how the day ended; and a search over names (spelling variants included) and items.
 */
export function HistoryScreen(view: HistoryView) {
  const i18n = useI18n();
  const { t } = i18n;
  const [query, setQuery] = useState(view.query);
  const search = useSearch(query);
  const [asking, setAsking] = useState(false);
  const change = (next: string) => {
    setQuery(next);
    const q = next.trim();
    window.history.replaceState(null, "", q ? `/history?q=${encodeURIComponent(q)}` : "/history");
  };

  return (
    <div className="khata">
      <div className="pad du-top">
        <div className="du-titlebar">
          <h1 className="t-title">{t("kh.title")}</h1>
          {view.sample ? <SampleBadge /> : null}
        </div>
        {view.days.length > 0 ? (
          <div className="kh-search" role="search">
            <Search size={20} strokeWidth={2.5} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t("kh.searchNames")}
              aria-label={t("kh.searchNames")}
              enterKeyHint="search"
              onChange={(e) => change(e.target.value)}
            />
            {query ? (
              <button type="button" className="kh-clear" onClick={() => change("")} aria-label={t("key.clear")}>
                <X size={22} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
        {view.days.length > 0 && !search.q ? <AskPill solo onOpen={() => setAsking(true)} /> : null}
      </div>
      <div className="pad money-body">
        {view.days.length === 0 ? (
          <EmptyState title={t("empty.kh.t")} body={t("empty.kh.b")} />
        ) : search.q ? (
          <SearchResults search={search} limit={view.searchLimit} />
        ) : (
          <>
            {historySections(view.days, view.asOf, i18n).map((section) => (
              <section key={section.key} className="grid gap-3" aria-label={section.label}>
                <h2 className="t-label kh-sec">{section.label}</h2>
                <div className="kh-days">
                  {section.days.map((day) => (
                    <DayCard key={day.date} day={day} asOf={view.asOf} />
                  ))}
                </div>
              </section>
            ))}
            {view.moreHref ? (
              <ButtonLink href={view.moreHref} variant="line" wide scroll={false}>
                {t("kh.more")}
              </ButtonLink>
            ) : null}
          </>
        )}
      </div>
      <AskSheet open={asking} onClose={() => setAsking(false)} name={view.askName} />
    </div>
  );
}

function DayCard({ day, asOf }: { day: HistoryDayView; asOf: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const status = closeStatus(day.close, i18n);
  return (
    <Link href={`/history/${day.date}`} className="card kh-day">
      <span className="kh-date">
        <b>{dayTitle(day.date, asOf, i18n, { weekday: false })}</b>
        <span>{`${i18n.weekday(day.date)} · ${pagesText(day.pages.length, i18n)}`}</span>
      </span>
      <span className="kh-sales" aria-label={t("kh.sales", i18n.money(day.salesPoisha))}>
        {i18n.money(day.salesPoisha)}
      </span>
      {day.pages.length > 0 ? (
        <span className="kh-thumbs" aria-hidden="true">
          {day.pages.map((page) => (
            <span key={page.documentId} className={cx("kh-thumb", page.state !== "checked" && "wait")}>
              <PageThumb page={page} width={38} />
              <StatusMark kind={pageMark(page.state)} />
            </span>
          ))}
        </span>
      ) : null}
      {day.waitingPages > 0 ? (
        <span className="kh-st">
          <StatusMark kind="wait" />
          <span>{`${t("kh.waiting")} · ${pagesText(day.waitingPages, i18n)}`}</span>
        </span>
      ) : null}
      <span className="kh-st">
        <StatusMark kind={status.mark} />
        <span>{status.text}</span>
      </span>
    </Link>
  );
}

function SearchResults({ search, limit }: { search: ReturnType<typeof useSearch>; limit: number }) {
  const i18n = useI18n();
  const { t } = i18n;
  if (search.failed) {
    return (
      <div className="look-panel">
        <span>{t("kh.searchFail")}</span>
        <Button variant="line" className="btn-sm justify-self-start" onClick={search.retry}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (!search.lines) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <span className="t-label kh-sec">{t("kh.searching")}</span>
        <div className="kh-skel" />
        <div className="kh-skel" />
      </div>
    );
  }
  if (search.lines.length === 0) return <EmptyState icon="search" title={t("kh.none.t", search.q)} body={t("kh.none.b")} />;
  const parties = searchParties(search.lines);
  return (
    <>
      <h2 className="t-label kh-sec" aria-live="polite">
        {t("kh.results", search.lines.length, search.q)}
      </h2>
      {parties.length > 0 ? (
        <div className="kh-who">
          {parties.map((p) => (
            <Link key={p.id} href={`/parties/${p.id}`} className="kh-res-who">
              {t("kh.openParty", possessiveName(p.name, i18n))}
            </Link>
          ))}
        </div>
      ) : null}
      <section className="card kh-res">
        {search.lines.map((line) => (
          <RecordRow key={line.id} line={line} />
        ))}
      </section>
      {search.lines.length >= limit ? <p className="t-small money-hint">{t("kh.limit", limit)}</p> : null}
    </>
  );
}
