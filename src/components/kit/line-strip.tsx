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
}: {
  src: string | null;
  box: GridBox | null;
  photoWidth: number;
  photoHeight: number;
  height?: number;
  tag?: boolean;
  reading?: string;
}) {
  const { t } = useI18n();
  const size = { "--strip-h": `${height}px` } as CSSProperties;
  if (!src || !box) return <div className="strip none" style={size}>{t("strip.none")}</div>;
  return (
    <div className="strip" style={{ ...stripVars(box, photoWidth, photoHeight), ...size }} role="img" aria-label={reading ? t("strip.label", reading) : t("from.photo")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed private photo positioned by CSS, not an optimisable asset */}
      <img className="strip-img" src={src} alt="" draggable={false} />
      <i className="strip-fade" style={{ top: 0 }} aria-hidden="true" />
      <i className="strip-fade" style={{ bottom: 0 }} aria-hidden="true" />
      {tag ? <span className="strip-tag" aria-hidden="true">{t("from.photo")}</span> : null}
    </div>
  );
}
