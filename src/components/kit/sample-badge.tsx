"use client";

import { useI18n } from "@/lib/i18n/client";

/** On every screen of a sample shop (shop_profiles.is_sample); never on a real shop. */
export function SampleBadge() {
  const { t } = useI18n();
  return (
    <span className="badge-sample" title={t("sample.title")}>
      {t("sample")}
      <span className="sr-only">: {t("sample.title")}</span>
    </span>
  );
}
