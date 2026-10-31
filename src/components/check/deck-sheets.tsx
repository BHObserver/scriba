"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, ButtonLink, Keypad, LineStrip, Sheet, applyKey, type KeypadKey } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { TransactionType } from "@/lib/ledger/types";
import { groupSouthAsian } from "@/lib/numerals";
import type { ReviewRow } from "@/lib/review/state";
import { FIELD_TO_VALUE_KEY } from "@/lib/review/values";
import type { Photo } from "./reading-view";
import { fieldLabel } from "./sentences";

export type FixField = "qty" | "rate" | "amount" | "balance";

/** Kinds a shopkeeper can pick for a line, in the order he meets them. */
const PICKABLE: readonly TransactionType[] = [
  "credit_sale",
  "cash_sale",
  "repayment",
  "purchase",
  "credit_purchase",
  "supplier_payment",
  "expense",
  "opening_balance",
  "closing_balance",
  "subtotal",
];

function Strip({ row, photo }: { row: ReviewRow; photo: Photo }) {
  return <LineStrip src={photo.src} box={row.candidate?.bbox ?? null} photoWidth={photo.width} photoHeight={photo.height} turns={photo.turns} reading={row.values.sourceText} />;
}

/**
 * Fix one number (DESIGN_SPEC D2 "Fix sheet"): the handwriting, the old reading struck through,
 * the Bangla keypad (a laptop keyboard works too) and "keep". Nothing is saved until "keep".
 * Voice joins in P1.
 */
export function FixSheet({ target, photo, hint, busy, onSave, onClose }: { target: { row: ReviewRow; field: FixField } | null; photo: Photo; hint: string | null; busy: boolean; onSave: (typed: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={target != null} onClose={onClose} label={target ? t("fx.title", target.row.values.item ?? t(`type.${target.row.values.type}`)) : ""}>
      {target ? <FixBody key={`${target.row.id}:${target.field}`} row={target.row} field={target.field} photo={photo} hint={hint} busy={busy} onSave={onSave} onClose={onClose} /> : null}
    </Sheet>
  );
}

function FixBody({ row, field, photo, hint, busy, onSave, onClose }: { row: ReviewRow; field: FixField; photo: Photo; hint: string | null; busy: boolean; onSave: (typed: string) => void; onClose: () => void }) {
  const i18n = useI18n();
  const { t, digits } = i18n;
  const [draft, setDraft] = useState("");
  const old = row.values[FIELD_TO_VALUE_KEY[field]] as string | null;
  const press = (k: KeypadKey) => setDraft((d) => applyKey(d, k));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) setDraft((d) => applyKey(d, e.key as KeypadKey));
      else if (e.key === "Backspace") setDraft((d) => applyKey(d, "del"));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid gap-1">
      <div className="fx-head">
        <span className="t-sec">
          {row.values.item ?? t(`type.${row.values.type}`)} · {fieldLabel(i18n, field)}
        </span>
        <button type="button" className="back" onClick={onClose} aria-label={t("close")}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <Strip row={row} photo={photo} />
      <div className="fx-field" aria-live="polite">
        <span className="fx-val">
          {draft ? digits(groupSouthAsian(draft)) : ""}
          <i className="fx-caret" aria-hidden="true" />
        </span>
        <span className="fx-old">{t("fx.old", old ? digits(old) : "—")}</span>
      </div>
      <p className="fx-msg">{hint ?? t("fx.msg")}</p>
      <Keypad onKey={press} />
      <Button variant="red" wide className="mt-3" disabled={!draft || busy} onClick={() => onSave(draft)}>
        {t("fx.save")}
      </Button>
    </div>
  );
}

/** Pick what a line is (sale, payment, spending…): the only fix for "kind not clear". */
export function TypeSheet({ row, busy, onPick, onClose }: { row: ReviewRow | null; busy: boolean; onPick: (type: TransactionType) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={row != null} onClose={onClose} label={t("ty.title")}>
      {row ? (
        <div className="grid gap-3">
          <h2 className="t-sec">{t("ty.title")}</h2>
          <div className="ty-list">
            {PICKABLE.map((type) => (
              <Button key={type} variant={row.values.type === type ? "red" : "line"} disabled={busy} aria-pressed={row.values.type === type} onClick={() => onPick(type)}>
                {t(`type.${type}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

/** The deck's "more" sheet for the current line: change its kind, remove or restore it, the summary, the details page. */
export function LineMenu({ row, open, busy, detailsHref, onType, onRemove, onRestore, onSummary, onClose }: { row: ReviewRow | null; open: boolean; busy: boolean; detailsHref: string; onType: () => void; onRemove: () => void; onRestore: () => void; onSummary: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} label={t("dk.menu")}>
      <div className="grid gap-3">
        <h2 className="t-sec">{t("dk.menu")}</h2>
        {row && row.status === "draft" ? (
          <>
            <Button wide disabled={busy} onClick={onType}>
              {t("dk.changeType")}
            </Button>
            <Button wide disabled={busy} onClick={onRemove}>
              {t("dk.remove")}
            </Button>
          </>
        ) : null}
        {row && row.status === "rejected" ? (
          <Button wide disabled={busy} onClick={onRestore}>
            {t("dk.restore")}
          </Button>
        ) : null}
        <Button wide onClick={onSummary}>
          {t("dk.summary")}
        </Button>
        <ButtonLink href={detailsHref} variant="ghost" wide>
          {t("details")}
        </ButtonLink>
      </div>
    </Sheet>
  );
}
