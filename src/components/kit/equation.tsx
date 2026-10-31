"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export type EquationField = "qty" | "rate" | "amount";

/**
 * The reading as an equation: qty × rate = amount in three cells that hold at 390 px, or one
 * cell when there is only an amount. Values arrive formatted; `look` marks a value in turmeric.
 * With `onTap` every number is a button that opens the fix sheet.
 */
export function Equation({
  qty,
  rate,
  amount,
  unit,
  look = {},
  onTap,
}: {
  qty?: string | null;
  rate?: string | null;
  amount: string | null;
  unit?: string | null;
  look?: Partial<Record<EquationField, boolean>>;
  onTap?: (field: EquationField) => void;
}) {
  const { t } = useI18n();
  const cell = (field: EquationField, value: string | null | undefined, extra?: ReactNode) => {
    const label = t(field === "qty" ? "eq.qty" : field === "rate" ? "eq.rate" : "eq.amount");
    const inner = (
      <>
        <span className="eq-l">{label}</span>
        <span className="eq-n">
          <span className={cx(look[field] && "hl")}>{value ?? "—"}</span>
          {extra}
        </span>
      </>
    );
    const cls = cx("eq-cell", field === "amount" && "eq-amt");
    return onTap ? (
      <button type="button" className={cls} onClick={() => onTap(field)} aria-label={t("eq.tap", label, value ?? "—")}>
        {inner}
      </button>
    ) : (
      <span className={cls}>{inner}</span>
    );
  };
  if (qty == null && rate == null) return <div className="eq eq-one">{cell("amount", amount)}</div>;
  return (
    <div className="eq">
      {cell("qty", qty, unit ? <small className="eq-u">{unit}</small> : null)}
      <span className="eq-op" aria-hidden="true">×</span>
      {cell("rate", rate)}
      <span className="eq-op" aria-hidden="true">=</span>
      {cell("amount", amount)}
    </div>
  );
}
