"use client";

import { CalendarDays, ChevronDown, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Segmented, Sheet, StatusMark, TopBar } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { sumsRunning } from "@/lib/ledger/blocks";
import type { BlockValues, TransactionType } from "@/lib/ledger/types";
import { fingerprint } from "@/lib/questions/engine";
import { sentenceText } from "@/lib/questions/text";
import type { Question } from "@/lib/questions/types";
import { ackFingerprint } from "@/lib/review/approval";
import type { ReviewRow } from "@/lib/review/state";
import type { Finding } from "@/lib/validation/engine";
import { type NumberField, blockFigures, blockTone, checkable, draftPoisha, isSaleLine, partChecked, partFailures, salesKind, unsureNumbers, unsureWords } from "./ask-model";
import { blockName, nowLabel } from "./ask-parts";
import { RowStrip } from "./deck-sheets";
import { failsOn } from "./line-state";
import type { Photo } from "./reading-view";
import { fieldLabel } from "./sentences";

type Group = { block: BlockValues | null; rows: ReviewRow[] };

const OFF_KEY: Record<string, MessageKey> = { qty_x_rate: "q.off.qty", written_total: "q.off.total" };

/**
 * The numbers screen (F2, 4 Nov): right after the scan, every figure Scriba read, part by part,
 * each under its line's handwriting. He taps a wrong one to fix it, then says they are all right;
 * only then come the questions. Figures Scriba wasn't sure of are turmeric. Each part ends with
 * what code worked out from its figures, and any sum that doesn't come out, so a misread digit
 * shows here; such a sum can be settled right there (code's figure, or kept as written), so the
 * deck doesn't come back to numbers. The day's sales are cash unless বাকি is written: the part's
 * tag says so and opens the sheet to mark a sale বাকি. With no date written, the photo's day is
 * shown at the top.
 */
export function NumbersView({
  photo,
  groups,
  findings,
  questions,
  kept,
  date,
  after,
  busy,
  notice,
  sub,
  backHref,
  onFix,
  onSales,
  onPart,
  onWord,
  onType,
  onAnswer,
  onDate,
  onSubmit,
}: {
  photo: Photo;
  groups: Group[];
  findings: readonly Finding[];
  /** The open questions: a sum that doesn't come out is answered from its note. */
  questions: readonly Question[];
  /** Problems he kept as written (their fingerprints). */
  kept: ReadonlySet<string>;
  /** The photo's day, while the page has no date and Scriba would take that one. */
  date: string | null;
  /** Questions still to come once the numbers are right. */
  after: number;
  busy: boolean;
  notice: ReactNode;
  sub: string;
  backHref: string;
  onFix: (id: string, field: NumberField) => void;
  onSales: (block: string) => void;
  /** F2 fix 9: what a part is (its kind and name), or join it to the one above. */
  onPart: (block: string) => void;
  /** F2 fix 9: a word on a line fixed in place (the item, or who took it on credit). */
  onWord: (id: string, field: "item" | "customer", text: string) => void;
  /** A line's kind. */
  onType: (id: string) => void;
  onAnswer: (q: Question, option: string) => void;
  onDate: () => void;
  onSubmit: () => void;
}) {
  const { t, count, dayMonth } = useI18n();
  const unsure = groups.flatMap((g) => g.rows.filter(checkable)).reduce((n, r) => n + unsureNumbers(r).length, 0);
  return (
    <div className="flow column">
      <TopBar title={t("asks.nm.title")} sub={sub || undefined} backHref={backHref} />
      <div className="pad as-scroll">
        <p className="t-body as-nm-lead">{t("asks.nm.sub")}</p>
        {date ? (
          <button type="button" className="as-datechip" disabled={busy} onClick={onDate}>
            <CalendarDays size={18} aria-hidden="true" />
            <span>{t("asks.nm.date", dayMonth(date))}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        ) : null}
        {unsure > 0 ? <p className="as-why look">{t("asks.nm.unsure", count(unsure))}</p> : null}
        {groups.map((g, i) => (
          <PartNumbers key={g.block?.id ?? "page"} index={i} group={g} photo={photo} findings={findings} questions={questions} kept={kept} busy={busy} onFix={onFix} onSales={onSales} onPart={onPart} onWord={onWord} onType={onType} onAnswer={onAnswer} />
        ))}
      </div>
      <div className="pad column as-dock">
        {notice}
        <Button variant="red" wide disabled={busy} onClick={onSubmit}>
          {t("asks.nm.ok")}
        </Button>
        <p className="as-hint">{after > 0 ? t("asks.nm.next", count(after)) : t("asks.nm.nextNone")}</p>
      </div>
    </div>
  );
}

