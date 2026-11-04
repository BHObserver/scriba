"use client";

import { ReceiptText } from "lucide-react";
import { LineStrip } from "@/components/kit";
import { OrientedImage } from "@/components/photo-orientation";
import { useI18n } from "@/lib/i18n/client";
import type { I18n } from "@/lib/i18n/format";
import type { BlockValues } from "@/lib/ledger/types";
import type { ReviewRow } from "@/lib/review/state";
import { type MemoView, memoRegion } from "./ask-memo";
import { type AccountFigures, blockRegion, blockTone } from "./ask-model";
import type { Photo } from "./reading-view";

/** What a block is called on its tag and card: the party as written, else its kind. */
export function blockName({ t, digits }: I18n, block: BlockValues | null): string {
  if (!block) return t("asks.ov.page");
  return block.party?.trim() ? digits(block.party.trim()) : t(`q.kind.${block.kind}`);
}

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

/**
 * U4: the company's memo beside a question that takes its figures from it: the printed lines the
 * question names (or the letterhead, when it names none), under whose memo it is.
 */
export function MemoStrip({ memo, lines, height = 92 }: { memo: MemoView; lines: readonly string[]; height?: number }) {
  const { t, digits } = useI18n();
  if (!memo.photo.src) return null;
  const { src, width, height: photoHeight, turns } = memo.photo;
  return (
    <figure className="as-memo">
      <figcaption className="as-memo-h">
        <ReceiptText size={16} aria-hidden="true" />
        <span>{t("asks.memo")}</span>
        {memo.company ? <b>{digits(memo.company)}</b> : null}
      </figcaption>
      <LineStrip src={src} box={memoRegion(memo, lines)} photoWidth={width} photoHeight={photoHeight} turns={turns} height={height} tag={false} />
    </figure>
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

const NOW_LABEL = { supplier: "asks.visit.now", customer: "asks.cust.now" } as const;

/** "Owed now" or "due now", by who is on the other side of the account. */
export const nowLabel = (figures: AccountFigures) => NOW_LABEL[figures.party];
