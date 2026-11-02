"use client";

import { Mic, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, ButtonLink, Keypad, LineStrip, Sheet, applyKey, groupTyped, type KeypadKey } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { I18n } from "@/lib/i18n/format";
import type { TransactionType } from "@/lib/ledger/types";
import type { ReviewRow } from "@/lib/review/state";
import { FIELD_TO_VALUE_KEY } from "@/lib/review/values";
import type { Photo } from "./reading-view";
import { fieldLabel } from "./sentences";
import { type VoiceError, type VoiceState, useVoice } from "./use-voice";

export type FixField = "qty" | "rate" | "amount" | "balance";

/** Kinds a shopkeeper can pick for a line, in the order he meets them. */
export const PICKABLE: readonly TransactionType[] = [
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

/** The line's handwriting; a line he added has none, and the strip says so. */
export function RowStrip({ row, photo, height, tag }: { row: ReviewRow; photo: Photo; height?: number; tag?: boolean }) {
  const { t } = useI18n();
  return (
    <LineStrip
      src={photo.src}
      box={row.candidate?.bbox ?? null}
      photoWidth={photo.width}
      photoHeight={photo.height}
      turns={photo.turns}
      height={height}
      tag={tag}
      reading={row.values.sourceText}
      none={!photo.src ? undefined : row.candidate ? t("strip.noBox") : t("strip.added")}
    />
  );
}

/**
 * Fix one number (DESIGN_SPEC D2 "Fix sheet"): the handwriting, the old reading struck through,
 * the Bangla keypad (a laptop keyboard works too), "say it" and "keep". A spoken number is
 * placed in the field like a typed one (P1); nothing is saved until "keep".
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
  // Quantities and rates can be fractions (১.৫ কেজি); amounts and dues are whole taka.
  const decimal = field === "qty" || field === "rate";
  const fits = (value: string) => value.length <= 9 && (decimal || !value.includes("."));
  const voice = useVoice(i18n.locale, (n) => {
    if (n.kind === "one" && fits(n.value)) setDraft(n.value);
  });
  const { reset: resetVoice } = voice;
  const listening = voice.state.s === "listening";
  const sending = voice.state.s === "sending";
  const picks = voice.state.s === "heard" && voice.state.number.kind === "many" ? voice.state.number.values.filter(fits) : [];
  // Turmeric only while the field holds what this clip said, never a number left from before.
  const heardInField = voice.state.s === "heard" && (voice.state.number.kind === "one" ? voice.state.number.value === draft : picks.includes(draft));
  const press = (k: KeypadKey) => {
    resetVoice();
    setDraft((d) => applyKey(d, k));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) setDraft((d) => applyKey(d, e.key as KeypadKey));
      else if (e.key === "." && decimal) setDraft((d) => applyKey(d, "."));
      else if (e.key === "Backspace") setDraft((d) => applyKey(d, "del"));
      else return;
      e.preventDefault();
      resetVoice();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decimal, resetVoice]);

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
      <RowStrip row={row} photo={photo} />
      <div className={cx("fx-field", heardInField && "heard")} aria-live="polite">
        <span className="fx-val">
          {draft ? digits(groupTyped(draft)) : ""}
          <i className="fx-caret" aria-hidden="true" />
        </span>
        <span className="fx-old">{t("fx.old", old ? digits(old) : "—")}</span>
      </div>
      <p className="fx-msg" aria-live="polite">
        {voiceMessage(i18n, voice.state, fits, decimal) ?? hint ?? t("fx.msg")}
      </p>
      {picks.length > 0 ? (
        <div className="fx-picks">
          {picks.map((v) => (
            <Button key={v} variant={draft === v ? "red" : "line"} aria-pressed={draft === v} onClick={() => setDraft(v)}>
              {digits(groupTyped(v))}
            </Button>
          ))}
        </div>
      ) : null}
      {listening || sending ? (
        <div className="fx-listen">
          <div className={cx("fx-bars", sending && "still")} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          {listening ? (
            <>
              <span className="t-body">{t("fx.listening")}</span>
              <Button onClick={() => void voice.stop()}>{t("fx.stop")}</Button>
            </>
          ) : null}
        </div>
      ) : (
        <Keypad onKey={press} decimal={decimal} />
      )}
      <div className={voice.supported ? "fx-acts" : "mt-3"}>
        {voice.supported ? (
          <Button disabled={busy || listening || sending} onClick={() => void voice.start()}>
            <Mic size={20} aria-hidden="true" />
            {t("fx.voice")}
          </Button>
        ) : null}
        <Button variant="red" wide={!voice.supported} disabled={!draft.replace(/\.$/, "") || busy || listening || sending} onClick={() => onSave(draft)}>
          {t("fx.save")}
        </Button>
      </div>
    </div>
  );
}

const VOICE_ERROR_KEY = {
  denied: "fx.micDenied",
  too_short: "fx.tooShort",
  busy: "fx.voiceBusy",
  failed: "fx.voiceFailed",
  off: "fx.voiceOff",
} as const satisfies Record<VoiceError, string>;

/** What the fix sheet says about the microphone, or null to keep its usual line. */
function voiceMessage({ t, digits }: I18n, state: VoiceState, fits: (v: string) => boolean, decimal: boolean): string | null {
  if (state.s === "sending") return t("fx.sending");
  if (state.s === "error") return t(VOICE_ERROR_KEY[state.error]);
  if (state.s !== "heard") return null;
  const said = digits(state.transcript);
  const n = state.number;
  if (!said) return t("fx.heardNothing");
  if (n.kind === "none") return t("fx.heardNone", said);
  if (n.kind === "many") return n.values.some(fits) ? t("fx.heardMany", said) : t("fx.heardNone", said);
  if (fits(n.value)) return t("fx.heard", said);
  return t(!decimal && n.value.includes(".") ? "fx.heardWhole" : "fx.heardNone", said);
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

/** The deck's "more" sheet: change the line's kind, remove or restore it, add a line after it, the page's details, the summary, the details page. */
export function LineMenu({
  row,
  open,
  busy,
  detailsHref,
  onType,
  onRemove,
  onRestore,
  onAdd,
  onPage,
  onSummary,
  onClose,
}: {
  row: ReviewRow | null;
  open: boolean;
  busy: boolean;
  detailsHref: string;
  onType: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onAdd: () => void;
  onPage: () => void;
  onSummary: () => void;
  onClose: () => void;
}) {
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
        <Button wide disabled={busy} onClick={onAdd}>
          {t("dk.add")}
        </Button>
        <Button wide disabled={busy} onClick={onPage}>
          {t("dk.page")}
        </Button>
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
