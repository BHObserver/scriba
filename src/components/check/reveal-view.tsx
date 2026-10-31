"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { OrientedImage } from "@/components/photo-orientation";
import { Button, ButtonLink, Chip, EmptyState, StatusMark, TopBar } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { BoundingBox } from "@/lib/ledger/types";
import { type PageState, type ReviewRow, toValidationInput } from "@/lib/review/state";
import { validateLedger } from "@/lib/validation/engine";
import { revealLines, stateCounts } from "./line-state";
import type { Photo } from "./reading-view";

const clamp = (n: number) => Math.min(1000, Math.max(0, n));

/** A line's box on the 0–1000 grid as CSS percentages, padded a little so the ink isn't cut. */
function boxStyle(box: BoundingBox, index: number, settled: boolean): CSSProperties {
  const x1 = clamp(Math.min(box.x_min, box.x_max));
  const x2 = clamp(Math.max(box.x_min, box.x_max));
  const y1 = clamp(Math.min(box.y_min, box.y_max));
  const y2 = clamp(Math.max(box.y_min, box.y_max));
  return {
    left: `${Math.max(0, x1 / 10 - 1)}%`,
    top: `${y1 / 10}%`,
    width: `${Math.min(100, (x2 - x1) / 10 + 1.5)}%`,
    height: `${(y2 - y1) / 10}%`,
    animationDelay: `${index * 60}ms`,
    transitionDelay: settled ? `${index * 90}ms` : "0ms",
  };
}

/** The "!" badge, centred on the left edge of a problem line's box. */
function badgeStyle(box: BoundingBox, index: number): CSSProperties {
  const x1 = clamp(Math.min(box.x_min, box.x_max));
  const yMid = (clamp(box.y_min) + clamp(box.y_max)) / 2;
  return { left: `${Math.max(0, x1 / 10 - 1)}%`, top: `${yMid / 10}%`, animationDelay: `${index * 90}ms` };
}

/**
 * The reveal (DESIGN_SPEC D2): the boxes Scriba read draw onto the photo one by one (60 ms
 * stagger), then settle green, turmeric or plain as the code checks' results land. The checks
 * are the real validator over the page's current values, run here in the browser.
 */
export function RevealView({
  photo,
  rows,
  page,
  sub,
  backHref,
  onStart,
  nextHref,
  nextPage,
}: {
  photo: Photo;
  rows: readonly ReviewRow[];
  page: PageState;
  sub: string;
  backHref: string;
  /** Opens the check deck. */
  onStart: () => void;
  nextHref?: string | null;
  /** The next page's number, for "See page 2". */
  nextPage?: number;
}) {
  const { t } = useI18n();
  const findings = useMemo(() => validateLedger(toValidationInput({ page, rows: [...rows] })), [page, rows]);
  const lines = useMemo(() => revealLines(rows, findings), [rows, findings]);
  const counts = useMemo(() => stateCounts(rows, findings), [rows, findings]);
  const total = counts.ok + counts.look + counts.plain;

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setSettled(true), reduced ? 200 : lines.length * 60 + 520);
    return () => clearTimeout(timer);
  }, [lines.length]);

  return (
    <div className="flow column">
      <TopBar title={t("rv.title")} sub={sub} backHref={backHref} />
      <div className="rv-wrap">
        {photo.src ? (
          <OrientedImage src={photo.src} alt={t("rv.photo", lines.length)} turns={photo.turns} size={photo} maxHeightVh={56}>
            {lines.map((line, i) => (
              <div key={line.id} className={cx("rv-box", settled && line.state)} style={boxStyle(line.box, i, settled)} aria-hidden="true" />
            ))}
            {/* Badges sit above the boxes, outside their multiply blend, so the "!" mark keeps its colour. */}
            {settled
              ? lines.map((line, i) =>
                  line.state === "look" ? (
                    <span key={line.id} className="rv-badge" style={badgeStyle(line.box, i)} aria-hidden="true">
                      <StatusMark kind="look" />
                    </span>
                  ) : null,
                )
              : null}
          </OrientedImage>
        ) : null}
      </div>
      <section className="card rv-sum" aria-live="polite">
        {settled ? (
          <>
            <h2 className="t-sec">{t("rv.lines", total)}</h2>
            <div className="rv-chips">
              {counts.ok > 0 ? <Chip kind="ok">{t("rv.ok", counts.ok)}</Chip> : null}
              {counts.look > 0 ? <Chip kind="look">{t("rv.look", counts.look)}</Chip> : null}
              {counts.plain > 0 ? <Chip>{t("rv.plain", counts.plain)}</Chip> : null}
            </div>
            <Button variant="red" wide onClick={onStart}>
              {t("rv.start")}
            </Button>
            {nextHref && nextPage ? (
              <ButtonLink href={nextHref} variant="ghost" wide>
                {t("rv.nextPage", nextPage)}
              </ButtonLink>
            ) : null}
          </>
        ) : (
          <p className="t-sec text-ink-soft">{t("rv.checking")}</p>
        )}
      </section>
    </div>
  );
}

/** The reading came back with no lines (D4 `nothing`): nothing was entered anywhere. */
export function NothingView({ title, photo, backHref, retakeHref, onAdd }: { title: string; photo: Photo; backHref: string; retakeHref: string; onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flow column">
      <TopBar title={title} backHref={backHref} />
      <div className="pad pb-main">
        {photo.src ? (
          <div className="pb-photo">
            <OrientedImage src={photo.src} alt="" turns={photo.turns} size={photo} />
          </div>
        ) : null}
        <EmptyState icon="page" title={t("nothing.t")} body={t("nothing.b")} />
        <span className="flex items-center gap-2.5 t-small">
          <StatusMark kind="wait" />
          <span>{t("nothing.safe")}</span>
        </span>
      </div>
      <div className="pad pb-acts">
        <ButtonLink href={retakeHref} variant="red" wide>
          {t("retake")}
        </ButtonLink>
        <Button variant="line" wide onClick={onAdd}>
          {t("nothing.add")}
        </Button>
      </div>
    </div>
  );
}
