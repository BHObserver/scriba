"use client";

import { Mic } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Button, StatusMark } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { BlockValues } from "@/lib/ledger/types";
import { sentenceText } from "@/lib/questions/text";
import type { Question, QuestionOption } from "@/lib/questions/types";
import type { ReviewRow } from "@/lib/review/state";
import { type MemoView, pricesWhy, proposedPrices } from "./ask-memo";
import { blockFigures, draftPoisha, slotOption, slotText } from "./ask-model";
import { BlockCrop, DateTile, Kicker, MemoStrip, nowLabel } from "./ask-parts";
import { RowStrip } from "./deck-sheets";
import type { Photo } from "./reading-view";

const SWIPE_PX = 110;

/**
 * One card of the deck: it rises in, and leaves to the right when `leaving`. Swipe right answers
 * only on cards whose answer is a plain yes; buttons always work.
 */
export function AskFrame({ swipe, onSwipe, leaving, children }: { swipe: boolean; onSwipe: () => void; leaving: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const [dx, setDx] = useState(0);
  const from = useRef<number | null>(null);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!swipe || (e.target as HTMLElement).closest("button, input")) return;
    from.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (from.current != null) setDx(Math.max(0, e.clientX - from.current));
  };
  const up = () => {
    if (from.current == null) return;
    from.current = null;
    if (dx > SWIPE_PX) onSwipe();
    else setDx(0);
  };
  const style = dx && !leaving ? { transform: `translateX(${dx}px) rotate(${dx / 28}deg)`, transition: "none" } : undefined;
  return (
    <div className={cx("as-card", leaving && "leave")} style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {dx > 36 ? (
        <span className="as-swipe-yes" style={{ opacity: Math.min(1, dx / SWIPE_PX) }} aria-hidden="true">
          {t("asks.yes")}
        </span>
      ) : null}
      {children}
    </div>
  );
}

function Why({ why }: { why: Question["why"] }) {
  const i18n = useI18n();
  if (!why) return null;
  return (
    <p className="as-why">
      {why.verified ? <StatusMark kind="ok" /> : null}
      <span>{sentenceText(i18n, why.sentence)}</span>
    </p>
  );
}

const lineText = (row: ReviewRow, typeLabel: string) => row.values.item ?? typeLabel;

/** What the card shows above the sentence, by what the question is about. */
function Visual({ q, rows, photo, capturedOn, memo }: { q: Question; rows: readonly ReviewRow[]; photo: Photo; capturedOn: string | null; memo: MemoView | null }) {
  const { t, digits } = useI18n();
  const of = (ids: readonly string[]) => ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is ReviewRow => r != null);
  if (q.kind === "date") return capturedOn ? <div className="as-vis"><DateTile day={capturedOn} /></div> : null;
  // U4: the memo's lines (or its letterhead), under the page's line when the two differ.
  if (memo && q.memo) {
    const row = q.entry ? rows.find((r) => r.id === q.entry) : undefined;
    return (
      <div className="as-crop as-pair">
        {row ? <RowStrip row={row} photo={photo} height={64} /> : null}
        {/* With no line named, the letterhead says whose memo it is: it gets more room. */}
        <MemoStrip memo={memo} lines={q.memo.lines} height={q.memo.lines.length > 0 ? 92 : 150} />
      </div>
    );
  }
  if (q.kind === "block_kind") {
    return (
      <div className="as-chips">
        {of(q.entries).map((r) => (
          <span key={r.id} className="as-ichip">
            {digits(lineText(r, t(`type.${r.values.type}`)))}
            {r.values.amountText ? <b className="as-num">{digits(r.values.amountText)}</b> : null}
          </span>
        ))}
      </div>
    );
  }
  if (q.entry && (q.kind === "doubt" || q.kind === "direction" || q.kind === "book_differs")) {
    const row = rows.find((r) => r.id === q.entry);
    return row ? (
      <div className="as-crop">
        <RowStrip row={row} photo={photo} />
      </div>
    ) : null;
  }
  return <BlockCrop rows={of(q.entries)} photo={photo} />;
}

/** The question's options as the card shows them: the proposed one, readings, plain choices, "later", "show me". */
function split(q: Question) {
  const later = q.options.filter((o) => o.later);
  const local = q.options.filter((o) => o.local);
  const rest = q.options.filter((o) => !o.later && !o.local && o.id !== q.proposed);
  return { proposed: q.options.find((o) => o.id === q.proposed) ?? null, rest, later, local };
}

export type QuestionCardActions = {
  answer: (q: Question, option: string) => void;
  /** Opens the sheet: the other options and the typed value; `listen` starts the microphone. */
  open: (q: Question, options: QuestionOption[], listen: boolean) => void;
  /** A "show me the lines" option: only moves the screen. */
  lines: (ids: string[]) => void;
};

/**
 * A question card (D5 "Scriba asks"), by the answer's shape rather than the question's kind:
 * a proposed answer is one red button (and swipe right); two or three readings are big tiles with
 * code's per-unit detail; other choices are 64 px tiles; a value opens the keypad, typing or voice.
 */