function PartNumbers({
  index,
  group,
  photo,
  findings,
  questions,
  kept,
  busy,
  onFix,
  onSales,
  onPart,
  onWord,
  onType,
  onAnswer,
}: {
  index: number;
  group: Group;
  photo: Photo;
  findings: readonly Finding[];
  questions: readonly Question[];
  kept: ReadonlySet<string>;
  busy: boolean;
  onFix: (id: string, field: NumberField) => void;
  onSales: (block: string) => void;
  onPart: (block: string) => void;
  onWord: (id: string, field: "item" | "customer", text: string) => void;
  onType: (id: string) => void;
  onAnswer: (q: Question, option: string) => void;
}) {
  const i18n = useI18n();
  const { t, count, money } = i18n;
  const { block, rows } = group;
  const tone = blockTone(block);
  const sales = salesKind(block, rows);
  const person = block?.person?.trim();
  const about = [person ? t("asks.visit.rep", i18n.digits(person)) : null, block && block.party?.trim() ? t(`q.kind.${block.kind}`) : null].filter(Boolean).join(" · ");
  const fails = partFailures(findings, rows);
  // A sum he kept as written no longer marks its figure.
  const open = findings.filter((f) => !kept.has(ackFingerprint(f)));
  const figures = blockFigures(block, rows);
  // F2 (4 Nov): an account with no "before" written showed "-৳200" here though the khata knew ৳225.
  // The khata's due the opening question proposes stands in, said as such; with none known and the
  // figure below zero (a payment with nothing before it), the card says what it needs instead.
  const opening = figures.kind === "account" && figures.before == null ? questions.find((q) => q.id === `opening:${block?.id ?? "page"}`) : undefined;
  const bookBefore = draftPoisha(opening?.options.find((o) => o.id === "book")?.value ?? undefined);
  return (
    <section className="as-nb" aria-label={blockName(i18n, block)}>
      <div className="as-nb-head">
        <span className={`as-avatar sm r-${tone}`} aria-hidden="true">
          {count(index + 1)}
        </span>
        {block ? (
          <button type="button" className="as-who as-who-btn" disabled={busy} onClick={() => onPart(block.id)} aria-label={t("asks.pt.open", blockName(i18n, block))}>
            <b>
              {blockName(i18n, block)}
              <ChevronDown size={18} aria-hidden="true" />
            </b>
            {about ? <span>{about}</span> : null}
          </button>
        ) : (
          <div className="as-who">
            <b>{blockName(i18n, block)}</b>
            {about ? <span>{about}</span> : null}
          </div>
        )}
        {sales && block ? (
          <button type="button" className={cx("as-kind", sales)} disabled={busy} onClick={() => onSales(block.id)} aria-label={t("asks.sl.open", t(`asks.nm.sales.${sales}`))}>
            {t(`asks.nm.sales.${sales}`)}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {rows.map((row) => (
        <NumberLine key={row.id} row={row} block={block} photo={photo} look={failsOn(open, row.id)} busy={busy} onFix={onFix} onWord={onWord} onType={onType} />
      ))}
      {fails.map((f) => {
        const asWritten = kept.has(ackFingerprint(f));
        // The deck's "sum doesn't come out" question for this sum (its id is the engine's).
        const q = asWritten ? undefined : questions.find((x) => x.id === `off:${fingerprint([f.key])}`);
        return (
          <div key={f.key} className={cx("as-off", !asWritten && "look")}>
            <p className="as-why">
              <StatusMark kind={asWritten ? "wait" : "look"} />
              <span>
                {t(OFF_KEY[f.ruleId] ?? "q.off.balance", money(f.expected), money(f.observed))}
                {asWritten ? ` ${t("asks.nm.kept")}` : ""}
              </span>
            </p>
            {q ? (
              <div className="as-off-acts">
                {q.options
                  .filter((o) => !o.local)
                  .map((o) => (
                    <button key={o.id} type="button" className="as-pill" disabled={busy} onClick={() => onAnswer(q, o.id)}>
                      {sentenceText(i18n, o.label)}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {fails.length === 0 && partChecked(findings, rows) ? (
        <p className="as-why">
          <StatusMark kind="ok" />
          <span>{t("asks.nm.sumOk")}</span>
        </p>
      ) : null}
      <div className="as-now sm">
        {figures.kind === "total" ? (
          <>
            <span>{t(block?.kind === "day_sales" ? "asks.total.sales" : block?.kind === "expenses" ? "asks.total.expenses" : "asks.total")}</span>
            <b className="as-num">{money(figures.total)}</b>
          </>
        ) : opening && bookBefore == null && figures.known < 0 ? (
          <>
            <span>{t(nowLabel(figures))}</span>
            <span className="as-gap">{t(`asks.nm.needBefore.${figures.party}`)}</span>
          </>
        ) : opening && bookBefore != null ? (
          <>
            <span className="as-now-who">
              {t(nowLabel(figures))}
              <small>{t("asks.nm.bookBefore", money(bookBefore))}</small>
            </span>
            {figures.now != null ? (
              <b className="as-num">{money(bookBefore + figures.now)}</b>
            ) : (
              <span className="as-open">
                <b className="as-num">{money(bookBefore + figures.known)}</b>
                <span className="as-gap">{t("asks.gapNow")}</span>
              </span>
            )}
          </>
        ) : (
          <>
            <span>{t(nowLabel(figures))}</span>
            {figures.now != null ? (
              <b className="as-num">{money(figures.now)}</b>
            ) : (
              <span className="as-open">
                <b className="as-num">{money(figures.known)}</b>
                <span className="as-gap">{t("asks.gapNow")}</span>
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** One line: its handwriting, then what Scriba read from it, each figure a button to fix it. */
function NumberLine({
  row,
  block,
  photo,
  look,
  busy,
  onFix,
  onWord,
  onType,
}: {
  row: ReviewRow;
  block: BlockValues | null;
  photo: Photo;
  look: boolean;
  busy: boolean;
  onFix: (id: string, field: NumberField) => void;
  onWord: (id: string, field: "item" | "customer", text: string) => void;
  onType: (id: string) => void;
}) {
  const i18n = useI18n();
  const { t, digits } = i18n;
  const v = row.values;
  const open = checkable(row);
  const unsure = new Set(unsureNumbers(row));
  const words = new Set(unsureWords(row));
  const credit = isSaleLine(block, row) && v.type === "credit_sale";
  const sum = block != null && sumsRunning(block.kind);
  // In the day's sales the part's tag says cash or বাকি; elsewhere each line shows its kind, to change it.
  const showType = v.item == null || block?.kind !== "day_sales";
  const fig = (field: NumberField, text: string | null, main: boolean) =>
    text == null ? null : (
      <button
        type="button"
        className={cx("as-fig", main && "main", (unsure.has(field) || (main && look)) && "unsure")}
        disabled={!open || busy}
        onClick={() => onFix(row.id, field)}
        aria-label={t("eq.tap", fieldLabel(i18n, field, sum), digits(text))}
      >
        {digits(text)}
      </button>
    );
  const qty = v.quantityText ? [v.quantityText, v.unit].filter(Boolean).join(" ") : null;
  const amount = v.amountText != null ? fig("amount", v.amountText, true) : null;
  const balance = v.balanceText != null ? fig("balance", v.balanceText, amount == null) : null;
  return (
    <div className={cx("as-nl", !open && "off")}>
      <RowStrip row={row} photo={photo} height={48} tag={false} />
      <div className="as-nl-row">
        {v.crossedOut || row.status === "confirmed" ? (
          <span className="as-nl-label">{v.crossedOut ? t("asks.nm.crossed") : t("asks.nm.in")}</span>
        ) : (
          <span className="as-nl-words">
            {v.item != null ? <WordEdit text={v.item} unsure={words.has("item") || words.has("text") || words.has("unit")} disabled={!open || busy} onSave={(text) => onWord(row.id, "item", text)} /> : null}
            {credit && v.customer ? (
              <span className="as-nl-credit">
                <span>{t("asks.nm.creditOf")}</span>
                <WordEdit text={v.customer} unsure={words.has("customer")} disabled={!open || busy} onSave={(text) => onWord(row.id, "customer", text)} />
              </span>
            ) : null}
            {showType ? (
              <button type="button" className={cx("as-tag", v.item == null && "lead")} disabled={!open || busy} onClick={() => onType(row.id)} aria-label={t("asks.nm.type", t(`type.${v.type}`))}>
                {t(`type.${v.type}`)}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        )}
        <span className="as-nl-figs">
          {qty ? <button type="button" className={cx("as-fig", unsure.has("qty") && "unsure")} disabled={!open || busy} onClick={() => onFix(row.id, "qty")} aria-label={t("eq.tap", fieldLabel(i18n, "qty"), digits(qty))}>{digits(qty)}</button> : null}
          {qty && v.rateText ? <i aria-hidden="true">×</i> : null}
          {fig("rate", v.rateText, false)}
          {v.rateText && (amount || balance) ? <i aria-hidden="true">=</i> : null}
          {amount}
          {amount && balance ? <i className="as-nl-bal">{fieldLabel(i18n, "balance", sum)}</i> : null}
          {balance}
          {amount == null && balance == null ? <span className="as-gap">{t("asks.gap")}</span> : null}
        </span>
      </div>
    </div>
  );
}

/**
 * A word Scriba read, fixed where it stands (F2 fix 9): a tap turns it into a box with the word in
 * it; Enter or leaving the box saves it, with nothing to confirm. A word Scriba wasn't sure of is
 * turmeric, like a doubted figure.
 */
function WordEdit({ text, unsure, disabled, onSave }: { text: string; unsure: boolean; disabled: boolean; onSave: (text: string) => void }) {
  const { t, digits } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const done = () => {
    if (draft != null && draft.trim() && draft.trim() !== text) onSave(draft.trim());
    setDraft(null);
  };
  if (draft != null) {
    return (
      <form
        className="as-word-form"
        onSubmit={(e) => {
          e.preventDefault();
          done();
        }}
      >
        <input
          className="as-word-input"
          value={draft}
          maxLength={80}
          autoFocus
          aria-label={t("asks.nm.word", digits(text))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDraft(null);
          }}
        />
      </form>
    );
  }
  return (
    <button type="button" className={cx("as-word", unsure && "unsure")} disabled={disabled} onClick={() => setDraft(text)} aria-label={t("asks.nm.word", digits(text))}>
      {digits(text)}
    </button>
  );
}

/** One sale's kind as he set it on the sales sheet: cash, or credit with who took it. */
export type SaleKindChange = { row: ReviewRow; type: Extract<TransactionType, "cash_sale" | "credit_sale">; customer: string | null };

/**
 * The day's sales, cash or বাকি (F2): opened from the part's tag. Every sale is cash unless he
 * marks it বাকি; a sale on credit needs the name of who took it, or the due would belong to
 * nobody. Each change is saved at once, like a fix.
 */
export function SalesSheet({
  group,
  photo,
  busy,
  onKind,
  onClose,
}: {
  group: Group | null;
  photo: Photo;
  busy: boolean;
  onKind: (changes: SaleKindChange[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={group != null} onClose={onClose} label={t("asks.sl.title")}>
      {group ? <SalesBody group={group} photo={photo} busy={busy} onKind={onKind} onClose={onClose} /> : null}
    </Sheet>
  );
}

function SalesBody({ group, photo, busy, onKind, onClose }: { group: Group; photo: Photo; busy: boolean; onKind: (changes: SaleKindChange[]) => void; onClose: () => void }) {
  const { t, digits } = useI18n();
  const sales = group.rows.filter((r) => isSaleLine(group.block, r) && checkable(r));
  /** The line waiting for a name before it can be বাকি. */
  const [naming, setNaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const credit = sales.filter((r) => r.values.type === "credit_sale");
  const pick = (row: ReviewRow, kind: "cash" | "credit") => {
    if (kind === "cash") {
      setNaming(null);
      if (row.values.type !== "cash_sale") onKind([{ row, type: "cash_sale", customer: row.values.customer }]);
      return;
    }
    if (row.values.type === "credit_sale") return;
    if (row.values.customer?.trim()) return onKind([{ row, type: "credit_sale", customer: row.values.customer }]);
    setName("");
    setNaming(row.id);
  };
  return (
    <div className="as-sheet">
      <div className="as-sheet-head">
        <span className="t-sec">{t("asks.sl.title")}</span>
        <button type="button" className="back" onClick={onClose} aria-label={t("close")}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <p className="t-body">{t("asks.sl.sub")}</p>
      <div className="as-sl-list">
        {sales.map((row) => {
          const isCredit = row.values.type === "credit_sale";
          const figure = row.values.amountText ?? row.values.balanceText;
          return (
            <div key={row.id} className="as-sl-row">
              <RowStrip row={row} photo={photo} height={42} tag={false} />
              <div className="as-sl-line">
                <span className="as-nl-label">
                  {digits(row.values.item ?? t(`type.${row.values.type}`))}
                  {figure ? <b className="as-num">{digits(figure)}</b> : null}
                </span>
                <Segmented
                  label={t("asks.sl.title")}
                  disabled={busy}
                  value={isCredit || naming === row.id ? "credit" : "cash"}
                  options={[
                    { value: "cash", label: t("asks.sl.cash") },
                    { value: "credit", label: t("asks.sl.credit") },
                  ]}
                  onChange={(kind) => pick(row, kind)}
                />
              </div>
              {isCredit && row.values.customer ? <span className="as-sl-who">{t("asks.nm.creditTo", digits(row.values.customer))}</span> : null}
              {naming === row.id ? (
                <form
                  className="as-sl-name"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!name.trim()) return;
                    onKind([{ row, type: "credit_sale", customer: name.trim() }]);
                    setNaming(null);
                  }}
                >
                  <label className="grid gap-1">
                    <span className="t-small">{t("asks.sl.who")}</span>
                    <input className="as-input" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
                  </label>
                  <Button type="submit" variant="red" disabled={busy || !name.trim()}>
                    {t("asks.keep")}
                  </Button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
      {credit.length > 0 ? (
        <Button variant="line" wide disabled={busy} onClick={() => onKind(credit.map((r) => ({ row: r, type: "cash_sale" as const, customer: r.values.customer })))}>
          {t("asks.sl.allCash")}
        </Button>
      ) : null}
      <Button variant="red" wide disabled={busy} onClick={onClose}>
        {t("asks.sl.done")}
      </Button>
    </div>
  );
}
