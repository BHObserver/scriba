"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonLink, Seal, StatusMark, TopBar } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { BlockValues } from "@/lib/ledger/types";
import type { ReviewRow } from "@/lib/review/state";
import { blockFigures, blockTone } from "./ask-model";
import { PageRegions, blockName, nowLabel } from "./ask-parts";
import type { Photo } from "./reading-view";

type Group = { block: BlockValues | null; rows: ReviewRow[] };

/** The deck's frame: back to the overview, progress segments tinted by block, ghost cards behind. */
export function DeckFrame({ segments, now, notice, onBack, children }: { segments: ReadonlyArray<{ key: string; tone: string; done: boolean }>; now: number; notice: ReactNode; onBack: () => void; children: ReactNode }) {
  const { t, count } = useI18n();
  return (
    <div className="flow column">
      <div className="as-top pad">
        <button type="button" className="back" onClick={onBack} aria-label={t("asks.back")}>
          <ChevronLeft size={28} aria-hidden="true" />
        </button>
        <div className="as-pg" role="img" aria-label={`${count(now + 1)} / ${count(segments.length)}`}>
          {segments.map((s, i) => (
            <i key={`${s.key}:${i}`} className={cx("as-pg-s", s.done ? "done" : i === now && "now", `r-${s.tone}`)} />
          ))}
        </div>
      </div>
      {notice ? <div className="pad">{notice}</div> : null}
      <div className="as-area">
        <i className="as-ghost g2" aria-hidden="true" />
        <i className="as-ghost g1" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/**
 * The page seal (D5): the page with its parts, the big seal only when nothing is left open, one
 * row per part, then "Add to the khata". With questions left for later, no seal: how many, and
 * "Answer them now"; confirming then sends only the accepted lines (unpriced goods stay out).
 * Before that, each part opens its lines, so a wrong figure seen here can still be fixed (F2).
 * Once the page is in the khata, "Fix this page" (T5) offers to take it out again.
 */
export function PageSealView({
  photo,
  groups,
  regions,
  sealed,
  land,
  later,
  canConfirm,
  busy,
  done,
  notice,
  sub,
  pageNumber,
  nextHref,
  onBack,
  onLater,
  onConfirm,
  onPart,
  onFix,
}: {
  photo: Photo;
  groups: Group[];
  /** The parts' regions on the page: every line the reading put in each part. */
  regions: Group[];
  sealed: boolean;
  land: boolean;
  later: number;
  canConfirm: boolean;
  busy: boolean;
  done: boolean;
  notice: ReactNode;
  sub: string;
  pageNumber: number;
  nextHref: string | null;
  onBack: () => void;
  onLater: () => void;
  onConfirm: () => void;
  /** A part tapped before the page is in the khata: its lines, to fix a figure. */
  onPart: (block: string) => void;
  /** The page is in the khata: "Fix this page" opens the reopen sheet. */
  onFix: () => void;
}) {
  const i18n = useI18n();
  const { t, money, count } = i18n;
  const blocks = groups.filter((g): g is { block: BlockValues; rows: ReviewRow[] } => g.block != null);
  const open = blocks.map((g) => ({ g, f: blockFigures(g.block, g.rows) })).find(({ f }) => f.kind === "account" && f.now == null);
  const title = (() => {
    if (sealed || !open || open.f.kind !== "account") return t("asks.ps.title");
    return `${t(nowLabel(open.f))}: ${money(open.f.known)} ${t("asks.gapNow")}`;
  })();
  return (
    <div className="flow column">
      <TopBar title={t("kh.page", pageNumber)} sub={sub || undefined} onBack={onBack} />
      <div className="as-ps-stage">
        <PageRegions photo={photo} groups={regions} />
        {sealed ? (
          <div className="as-ps-seal">
            <Seal size={116} land={land} />
          </div>
        ) : null}
      </div>
      <div className="pad as-ps-text" aria-live="polite">
        <h1 className="as-title">{title}</h1>
        {later > 0 ? <p className="as-why look">{t("asks.ps.open", later)}</p> : !sealed && open ? <p className="as-why look">{t("asks.bs.gap")}</p> : null}
        {later > 0 && !done ? (
          <div>
            <button type="button" className="as-pill" onClick={onLater}>
              {t("asks.ps.later")}
            </button>
          </div>
        ) : null}
        <div className="as-ps-rows">
          {blocks.map(({ block, rows }) => {
            const f = blockFigures(block, rows);
            const label = f.kind === "account" ? `${blockName(i18n, block)} · ${t(nowLabel(f))}` : blockName(i18n, block);
            const figure = f.kind === "total" ? money(f.total) : f.now != null ? money(f.now) : `${money(f.known)} +`;
            const inner = (
              <>
                <span className={`as-avatar r-${blockTone(block)}`} aria-hidden="true">
                  {f.kind === "total" ? count(f.lines) : Array.from(blockName(i18n, block)).slice(0, 2).join("")}
                </span>
                <span>{label}</span>
                <b className="as-num">{figure}</b>
              </>
            );
            return done ? (
              <div key={block.id} className="as-ps-row">
                {inner}
              </div>
            ) : (
              <button key={block.id} type="button" className="as-ps-row tap" disabled={busy} onClick={() => onPart(block.id)}>
                {inner}
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {done ? null : <p className="as-hint">{t("asks.ps.tap")}</p>}
      </div>
      <div className="pad column as-dock">
        {notice}
        {done ? (
          <>
            <p className="as-ps-done">
              <StatusMark kind="ok" />
              {t("asks.ps.done")}
            </p>
            {nextHref ? (
              <ButtonLink href={nextHref} variant="red" wide>
                {t("rv.nextPage", pageNumber + 1)}
              </ButtonLink>
            ) : (
              <ButtonLink href="/" variant="line" wide>
                {t("sl.today")}
              </ButtonLink>
            )}
            <Button variant="ghost" wide onClick={onFix}>
              {t("ro.cta")}
            </Button>
          </>
        ) : (
          <Button variant="red" wide disabled={busy || !canConfirm} onClick={onConfirm}>
            {t("asks.ps.confirm")}
          </Button>
        )}
      </div>
    </div>
  );
}
