"use client";

import type { ReactNode } from "react";
import { LineStrip } from "@/components/kit";
import { OrientedImage } from "@/components/photo-orientation";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { I18n } from "@/lib/i18n/format";
import type { BlockValues } from "@/lib/ledger/types";
import type { ReviewRow } from "@/lib/review/state";
import { type AccountFigures, blockFigures, blockRegion, blockTone } from "./ask-model";
import type { Photo } from "./reading-view";

/** What a block is called on its tag and card: the party as written, else its kind. */
export function blockName({ t, digits }: I18n, block: BlockValues | null): string {
  if (!block) return t("asks.ov.page");
  return block.party?.trim() ? digits(block.party.trim()) : t(`q.kind.${block.kind}`);
}

/** The first two letters of the party (or the line count) for the card's avatar. */
const initials = (text: string) => Array.from(text.replace(/\s+/g, "")).slice(0, 2).join("");

/** The photo with each block's part of the page tinted in its tone (overview, page seal). */
export function PageRegions({ photo, groups, maxHeightVh }: { photo: Photo; groups: ReadonlyArray<{ block: BlockValues | null; rows: readonly ReviewRow[] }>; maxHeightVh?: number }) {
  const regions = groups.flatMap(({ block, rows }) => {
    const box = block ? blockRegion(rows) : null;
    return box && block ? [{ id: block.id, box, tone: blockTone(block) }] : [];
  });
  if (!photo.src) return <div className="as-page" style={{ aspectRatio: "3 / 4", background: "var(--photo)", borderRadius: 4 }} aria-hidden="true" />;
  return (
    <div className="as-page" aria-hidden="true">
      <OrientedImage src={photo.src} alt="" turns={photo.turns} size={photo} maxHeightVh={maxHeightVh}>
        {regions.map((r) => (
          <i
            key={r.id}
            className={`as-region r-${r.tone}`}
            style={{ left: `${r.box.x_min / 10}%`, top: `${r.box.y_min / 10}%`, width: `${(r.box.x_max - r.box.x_min) / 10}%`, height: `${(r.box.y_max - r.box.y_min) / 10}%` }}
          />
        ))}
      </OrientedImage>
    </div>
  );
}

/** A block's part of the photo, cut round its lines' boxes. */
export function BlockCrop({ rows, photo, height = 112 }: { rows: readonly ReviewRow[]; photo: Photo; height?: number }) {
  const box = blockRegion(rows);
  if (!box || !photo.src) return null;
  return (
    <div className="as-crop">
      <LineStrip src={photo.src} box={box} photoWidth={photo.width} photoHeight={photo.height} turns={photo.turns} height={height} />
    </div>
  );
}

/** The small stamp a block gets when its part is done; the page keeps the big seal. */
export function Stamp({ land }: { land?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={cx("as-stamp", land && "land")} role="img" aria-label={t("asks.stamp")}>
      <span>{t("asks.stamp")}</span>
    </div>
  );
}

export function Kicker({ block }: { block: BlockValues | null }) {
  const i18n = useI18n();
  return (
    <div className="as-kick">
      <i className="as-kick-dot" aria-hidden="true" />
      <span>{i18n.t("asks.kicker")}</span>
      {block ? <span className={`as-tag r-${blockTone(block)}`}>{blockName(i18n, block)}</span> : null}
    </div>
  );
}

/** The photo's day as a calendar leaf, for "no date on the page". */
export function DateTile({ day }: { day: string }) {
  const { t, dayMonth } = useI18n();
  const [d = "", ...month] = dayMonth(day).split(" ");
  return (
    <div className="as-date">
      <b>{d}</b>
      <span>{month.join(" ")}</span>
      <small>{t("asks.ov.nodate")}</small>
    </div>
  );
}

const ACCOUNT_LABELS = {
  supplier: { before: "asks.visit.before", paid: "asks.visit.paid", goods: "asks.visit.goods", now: "asks.visit.now" },
  customer: { before: "asks.cust.before", paid: "asks.cust.paid", goods: "asks.cust.goods", now: "asks.cust.now" },
} as const;

export const nowLabel = (figures: AccountFigures) => ACCOUNT_LABELS[figures.party].now;

/** A goods line as the card names it: the item and its quantity, as written. */
function goodsName(i18n: I18n, row: ReviewRow | undefined): { item: string; qty: string } {
  const v = row?.values;
  const qty = [v?.quantityText, v?.unit].filter(Boolean).join(" ");
  return { item: i18n.digits(v?.item ?? v?.sourceText ?? ""), qty: i18n.digits(qty) };
}

