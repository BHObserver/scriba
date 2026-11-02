"use client";

import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonLink, Seal, StatusMark, TopBar } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { BlockValues } from "@/lib/ledger/types";
import type { ReviewRow } from "@/lib/review/state";
import { blockFigures, blockTone } from "./ask-model";
import { BlockCard, PageRegions, blockName, nowLabel } from "./ask-parts";
import type { Photo } from "./reading-view";

type Group = { block: BlockValues | null; rows: ReviewRow[] };

/**
 * The block overview (D5): the page with its parts tinted, how many parts and questions, one
 * card per part with its question count, and a row for the page's own questions.
 */
export function OverviewView({ photo, groups, regions, counts, pageQuestions, sub, backHref, onStart }: { photo: Photo; groups: Group[]; regions: Group[]; counts: ReadonlyMap<string | null, number>; pageQuestions: number; sub: string; backHref: string; onStart: () => void }) {
  const { t, count } = useI18n();
  const blocks = groups.filter((g) => g.block != null);
  const questions = [...counts.values()].reduce((s, n) => s + n, 0);
  return (
    <div className="flow column">
      <TopBar title={t("asks.kicker")} sub={sub} backHref={backHref} />
      <div className="pad as-scroll">
        <div className="as-hero">
          <PageRegions photo={photo} groups={regions} />
          <div>
            <h1 className="as-title">{blocks.length === 1 ? t("asks.ov.title1") : t("asks.ov.title", blocks.length)}</h1>
            <p className="t-body">{questions > 0 ? t("asks.ov.sub", questions) : t("asks.ov.none")}</p>
          </div>
        </div>
        {pageQuestions > 0 ? (
          <div className="as-pagerow">
            <span>{t("asks.ov.nodate")}</span>
            <span className="as-qchip">{t("asks.ov.q", count(pageQuestions))}</span>
          </div>
        ) : null}
        {blocks.map(({ block, rows }, i) => {
          const n = counts.get(block!.id) ?? 0;
          return (
            <button key={block!.id} type="button" className="as-block" onClick={onStart}>
              <span className={`as-n r-${blockTone(block)}`} aria-hidden="true">
                {count(i + 1)}
              </span>
              <BlockCard block={block} rows={rows} compact aside={n > 0 ? <span className="as-qchip">{t("asks.ov.q", count(n))}</span> : null} />
            </button>
          );
        })}
      </div>
      <div className="pad column as-dock">
        <Button variant="red" wide onClick={onStart}>
          {t("asks.ov.start")}
        </Button>
      </div>
    </div>
  );
}

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
            return (
              <div key={block.id} className="as-ps-row">
                <span className={`as-avatar r-${blockTone(block)}`} aria-hidden="true">
                  {f.kind === "total" ? count(f.lines) : Array.from(blockName(i18n, block)).slice(0, 2).join("")}
                </span>
                <span>{label}</span>
                <b className="as-num">{figure}</b>
              </div>
            );
          })}
        </div>
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
