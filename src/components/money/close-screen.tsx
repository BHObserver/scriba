"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkHref } from "@/components/check/back-href";
import { Button, ButtonLink, Cover, Keypad, type KeypadKey, Money, Seal, Sheet, StatusMark, applyKey, groupTyped } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { DaySummary } from "@/lib/insights/day";
import { type Drill, DrillSheet } from "./drill-sheet";
import { Receipt } from "./money-kit";
import { type DayPageView, closeMode, gapReasons, waitingPages } from "./money-model";

export type CloseView = {
  date: string;
  asOf: string;
  /** The day the Today screen shows (`homeDay`): closing it goes back there. */
  home: string;
  shopName: string | null;
  sample: boolean;
  day: DaySummary;
  pages: DayPageView[];
};

/**
 * দিনের হিসাব: the day's pages and their check state → what should be in the drawer and how it
 * is made → he counts and enters the cash → it matches (the seal) or shows the gap → the day
 * closes. The server recomputes the expected cash when it saves; only the count is sent.
 */
export function CloseScreen(view: CloseView) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const { day } = view;
  const [counted, setCounted] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const mode = closeMode(day, counted);
  const expected = day.expectedCash.poisha;
  const waiting = waitingPages(view.pages, "/close");
  const isToday = view.date === view.asOf;
  const isHome = view.date === view.home;

  const show = (next: Drill) => {
    setDrill(next);
    setDrillOpen(true);
  };

  const finish = async () => {
    if (counted === null || saving) return;
    setSaving(true);
    setFailed(false);
    const res = await fetch("/api/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: view.date, countedCashPoisha: counted }),
    }).catch(() => null);
    if (!res?.ok) {
      setSaving(false);
      setFailed(true);
      return;
    }
    router.push(isHome ? "/" : `/close?date=${view.date}`);
    router.refresh();
  };

  const gap = counted !== null ? counted - expected : 0;
  return (
    <div className="flow close-flow">
      <Cover
        backHref="/"
        shopName={view.shopName}
        sample={view.sample}
        title={t("cl.title", i18n.dayMonth(view.date))}
        label={t("today.drawer")}
        hero={i18n.money(expected)}
        heroLabel={t("td.heroLabel", t("today.drawer"), i18n.money(expected))}
        onHero={() => show({ key: "expected", fromReceipt: false })}
      />
      <div className="column pad money-body">
        {mode === "match" ? <MatchCard counted={counted!} expected={expected} /> : null}
        {mode === "gap" ? <GapCard counted={counted!} expected={expected} /> : null}
        {mode === "closed" ? <ClosedCard day={day} /> : null}
        {failed ? (
          <p className="res-err" role="alert">
            {t("cl.err")}
          </p>
        ) : null}

        {waiting.ids.length > 0 && (mode === "review" || mode === "closed") ? (
          <div className="look-panel">
            <span>
              {waiting.ids.length === 1
                ? t("cl.pendingOne", view.pages.findIndex((p) => p.documentId === waiting.ids[0]) + 1)
                : t("cl.pendingMany", waiting.ids.length)}
            </span>
          </div>
        ) : null}

        <section className="card cl-pg">
          <h2 className="t-sec">{isToday ? t("cl.pages") : t("cl.pagesOn", i18n.dayMonth(view.date))}</h2>
          {view.pages.length === 0 ? <p className="t-small" style={{ padding: "8px 0" }}>{t("cl.noPages")}</p> : null}
          {view.pages.map((p, i) => (
            <PageRow key={p.documentId} page={p} n={i + 1} href={checkHref(p.documentId, { pages: waiting.ids, from: "/close" })} />
          ))}
          {isToday || isHome ? (
            <Link href="/capture" className="cl-add">
              {t("cl.add")}
            </Link>
          ) : null}
        </section>

        <section className="card">
          <h2 className="t-sec sec-h">{t("cl.how")}</h2>
          <Receipt day={day} onPart={(p) => p.key !== "opening" && show({ key: p.key, fromReceipt: false })} />
        </section>
      </div>

      <div className="close-dock">
        <div className="close-dock-in">
          {mode === "review" ? (
            <>
              <Button variant="red" wide onClick={() => setCounting(true)}>
                {t("cl.count")}
              </Button>
              <p className="t-small">{t("cl.countHint")}</p>
            </>
          ) : null}
          {mode === "match" ? (
            <>
              <Button variant="red" wide disabled={saving} onClick={finish}>
                {saving ? t("cl.saving") : t("cl.finish")}
              </Button>
              <p className="t-small">{t("cl.finishB", i18n.money(counted!))}</p>
            </>
          ) : null}
          {mode === "gap" ? (
            <>
              <Button variant="red" wide disabled={saving} onClick={finish}>
                {saving ? t("cl.saving") : t(gap < 0 ? "cl.finishShort" : "cl.finishOver", i18n.money(Math.abs(gap)))}
              </Button>
              <Button variant="line" wide disabled={saving} onClick={() => setCounting(true)}>
                {t("cl.recount")}
              </Button>
            </>
          ) : null}
          {mode === "closed" ? (
            <>
              <Button variant="line" wide onClick={() => setCounting(true)}>
                {t("cl.recount")}
              </Button>
              <p className="t-small">{t("cl.closedB")}</p>
            </>
          ) : null}
        </div>
      </div>

      <CountSheet
        open={counting}
        onClose={() => setCounting(false)}
        onDone={(poisha) => {
          setCounting(false);
          setFailed(false);
          setCounted(poisha);
        }}
      />
      <DrillSheet day={day} asOf={view.asOf} drill={drill} open={drillOpen} onDrill={show} onClose={() => setDrillOpen(false)} />
    </div>
  );
}

