"use client";

import { useEffect, useState } from "react";
import { Button, LineStrip, Sheet, StatusMark } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { CashPart, DaySummary } from "@/lib/insights/day";
import type { LineDetail } from "@/lib/server/shop-data";
import { Receipt } from "./money-kit";
import { type DrillKey, drillFigure, lineWhat } from "./money-model";

/** Which sheet is up: the drawer receipt, or one figure's lines (`fromReceipt` adds a back link). */
export type Drill = { key: DrillKey; fromReceipt: boolean };

type Loaded = { ids: string; lines: LineDetail[] | null; failed: boolean };

/** The confirmed lines behind some record ids, with their strips (POST /api/lines). */
function useLines(recordIds: readonly string[] | null) {
  const ids = recordIds && recordIds.length > 0 ? recordIds.join(",") : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    fetch("/api/lines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ids.split(",") }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { lines: LineDetail[] };
        setLoaded({ ids, lines: body.lines, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ ids, lines: null, failed: true });
      });
    return () => controller.abort();
  }, [ids, attempt]);
  const current = loaded && loaded.ids === ids ? loaded : null;
  return {
    lines: current?.lines ?? null,
    failed: current?.failed ?? false,
    retry: () => {
      setLoaded(null);
      setAttempt((n) => n + 1);
    },
  };
}

/** A confirmed line's handwriting cut from its photo, or why there is none (sample page, no box). */
export function DetailStrip({ line, height = 64, tag }: { line: LineDetail | undefined; height?: number; tag?: boolean }) {
  const { t } = useI18n();
  return (
    <LineStrip
      src={line?.strip?.src ?? null}
      box={line?.strip?.box ?? null}
      photoWidth={line?.strip?.width ?? 0}
      photoHeight={line?.strip?.height ?? 0}
      turns={line?.strip?.turns ?? 0}
      height={line?.strip ? height : 44}
      tag={tag}
      reading={line?.sourceText}
      none={!line || line.samplePage ? undefined : t("strip.noBox")}
    />
  );
}

/** One confirmed line: its handwriting cut from the photo, then the typed reading and amount. */
export function RecordRow({ line }: { line: LineDetail }) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <div className="dr-item">
      <DetailStrip line={line} />
      <div className="dr-meta">
        <span className="dr-what">{lineWhat(line, i18n)}</span>
        <span className="dr-amt">{i18n.money(line.amountPoisha)}</span>
      </div>
      <span className="dr-sub">{`${t(`type.${line.type}`)} · ${i18n.dayMonth(line.date)}`}</span>
    </div>
  );
}

/**
 * Tap any number: the sheet lists the lines behind it, each with its handwriting, and says the
 * sum was made by code. The hero opens the drawer receipt, whose rows open their lines.
 */
export function DrillSheet({
  day,
  asOf,
  drill,
  open,
  onDrill,
  onClose,
}: {
  day: DaySummary;
  asOf: string;
  drill: Drill | null;
  open: boolean;
  onDrill: (drill: Drill) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const lines = drill && drill.key !== "expected" ? drillFigure(day, drill.key) : null;
  const { lines: details, failed, retry } = useLines(open && lines ? lines.figure.recordIds : null);
  const label = !drill || drill.key === "expected" ? t("dr.drawer") : t(lines!.title);
  const onPart = (part: CashPart) => {
    if (part.key !== "opening") onDrill({ key: part.key, fromReceipt: true });
  };
  const when = day.date === asOf ? t("dr.today") : i18n.dayMonth(day.date);

  return (
    <Sheet open={open} onClose={onClose} label={label}>
      {!drill || drill.key === "expected" ? (
        <>
          <div className="dr-head">
            <span className="t-label">{t("today.drawer")}</span>
            <span className="dr-total">{i18n.money(day.expectedCash.poisha)}</span>
            <span className="t-small">{t("dr.rowHint")}</span>
          </div>
          <Receipt day={day} onPart={onPart} flush />
          <p className="t-small" style={{ marginTop: 10 }}>
            {t("dr.creditNote")}
          </p>
        </>
      ) : (
        <>
          {drill.fromReceipt ? (
            <Button variant="ghost" className="dr-back" onClick={() => onDrill({ key: "expected", fromReceipt: false })}>
              {t("dr.back")}
            </Button>
          ) : null}
          <div className="dr-head">
            <span className="t-label">{label}</span>
            <span className="dr-total">{i18n.money(lines!.figure.poisha)}</span>
            <span className="t-small">{t("dr.lines", lines!.figure.recordIds.length, when)}</span>
          </div>
          {lines!.figure.recordIds.length === 0 ? (
            <p className="t-body">{t("dr.none")}</p>
          ) : failed ? (
            <div className="look-panel" role="alert">
              <span>{t("dr.error")}</span>
              <Button variant="line" className="btn-sm" onClick={retry}>
                {t("dr.retry")}
              </Button>
            </div>
          ) : details === null ? (
            <div className="dr-list" aria-busy="true">
              <span className="sr-only">{t("dr.loading")}</span>
              {lines!.figure.recordIds.slice(0, 3).map((id) => (
                <div key={id} className="dr-skel" />
              ))}
            </div>
          ) : (
            <>
              <div className="dr-list">
                {details.map((line) => (
                  <RecordRow key={line.id} line={line} />
                ))}
              </div>
              <div className="dr-foot">
                <StatusMark kind="ok" />
                <span>{t("dr.foot", details.length, i18n.money(lines!.figure.poisha))}</span>
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
