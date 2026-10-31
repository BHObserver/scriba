"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { activeTab, CAMERA_HREF, TABS } from "./tabs";

/** আজ | খাতা | (camera) | বাকি | আরও. The camera pulses while the shop has no pages yet. */
export function TabBar({ pulse = false }: { pulse?: boolean }) {
  const { t } = useI18n();
  const active = activeTab(usePathname());
  const tab = (index: number) => {
    const item = TABS[index]!;
    return (
      <Link key={item.id} href={item.href} className="tab" aria-current={active === item.id ? "page" : undefined}>
        <i className="tab-mark" aria-hidden="true" />
        <span>{t(item.label)}</span>
      </Link>
    );
  };
  return (
    <nav className="tabs" aria-label={t("nav.main")}>
      <div className="tabs-in">
        {tab(0)}
        {tab(1)}
        <Link href={CAMERA_HREF} className={cx("cam", pulse && "pulse")} aria-label={t("tab.camera")}>
          <i className="cam-lens" aria-hidden="true" />
        </Link>
        {tab(2)}
        {tab(3)}
      </div>
    </nav>
  );
}