export function QuestionCard({
  q,
  block,
  rows,
  photo,
  capturedOn,
  memo,
  busy,
  voice,
  actions,
}: {
  q: Question;
  block: BlockValues | null;
  rows: readonly ReviewRow[];
  photo: Photo;
  capturedOn: string | null;
  /** U4: the company memo the question takes its figures from. */
  memo: MemoView | null;
  busy: boolean;
  voice: boolean;
  actions: QuestionCardActions;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [picked, setPicked] = useState<string | null>(null);
  const { proposed, rest, later, local } = split(q);
  // The memo's price for each of the goods, when the card proposes them (U4).
  const memoPrices = proposedPrices(q);
  const pick = (id: string) => {
    setPicked(id);
    actions.answer(q, id);
  };
  const readings = !proposed && rest.length >= 2 && rest.length <= 3 && rest.every((o) => o.value != null);
  const delivery = q.kind === "delivery";
  const say = voice && (q.input != null || readings || proposed != null) ? (
    <button type="button" className="as-pill" disabled={busy} onClick={() => actions.open(q, rest, true)}>
      <Mic size={18} aria-hidden="true" />
      {t("asks.say")}
    </button>
  ) : null;
  const type = q.input ? (
    <button type="button" className="as-pill" disabled={busy} onClick={() => actions.open(q, [], false)}>
      {q.input.label ? sentenceText(i18n, q.input.label) : t("asks.type")}
    </button>
  ) : null;
  const ghosts = [...local, ...later].map((o) => (
    <Button key={o.id} variant="ghost" wide disabled={busy} onClick={() => (o.local ? actions.lines(q.entries) : pick(o.id))}>
      {sentenceText(i18n, o.label)}
    </Button>
  ));

  return (
    <>
      <Kicker block={block} />
      {delivery ? null : <Visual q={q} rows={rows} photo={photo} capturedOn={capturedOn} memo={memo} />}
      <p className="as-q">{sentenceText(i18n, q.sentence)}</p>
      <Why why={q.why} />
      {delivery ? (
        <div className="as-goods">
          {q.entries.map((id) => {
            const row = rows.find((r) => r.id === id);
            if (!row) return null;
            const price = draftPoisha(memoPrices.get(id));
            return (
              <div key={id} className={cx("as-good", price != null && "memo")}>
                <RowStrip row={row} photo={photo} height={50} tag={false} />
                <span className="as-good-t">
                  {i18n.digits(row.values.item ?? row.values.sourceText)}
                  <small>{i18n.digits([row.values.quantityText, row.values.unit].filter(Boolean).join(" "))}</small>
                </span>
                {price != null ? <SlotPrice poisha={price} memo /> : <span className="as-gap">{t("asks.gap")}</span>}
              </div>
            );
          })}
        </div>
      ) : null}
      {delivery && memo && q.memo ? <MemoStrip memo={memo} lines={q.memo.lines} height={76} /> : null}
      {proposed ? (
        <div className="as-acts">
          <Button variant="red" wide disabled={busy} onClick={() => pick(proposed.id)}>
            {sentenceText(i18n, proposed.label)}
          </Button>
          <div className="as-second">
            {rest.length > 0 || q.input ? (
              <button type="button" className="as-pill" disabled={busy} onClick={() => actions.open(q, rest, false)}>
                {t("asks.no")}
              </button>
            ) : null}
            {say}
          </div>
          {ghosts}
          <p className="as-hint">{t("asks.swipe")}</p>
        </div>
      ) : (
        <div className="as-acts">
          {delivery && q.input ? (
            <Button variant="red" wide disabled={busy} onClick={() => actions.open(q, [], false)}>
              {t("asks.type")}
            </Button>
          ) : null}
          {rest.length > 0 ? (
            <div className={cx("as-opts", readings && (rest.length === 2 ? "two" : "three"))}>
              {rest.map((o) => (
                <button key={o.id} type="button" className={cx("as-opt", picked === o.id && "picked")} disabled={busy} onClick={() => pick(o.id)}>
                  <b>{sentenceText(i18n, o.label)}</b>
                  {o.detail ? <span>{sentenceText(i18n, o.detail)}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          {(!delivery && type) || say ? (
            <div className="as-second">
              {delivery ? null : type}
              {say}
            </div>
          ) : null}
          {ghosts}
        </div>
      )}
    </>
  );
}

/** A price in a goods slot; `memo`: it is the company memo's price (U4), not one he typed. */
function SlotPrice({ poisha, memo }: { poisha: number; memo: boolean }) {
  const { t, money } = useI18n();
  return (
    <span className="as-slot-v">
      <b className="as-num">{money(poisha)}</b>
      {memo ? <small className="as-from">{t("asks.memo.from")}</small> : null}
    </span>
  );
}

/**
 * The prices card (D5 "Type"): one slot per unpriced item of one block. Tapping a slot opens the
 * keypad; nothing is saved until "Save the prices", which posts one answer per filled slot. The
 * block's "owed now" follows the slots as they fill. "Later" leaves the gaps open. With the
 * company's memo (U4), a slot starts with the price the memo proposes and says so, and the memo's
 * lines show under the slots.
 */
export function PricesCard({
  questions,
  block,
  rows,
  photo,
  memo,
  drafts,
  busy,
  onSlot,
  onSave,
  onLater,
}: {
  questions: Question[];
  block: BlockValues | null;
  rows: readonly ReviewRow[];
  photo: Photo;
  memo: MemoView | null;
  drafts: Readonly<Record<string, string>>;
  busy: boolean;
  onSlot: (q: Question, row: ReviewRow) => void;
  onSave: () => void;
  onLater: () => void;
}) {
  const i18n = useI18n();
  const { t, money, digits } = i18n;
  const first = questions[0]!;
  const slots = new Map(questions.flatMap((q) => (q.entry ? [[q.entry, slotText(q, drafts)] as const] : [])));
  const priced = rows.map((r) => {
    const p = draftPoisha(slots.get(r.id));
    return p == null ? r : { ...r, values: { ...r.values, amountText: String(p / 100) } };
  });
  const figures = blockFigures(block, priced);
  const filled = [...slots.values()].some((text) => draftPoisha(text) != null);
  const memoLines = [...new Set(questions.flatMap((q) => q.memo?.lines ?? []))];
  return (
    <>
      <Kicker block={block} />
      <p className="as-q">{questions.length === 1 ? sentenceText(i18n, first.sentence) : t("q.prices", questions.length)}</p>
      <Why why={pricesWhy(questions, memo, figures.kind === "account" ? figures.now : null)} />
      <div className="as-goods">
        {questions.map((q) => {
          const row = rows.find((r) => r.id === q.entry);
          if (!row) return null;
          const text = slots.get(row.id);
          const price = draftPoisha(text);
          const fromMemo = slotOption(q, text) != null;
          return (
            <button key={q.id} type="button" className={cx("as-good", price != null && (fromMemo ? "memo" : "set"))} disabled={busy} onClick={() => onSlot(q, row)}>
              <RowStrip row={row} photo={photo} height={50} tag={false} />
              <span className="as-good-t">
                {digits(row.values.item ?? row.values.sourceText)}
                <small>{digits([row.values.quantityText, row.values.unit].filter(Boolean).join(" "))}</small>
              </span>
              {price != null ? <SlotPrice poisha={price} memo={fromMemo} /> : <span className="as-gap">{t("q.price.slot")}</span>}
            </button>
          );
        })}
      </div>
      {memo && memoLines.length > 0 ? <MemoStrip memo={memo} lines={memoLines} height={76} /> : null}
      {figures.kind === "account" ? (
        <div className="as-live">
          <span>{t(nowLabel(figures))}</span>
          {figures.now != null ? (
            <b className="as-num">{money(figures.now)}</b>
          ) : (
            <span className="as-open">
              <b className="as-num">{money(figures.known)}</b>
              <span className="as-gap">{t("asks.gapNow")}</span>
            </span>
          )}
        </div>
      ) : null}
      <div className="as-acts">
        <Button variant="red" wide disabled={busy || !filled} onClick={onSave}>
          {t("q.price.save")}
        </Button>
        <Button variant="ghost" wide disabled={busy} onClick={onLater}>
          {t("q.price.later")}
        </Button>
      </div>
    </>
  );
}

/** The quick confirm (D5 "rest"): the block's other lines at a glance, one button for all. */
export function RestCard({ ids, other, block, rows, photo, busy, onFix, onAll }: { ids: readonly string[]; other: boolean; block: BlockValues | null; rows: readonly ReviewRow[]; photo: Photo; busy: boolean; onFix: (id: string) => void; onAll: () => void }) {
  const { t, digits } = useI18n();
  return (
    <>
      <Kicker block={block} />
      <p className="as-q sm">{ids.length === 1 ? t(other ? "asks.rest.one" : "asks.rest.allOne") : t(other ? "asks.rest.title" : "asks.rest.all", ids.length)}</p>
      <div className="as-rest">
        {ids.map((id) => {
          const row = rows.find((r) => r.id === id);
          if (!row) return null;
          const figure = row.values.amountText ?? row.values.balanceText;
          return (
            <button key={id} type="button" className="as-rest-row" disabled={busy} onClick={() => onFix(id)}>
              <RowStrip row={row} photo={photo} height={46} tag={false} />
              <span>{digits(lineText(row, t(`type.${row.values.type}`)))}</span>
              {figure ? <b className="as-num">{digits(figure)}</b> : <span />}
            </button>
          );
        })}
      </div>
      <div className="as-acts">
        <Button variant="red" wide disabled={busy} onClick={onAll}>
          {t("asks.rest.ok")}
        </Button>
        <p className="as-hint">{t("asks.rest.tap")}</p>
      </div>
    </>
  );
}
