"use client";

import type { CSSProperties } from "react";
import { useI18n } from "@/lib/i18n/client";
import { stripVars, type GridBox } from "./strip-geometry";

/**
 * One handwritten line cut from the photo by CSS: the signed photo is scaled so the line's box
 * fits the strip (never clipped), centred, and the neighbouring lines above and below are faded.
 * Without a photo (sample records) it says so instead of drawing anything.
 */
export function LineStrip({
  src,
  box,
  photoWidth,
  photoHeight,
  height = 84,
  tag = true,
  reading,
  turns = 0,
}: {
  src: string | null;
  box: GridBox | null;
  photoWidth: number;
  photoHeight: number;
  height?: number;
  tag?: boolean;
  reading?: string;
  /** Quarter turns the photo was read with: the box is on the page as it was sent. */
  turns?: number;
}) {
  const { t } = useI18n();
  const size = { "--strip-h": `${height}px` } as CSSProperties;
  if (!src || !box) return <div className="strip none" style={size}>{t("strip.none")}</div>;
  const odd = turns % 2 === 1;
  const vars = stripVars(box, odd ? photoHeight : photoWidth, odd ? photoWidth : photoHeight);
  return (
    <div className="strip" style={{ ...vars, ...size }} role="img" aria-label={reading ? t("strip.label", reading) : t("from.photo")}>
      {turns % 4 === 0 ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed private photo positioned by CSS, not an optimisable asset
        <img className="strip-img" src={src} alt="" draggable={false} />
      ) : (
        // A turned page: the box sits on the upright frame; the photo is turned inside it.
        <span className={odd ? "strip-img strip-turn odd" : "strip-img strip-turn"} style={{ "--turn": `${(turns % 4) * 90}deg` } as CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
          <img src={src} alt="" draggable={false} />
        </span>
      )}
      <i className="strip-fade" style={{ top: 0 }} aria-hidden="true" />
      <i className="strip-fade" style={{ bottom: 0 }} aria-hidden="true" />
      {tag ? <span className="strip-tag" aria-hidden="true">{t("from.photo")}</span> : null}
    </div>
  );
}
