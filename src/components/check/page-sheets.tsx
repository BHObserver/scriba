"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Keypad, Sheet, applyKey, groupTyped, type KeypadKey } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { businessDateFor } from "@/lib/ledger/dates";
import { type EntryValues, LEDGER_TYPES, type LedgerType, type PageValues, type TransactionType } from "@/lib/ledger/types";
import type { PageState } from "@/lib/review/state";
import { type AddedParts, addFields, addedLineValues } from "./deck-model";
import { PICKABLE } from "./deck-sheets";

type NumberKey = "qty" | "rate" | "amount";
const LABEL: Record<NumberKey, "eq.qty" | "eq.rate" | "eq.amount"> = { qty: "eq.qty", rate: "eq.rate", amount: "eq.amount" };

function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fx-head">
      <h2 className="t-sec">{title}</h2>
      <button type="button" className="back" onClick={onClose} aria-label={t("close")}>
        <X size={24} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Add a line the reading missed (DESIGN_SPEC D4 "Nothing to check": "add a line yourself").
 * First its kind, then only the fields that kind has, numbers on the keypad. The amount is
 * required; nothing is worked out for him: the line holds what he typed, and is then checked
 * and accepted on its card like every other line.
 */
export function AddSheet({ open, position, sample, busy, notice, onSave, onClose }: { open: boolean; position: string; sample: string | null; busy: boolean; notice: ReactNode; onSave: (values: EntryValues) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} label={t("ad.title")}>
      {open ? <AddBody position={position} sample={sample} busy={busy} notice={notice} onSave={onSave} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AddBody({ position, sample, busy, notice, onSave, onClose }: { position: string; sample: string | null; busy: boolean; notice: ReactNode; onSave: (values: EntryValues) => void; onClose: () => void }) {
  const { t, digits } = useI18n();
  const [parts, setParts] = useState<AddedParts | null>(null);
  const [active, setActive] = useState<NumberKey>("amount");
  const want = parts ? addFields(parts.type) : null;
  const press = (k: KeypadKey) => setParts((p) => (p ? { ...p, [active]: applyKey(p[active], k) } : p));

  useEffect(() => {
    if (!parts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      if (/^[0-9]$/.test(e.key)) press(e.key as KeypadKey);
      else if (e.key === "." && active !== "amount") press(".");
      else if (e.key === "Backspace") press("del");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!parts || !want) {
    const pick = (type: TransactionType) => {
      setParts({ type, name: "", item: "", qty: "", rate: "", amount: "" });
      setActive(addFields(type).qtyRate ? "qty" : "amount");
    };
    return (
      <div className="grid gap-3">
        <SheetHead title={t("ad.title")} onClose={onClose} />
        <p className="t-small">{position}</p>
        <h3 className="field-l">{t("ty.title")}</h3>
        <div className="ty-list">
          {PICKABLE.map((type) => (
            <Button key={type} variant="line" onClick={() => pick(type)}>
              {t(`type.${type}`)}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const numbers: NumberKey[] = want.qtyRate ? ["qty", "rate", "amount"] : ["amount"];
  const text = (key: "name" | "item", label: string) => (
    <label className="field">
      <span className="field-l">{label}</span>
      <input lang="bn" className="input" value={parts[key]} maxLength={80} onChange={(e) => setParts({ ...parts, [key]: e.target.value })} />
    </label>
  );
  return (
    <div className="grid gap-3">
      <SheetHead title={t("ad.title")} onClose={onClose} />
      <button type="button" className="chip ad-kind" onClick={() => setParts(null)}>
        {t("ad.kind", t(`type.${parts.type}`))}
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {want.name || want.item ? (
        <div className={cx("ad-texts", want.name && want.item && "two")}>
          {want.name ? text("name", t("ad.name")) : null}
          {want.item ? text("item", parts.type === "expense" ? t("ad.for") : t("ad.item")) : null}
        </div>
      ) : null}
      <div className={cx("ad-nums", numbers.length === 1 && "one")} role="group" aria-label={t("eq.amount")}>
        {numbers.map((key) => (
          <button key={key} type="button" className={cx("ad-num", key === active && "on")} aria-pressed={key === active} onClick={() => setActive(key)}>
            <span className="eq-l">{t(LABEL[key])}</span>
            <span className="ad-val">{parts[key] ? digits(groupTyped(parts[key])) : "—"}</span>
          </button>
        ))}
      </div>
      <p className="fx-msg">{t("ad.hint")}</p>
      <Keypad onKey={press} decimal={active !== "amount"} />
      {notice}
      <Button variant="red" wide disabled={!parts.amount.replace(/\.$/, "") || busy} onClick={() => onSave(addedLineValues(parts, sample))}>
        {t("ad.save")}
      </Button>
      <p className="t-small text-center">{position}</p>
    </div>
  );
}

/**
 * The page's own details: what kind of page it is (which decides whether the dues are checked),
 * whose account, and the written date, with the day Scriba will file the page under. Saving
 * runs every check again.
 */
export function PageSheet({ open, page, capturedAt, busy, notice, onSave, onClose }: { open: boolean; page: PageState; capturedAt: string; busy: boolean; notice: ReactNode; onSave: (values: PageValues) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} label={t("pg.title")}>
      {open ? <PageBody initial={page.values} capturedAt={capturedAt} busy={busy} notice={notice} onSave={onSave} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PageBody({ initial, capturedAt, busy, notice, onSave, onClose }: { initial: PageValues; capturedAt: string; busy: boolean; notice: ReactNode; onSave: (values: PageValues) => void; onClose: () => void }) {
  const { t, dayMonth } = useI18n();
  const [draft, setDraft] = useState(initial);
  const clean: PageValues = { ledgerType: draft.ledgerType, accountName: draft.accountName?.trim() || null, dateText: draft.dateText?.trim() || null };
  const changed = clean.ledgerType !== initial.ledgerType || clean.accountName !== initial.accountName || clean.dateText !== initial.dateText;
  const business = businessDateFor(clean.dateText, new Date(capturedAt));
  const dateNote = !clean.dateText ? t("pg.dateEmpty", dayMonth(business.iso)) : business.source === "written" ? t("pg.dateAs", dayMonth(business.iso)) : t("pg.dateNone", dayMonth(business.iso));
  const pick = (ledgerType: LedgerType) => setDraft({ ...draft, ledgerType });
  return (
    <div className="grid gap-3">
      <SheetHead title={t("pg.title")} onClose={onClose} />
      <h3 className="field-l">{t("pg.kind")}</h3>
      <div className="pg-kinds" role="radiogroup" aria-label={t("pg.kind")}>
        {LEDGER_TYPES.map((type) => (
          <button key={type} type="button" role="radio" aria-checked={draft.ledgerType === type} className="pg-kind" onClick={() => pick(type)}>
            <span className="pg-tick" aria-hidden="true">{draft.ledgerType === type ? <Check size={18} strokeWidth={3} /> : null}</span>
            <span>
              <b>{t(`pg.${type}`)}</b>
              <span className="t-small">{t(`pg.${type}.b`)}</span>
            </span>
          </button>
        ))}
      </div>
      {draft.ledgerType === "customer_credit" ? (
        <label className="field">
          <span className="field-l">{t("pg.name")}</span>
          <input lang="bn" className="input" value={draft.accountName ?? ""} maxLength={80} onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} />
        </label>
      ) : null}
      <label className="field">
        <span className="field-l">{t("pg.date")}</span>
        <input lang="bn" className="input" value={draft.dateText ?? ""} maxLength={60} placeholder={t("pg.datePh")} onChange={(e) => setDraft({ ...draft, dateText: e.target.value })} />
        <span className="t-small" aria-live="polite">{dateNote}</span>
      </label>
      <p className="t-small">{t("pg.recheck")}</p>
      {notice}
      <Button variant="red" wide disabled={!changed || busy} onClick={() => onSave(clean)}>
        {t("fx.save")}
      </Button>
    </div>
  );
}
