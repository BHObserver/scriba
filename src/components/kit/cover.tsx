"use client";

import type { ReactNode } from "react";
import { BackButton } from "./top-bar";
import { SampleBadge } from "./sample-badge";

/**
 * The red cloth header: Today, Close the day and Welcome only (DIRECTION.md).
 * `hero` is the big figure; pass `onHero` to make it open the lines behind it.
 */
export function Cover({
  shopName,
  sample,
  title,
  label,
  hero,
  heroLabel,
  onHero,
  sub,
  backHref,
  children,
}: {
  shopName?: ReactNode;
  sample?: boolean;
  title?: ReactNode;
  label?: ReactNode;
  hero?: ReactNode;
  heroLabel?: string;
  onHero?: () => void;
  sub?: ReactNode;
  backHref?: string;
  children?: ReactNode;
}) {
  return (
    <header className="cloth">
      <div className="cv-top">
        {backHref ? <BackButton href={backHref} light className="cv-back" /> : null}
        <span className="cv-shop">{shopName}</span>
        {sample ? <SampleBadge /> : null}
      </div>
      {title ? <h1 className="cv-title">{title}</h1> : null}
      {label ? <span className="cv-label">{label}</span> : null}
      {hero != null ? (
        onHero ? (
          <button type="button" className="cv-hero" onClick={onHero} aria-label={heroLabel}>
            {hero}
          </button>
        ) : (
          <span className="cv-hero" aria-label={heroLabel}>{hero}</span>
        )
      ) : null}
      {sub ? <p className="cv-sub">{sub}</p> : null}
      {children}
    </header>
  );
}