function PageRow({ page, n, href }: { page: DayPageView; n: number; href: string }) {
  const { t } = useI18n();
  const state =
    page.state === "checked"
      ? t("cl.pageSub", page.confirmedLines, t("cl.checked"))
      : page.state === "waiting"
        ? t("cl.waitingSub", page.waitingLines)
        : t("cl.unread");
  return (
    <div className="cl-row">
      <span className="cl-ic">
        <StatusMark kind={page.state === "checked" ? "ok" : "look"} />
      </span>
      <span>
        <b>{t("cl.page", n)}</b>
        <span className="t-small">{state}</span>
      </span>
      {page.state === "checked" ? (
        <span />
      ) : (
        <ButtonLink href={href} variant="line" className="btn-sm">
          {t("cl.look")}
        </ButtonLink>
      )}
    </div>
  );
}

function MatchCard({ counted, expected }: { counted: number; expected: number }) {
  const i18n = useI18n();
  return (
    <section className="card res" aria-live="polite">
      <div className="stitch" />
      <div className="res-in">
        <span className="res-seal">
          <Seal land size={100} />
        </span>
        <span className="t-label">{i18n.t("cl.counted")}</span>
        <Money poisha={counted} size="hero" />
        <p className="t-body">{i18n.t("cl.matchB", i18n.money(expected))}</p>
      </div>
    </section>
  );
}

function GapCard({ counted, expected }: { counted: number; expected: number }) {
  const i18n = useI18n();
  const { t } = i18n;
  const gap = counted - expected;
  return (
    <section className="card res gap" aria-live="polite">
      <div className="res-in">
        <span className="t-label">{t("cl.countedN", i18n.money(counted))}</span>
        <span className="res-gap hl">{t(gap < 0 ? "cl.short" : "cl.over", i18n.money(Math.abs(gap)))}</span>
        <p className="t-body">{t("cl.gapB", i18n.money(expected))}</p>
        <ul className="res-why">
          {gapReasons(gap).map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A day closed earlier: what he counted then, and whether lines changed the figure since. */
function ClosedCard({ day }: { day: DaySummary }) {
  const i18n = useI18n();
  const { t } = i18n;
  const close = day.close!;
  const gap = close.gapPoisha;
  return (
    <>
      {close.changedSinceClose ? (
        <div className="look-panel">
          <span>{t("cl.changed", i18n.money(day.expectedCash.poisha))}</span>
        </div>
      ) : null}
      <section className={gap === 0 ? "card res" : "card res gap"}>
        <div className="res-in">
          {gap === 0 && !close.changedSinceClose ? (
            <span className="res-seal">
              <Seal size={100} />
            </span>
          ) : null}
          <span className="t-label">{t("cl.counted")}</span>
          <Money poisha={close.countedPoisha} size="hero" />
          <p className="t-body">
            {gap === 0
              ? t("cl.matchB", i18n.money(close.expectedAtClosePoisha))
              : t(gap < 0 ? "cl.closedShort" : "cl.closedOver", i18n.money(close.expectedAtClosePoisha), i18n.money(Math.abs(gap)))}
          </p>
        </div>
      </section>
    </>
  );
}

/** He counts the notes and coins and enters the total on the keypad. Whole taka. */
function CountSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (poisha: number) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [typed, setTyped] = useState("");
  const onKey = (key: KeypadKey) => setTyped((v) => applyKey(v, key, 7));
  return (
    <Sheet open={open} onClose={onClose} label={t("cs.label")}>
      <div className="fx-head">
        <span className="t-sec">{t("cs.title")}</span>
      </div>
      <p className="t-small count-hint">{t("cs.hint")}</p>
      <div className="fx-field" aria-live="polite">
        <span className="fx-val">
          {`৳${typed ? i18n.digits(groupTyped(typed)) : ""}`}
          <i className="fx-caret" aria-hidden="true" />
        </span>
      </div>
      <div style={{ height: 10 }} />
      <Keypad onKey={onKey} />
      <Button
        variant="red"
        wide
        style={{ marginTop: 12 }}
        disabled={!typed}
        onClick={() => {
          onDone(Number(typed) * 100);
          setTyped("");
        }}
      >
        {t("cs.go")}
      </Button>
    </Sheet>
  );
}
