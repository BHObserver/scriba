"use client";

import { Mic, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Keypad, Sheet, applyKey, groupTyped, type KeypadKey } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { spokenAnswer } from "@/lib/questions/speech";
import { sentenceText } from "@/lib/questions/text";
import type { Answer, AnswerInput, Question, QuestionOption } from "@/lib/questions/types";
import type { ReviewRow } from "@/lib/review/state";
import { draftPoisha, priceOptions } from "./ask-model";
import { BlockCrop } from "./ask-parts";
import { RowStrip } from "./deck-sheets";
import { fieldLabel } from "./sentences";
import type { Photo } from "./reading-view";
import { type VoiceError, useVoice } from "./use-voice";

/**
 * What the sheet is open for: answering a question (its other options and its typed or spoken
 * value), or a price slot on the prices card, which only fills the slot (the card saves them).
 */
export type AskSheetTarget =
  | { kind: "answer"; question: Question; options: QuestionOption[]; listen: boolean }
  | { kind: "price"; question: Question; row: ReviewRow; start: string; listen: boolean };

const VOICE_ERROR: Record<VoiceError, MessageKey> = {
  denied: "fx.micDenied",
  too_short: "fx.tooShort",
  busy: "fx.voiceBusy",
  failed: "fx.voiceFailed",
  off: "fx.voiceOff",
};

/**
 * "No, change it", "Type it" and "Say it" (DESIGN_SPEC D5 "Voice"): the question's other options
 * as tiles (one tap answers), then its value on the keypad or typed, with the microphone. What is
 * heard goes into the field (turmeric) or picks an option; only "Keep" saves it.
 */