/**
 * A block worked out by code: for a visit or an account, owed before, paid, the goods (a missing
 * price is a gap, never a zero) and owed now; for sales or spending, the total. `compact` lists the
 * goods on one line. `onGap` makes a gap tappable (to price it). `aside` sits at the end of the
 * header, where the stamp goes (the overview's question count).
 */
export function BlockCard({ block, rows, compact, stamp, aside, onGap }: { block: BlockValues | null; rows: readonly ReviewRow[]; compact?: boolean; stamp?: "land" | "still"; aside?: ReactNode; onGap?: (rowId: string) => void }) {
  const i18n = useI18n();
  const { t, money, count } = i18n;
  const figures = blockFigures(block, rows);
  const tone = blockTone(block);
  const name = blockName(i18n, block);
  const stampEl = stamp ? <Stamp land={stamp === "land"} /> : aside;

  if (figures.kind === "total") {
    const items = rows.map((r) => r.values.item).filter((x): x is string => !!x);
    const label = block?.kind === "day_sales" ? "asks.total.sales" : block?.kind === "expenses" ? "asks.total.expenses" : "asks.total";
    return (
      <div className="as-vc">
        <div className="as-vc-head">
          <span className={`as-avatar r-${tone}`} aria-hidden="true">
            {count(figures.lines)}
          </span>
          <div className="as-who">
            <b>{name}</b>
            <span>{[t("asks.lines", figures.lines), i18n.digits(items.slice(0, 4).join(", "))].filter(Boolean).join(" · ")}</span>
          </div>
          {stampEl}
        </div>
        <div className="as-now">
          <span>{t(label)}</span>
          <b className="as-num as-big">{money(figures.total)}</b>
        </div>
      </div>
    );
  }

  const labels = ACCOUNT_LABELS[figures.party];
  const person = block?.person?.trim();
  const rowOf = (id: string) => rows.find((r) => r.id === id);
  return (
    <div className="as-vc">
      <div className="as-vc-head">
        <span className={`as-avatar r-${tone}`} aria-hidden="true">
          {initials(name)}
        </span>
        <div className="as-who">
          <b>{name}</b>
          <span>{[person ? t("asks.visit.rep", i18n.digits(person)) : null, block ? t(`q.kind.${block.kind}`) : null].filter(Boolean).join(" · ")}</span>
        </div>
        {stampEl}
      </div>
      <div className="as-vc-rows">
        {figures.before != null ? (
          <div className="as-vc-row">
            <span>{t(labels.before)}</span>
            <b className="as-num">{money(figures.before)}</b>
          </div>
        ) : null}
        {figures.paid > 0 ? (
          <div className="as-vc-row">
            <span>{t(labels.paid)}</span>
            <b className="as-num">− {money(figures.paid)}</b>
          </div>
        ) : null}
        {figures.goods.length > 0 && compact ? (
          <div className="as-vc-row">
            <span>{t(labels.goods)}</span>
            <span className="t-small text-right">{figures.goods.map((g) => goodsName(i18n, rowOf(g.id)).item).join(", ")}</span>
          </div>
        ) : null}
        {figures.goods.length > 0 && !compact ? (
          <>
            <div className="as-vc-row as-goods-h">
              <span>{t(labels.goods)}</span>
            </div>
            {figures.goods.map((g) => {
              const { item, qty } = goodsName(i18n, rowOf(g.id));
              return (
                <div key={g.id} className="as-vc-row">
                  <span className="as-good-name">
                    {item}
                    {qty ? <i>{qty}</i> : null}
                  </span>
                  {g.amount != null ? (
                    <b className="as-num">+ {money(g.amount)}</b>
                  ) : onGap ? (
                    <button type="button" className="as-gap" onClick={() => onGap(g.id)}>
                      {t("asks.gap")}
                    </button>
                  ) : (
                    <span className="as-gap">{t("asks.gap")}</span>
                  )}
                </div>
              );
            })}
          </>
        ) : null}
      </div>
      <div className="as-now">
        <span>{t(labels.now)}</span>
        {figures.now != null ? (
          <b className="as-num as-big">{money(figures.now)}</b>
        ) : (
          <span className="as-open">
            <b className="as-num">{money(figures.known)}</b>
            <span className="as-gap">{t("asks.gapNow")}</span>
          </span>
        )}
      </div>
    </div>
  );
}
