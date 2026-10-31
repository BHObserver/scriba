"use client";

import { useI18n } from "@/lib/i18n/client";

/** A switch that also says its state in words (চালু / বন্ধ). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="sw" onClick={() => onChange(!checked)}>
      <span aria-hidden="true">{checked ? t("on") : t("off")}</span>
      <i aria-hidden="true" />
    </button>
  );
}