export function AskSheet({
  target,
  rows,
  photo,
  busy,
  onAnswer,
  onPrice,
  onClose,
}: {
  target: AskSheetTarget | null;
  /** The page's lines, for the part a split would make (T2). */
  rows: readonly ReviewRow[];
  photo: Photo;
  busy: boolean;
  onAnswer: (q: Question, a: Answer) => void;
  onPrice: (rowId: string, typed: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const label = target?.kind === "answer" ? t("asks.which") : target ? t("q.price.slot") : "";
  return (
    <Sheet open={target != null} onClose={onClose} label={label}>
      {target ? <SheetBody key={`${target.kind}:${target.question.id}:${target.kind === "price" ? target.row.id : ""}`} target={target} rows={rows} photo={photo} busy={busy} onAnswer={onAnswer} onPrice={onPrice} onClose={onClose} /> : null}
    </Sheet>
  );
}

function SheetBody({ target, rows, photo, busy, onAnswer, onPrice, onClose }: { target: AskSheetTarget; rows: readonly ReviewRow[]; photo: Photo; busy: boolean; onAnswer: (q: Question, a: Answer) => void; onPrice: (rowId: string, typed: string) => void; onClose: () => void }) {
  const i18n = useI18n();
  const { t, digits, money } = i18n;
  const q = target.question;
  const input: AnswerInput | null = target.kind === "price" ? { kind: "money", target: { to: "entry", entry: target.row.id, field: "amount" } } : q.input;
  const keypad = input?.kind === "money" || input?.kind === "quantity";
  const decimal = input?.kind === "quantity";
  const [draft, setDraft] = useState(target.kind === "price" ? target.start : "");
  const [picked, setPicked] = useState<string | null>(null);
  const [heard, setHeard] = useState<{ said: string; placed: string | null; values: string[]; none: boolean } | null>(null);

  const voice = useVoice(i18n.locale, (number, transcript) => {
    const said = transcript.trim();
    if (target.kind === "price") {
      const value = number.kind === "one" && !number.value.includes(".") ? number.value : null;
      if (value) setDraft(value);
      setHeard({ said, placed: value, values: [], none: value == null });
      return;
    }
    const s = spokenAnswer(q, transcript);
    if (s.kind === "option") {
      setPicked(s.option);
      setHeard({ said, placed: null, values: [], none: false });
    } else if (s.kind === "value") {
      setPicked(null);
      setDraft(s.value);
      setHeard({ said, placed: s.value, values: [], none: false });
    } else if (s.kind === "values") {
      setHeard({ said, placed: null, values: s.values, none: false });
    } else {
      // "No" shows the other options, which are already on the sheet; anything else isn't guessed.
      setHeard({ said, placed: null, values: [], none: s.kind === "none" });
    }
  });
  const { reset: resetVoice } = voice;
  const listening = voice.state.s === "listening";
  const sending = voice.state.s === "sending";

  const { start } = voice;
  useEffect(() => {
    if (target.listen && voice.supported) void start();
    // Only when the sheet opens for "Say it".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = (k: KeypadKey) => {
    resetVoice();
    setHeard(null);
    setPicked(null);
    setDraft((d) => applyKey(d, k));
  };
  useEffect(() => {
    if (!keypad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) setDraft((d) => applyKey(d, e.key as KeypadKey));
      else if (e.key === "." && decimal) setDraft((d) => applyKey(d, "."));
      else if (e.key === "Backspace") setDraft((d) => applyKey(d, "del"));
      else return;
      e.preventDefault();
      resetVoice();
      setHeard(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keypad, decimal, resetVoice]);

  const value = draft.replace(/\.$/, "").trim();
  const placedHere = heard?.placed != null && heard.placed === draft;
  const keep = () => {
    if (picked) return onAnswer(q, { option: picked });
    if (!value) return;
    if (target.kind === "price") onPrice(target.row.id, value);
    else onAnswer(q, { value });
  };

  const options = target.kind === "answer" ? target.options : [];
  const row = target.kind === "price" ? target.row : null;
  // T2: the lines a split would put in a part of their own, so he sees which ones go.
  const moving = q.kind === "split" ? q.entries.map((id) => rows.find((r) => r.id === id)).filter((r): r is ReviewRow => r != null) : [];
  // U4: a price slot can take the memo's price (or one of the memo lines it may be) with one tap.
  const memoPrices = target.kind === "price" ? priceOptions(q) : [];
  const message = (() => {
    if (sending) return t("fx.sending");
    if (voice.state.s === "error") return t(VOICE_ERROR[voice.state.error]);
    if (!heard) return null;
    if (heard.none || !heard.said) return t("asks.voice.none");
    return `${t("asks.voice.heard", digits(heard.said))} ${t("asks.voice.never")}`;
  })();

  // A typed name, day or word says what it fills; numbers have the keypad's ৳ field.
  const inputLabel = (() => {
    if (!input || keypad) return null;
    if (input.target.to === "party") return t("asks.in.party");
    if (input.target.to === "split") return t("asks.in.split");
    if (input.target.to === "date") return t("asks.in.date");
    return input.target.to === "entry" ? fieldLabel(i18n, input.target.field) : null;
  })();
  // With options to choose from: "Which is right?" over the question; to type a value: the question itself.
  const heading = row ? digits([row.values.item, row.values.quantityText, row.values.unit].filter(Boolean).join(" ")) : options.length > 0 ? t("asks.which") : sentenceText(i18n, q.sentence);
  return (
    <div className="as-sheet">
      <div className="as-sheet-head">
        <span className="t-sec">{heading}</span>
        <button type="button" className="back" onClick={onClose} aria-label={t("close")}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      {moving.length > 0 ? <BlockCrop rows={moving} photo={photo} /> : null}
      {row ? <RowStrip row={row} photo={photo} /> : options.length > 0 ? <p className="t-body">{sentenceText(i18n, q.sentence)}</p> : null}
      {row && memoPrices.length > 0 ? (
        <div className="as-opts">
          {memoPrices.map((o) => (
            <button key={o.id} type="button" className="as-opt" disabled={busy} onClick={() => onPrice(row.id, o.value!)}>
              <b className="as-num">{money(draftPoisha(o.value) ?? 0)}</b>
              <span>{o.id === q.proposed ? t("asks.memo.from") : sentenceText(i18n, o.label)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {options.length > 0 ? (
        <div className="as-opts">
          {options.map((o) => (
            <button key={o.id} type="button" className={cx("as-opt", picked === o.id && "picked")} disabled={busy} onClick={() => onAnswer(q, { option: o.id })}>
              <b>{sentenceText(i18n, o.label)}</b>
              {o.detail ? <span>{sentenceText(i18n, o.detail)}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {input ? (
        <>
          {keypad ? (
            <div className={cx("as-field", placedHere && "heard")} aria-live="polite">
              <span className="as-num">{input.kind === "money" ? "৳" : ""}{draft ? digits(groupTyped(draft)) : ""}</span>
              <i className="fx-caret" aria-hidden="true" />
            </div>
          ) : (
            <label className="grid gap-1">
              {inputLabel ? <span className="t-small">{inputLabel}</span> : null}
              <input
                className={cx("as-input", placedHere && "heard")}
                value={draft}
                maxLength={80}
                inputMode="text"
                aria-label={inputLabel ?? sentenceText(i18n, q.sentence)}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setHeard(null);
                }}
              />
            </label>
          )}
          {message ? (
            <p className="as-heard" aria-live="polite">
              {message}
            </p>
          ) : null}
          {heard && heard.values.length > 0 ? (
            <div className="fx-picks">
              {heard.values.map((v) => (
                <Button key={v} variant={draft === v ? "red" : "line"} aria-pressed={draft === v} onClick={() => setDraft(v)}>
                  {digits(groupTyped(v))}
                </Button>
              ))}
            </div>
          ) : null}
          {listening || sending ? (
            <div className="as-listen" role="status">
              <span className={cx("fx-bars", sending && "still")} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>
                {t(target.kind === "price" ? "asks.voice.price" : "asks.voice.listen")}
                <small>{t("asks.voice.eg")}</small>
              </span>
              {listening ? <Button onClick={() => void voice.stop()}>{t("fx.stop")}</Button> : null}
            </div>
          ) : keypad ? (
            <Keypad onKey={press} decimal={decimal} />
          ) : null}
        </>
      ) : null}
      {input || picked ? (
        <div className={voice.supported && input ? "fx-acts" : "mt-1"}>
          {voice.supported && input ? (
            <Button disabled={busy || listening || sending} onClick={() => void voice.start()}>
              <Mic size={20} aria-hidden="true" />
              {t("asks.say")}
            </Button>
          ) : null}
          <Button variant="red" wide={!(voice.supported && input)} disabled={busy || listening || sending || (!picked && !value)} onClick={keep}>
            {t("asks.keep")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** "Show me the lines": the lines a question is about, each one tappable to fix it. */
export function LinesSheet({ rows, photo, onFix, onClose }: { rows: ReviewRow[] | null; photo: Photo; onFix: (id: string) => void; onClose: () => void }) {
  const { t, digits } = useI18n();
  return (
    <Sheet open={rows != null} onClose={onClose} label={t("asks.rest.tap")}>
      {rows ? (
        <div className="as-sheet">
          <p className="t-sec">{t("asks.rest.tap")}</p>
          <div className="as-rest">
            {rows.map((row) => {
              const figure = row.values.amountText ?? row.values.balanceText;
              return (
                <button key={row.id} type="button" className="as-rest-row" onClick={() => onFix(row.id)}>
                  <RowStrip row={row} photo={photo} height={46} tag={false} />
                  <span>{digits(row.values.item ?? t(`type.${row.values.type}`))}</span>
                  {figure ? <b className="as-num">{digits(figure)}</b> : <span />}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
