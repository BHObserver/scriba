"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export function BackButton({ href, onBack, light, className }: { href?: string; onBack?: () => void; light?: boolean; className?: string }) {
  const { t } = useI18n();
  const cls = cx("back", light && "light", className);
  const icon = <ChevronLeft size={28} strokeWidth={2.25} aria-hidden="true" />;
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={t("back")} transitionTypes={["nav-back"]}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onBack} aria-label={t("back")}>
      {icon}
    </button>
  );
}

/** Back (44 px), title 20/600, optional subtitle and a right slot (the sample badge). */
export function TopBar({ title, sub, backHref, onBack, right }: { title: ReactNode; sub?: ReactNode; backHref?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {backHref || onBack ? <BackButton href={backHref} onBack={onBack} /> : <span className="w-3.5" />}
      <div className="topbar-text">
        <h1 className="topbar-t">{title}</h1>
        {sub ? <span className="topbar-s">{sub}</span> : null}
      </div>
      {right}
    </header>
  );
}
