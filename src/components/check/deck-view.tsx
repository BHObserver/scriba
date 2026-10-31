"use client";

import { MoreHorizontal } from "lucide-react";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "motion/react";
import { useState, type ReactNode } from "react";
import { Button, ButtonRow, Equation, LineStrip, StatusMark, TopBar, type EquationField } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { ReviewRow } from "@/lib/review/state";
import type { Finding, ValidationEntry } from "@/lib/validation/engine";
import { type CardStatus, canAccept, editOf } from "./deck-model";
import type { FixField } from "./deck-sheets";
import type { Photo } from "./reading-view";
import { lineSentences } from "./sentences";

const SWIPE_PX = 110;

/** A plain card follows the finger and flies off right past 110 px; a problem card resists: it needs a decision, not a flick. */
function SwipeCard({ canSwipe, onSwiped, children }: { canSwipe: boolean; onSwiped: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, (v) => v / 30);
  const [stamp, setStamp] = useState(false);
  useMotionValueEvent(x, "change", (v) => setStamp(canSwipe && v > 40));
  const leave = () => {
    if (reduce) return onSwiped();
    void animate(x, 480, { duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }).then(onSwiped);
  };
  return (
    <motion.div
      className="card dk-card"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={canSwipe ? 0.9 : 0.12}
      dragSnapToOrigin
      onDragEnd={(_, info) => {
        if (canSwipe && info.offset.x > SWIPE_PX) leave();
      }}
    >
      {stamp ? <span className="dk-swipe-ok" aria-hidden="true">{t("dk.okStamp")}</span> : null}
      {children}
    </motion.div>
  );
}

export type DeckActions = {
  accept: (id: string) => void;
  asWritten: (id: string) => void;
  openFix: (id: string, field: FixField) => void;
  openType: (id: string) => void;
  remove: (id: string) => void;
  restore: (id: string) => void;
  notCrossed: (id: string) => void;
  openMenu: () => void;
};

/** The field the fix button opens: the number Scriba was unsure of, else the amount. */
function firstFixField(row: ReviewRow): FixField {
  const unsure = row.reviewFields.find((f) => f === "qty" || f === "rate" || f === "amount" || f === "balance");
  return (unsure as FixField | undefined) ?? "amount";
}

function LineCard({ row, rows, findings, status, photo, lineNo, onTap }: { row: ReviewRow; rows: readonly ReviewRow[]; findings: readonly Finding[]; status: CardStatus; photo: Photo; lineNo: number; onTap: (field: FixField) => void }) {
  const i18n = useI18n();
  const { t, digits } = i18n;
  const v = row.values;
  const { checks, hint } = lineSentences(i18n, row, rows, findings);
  const problems = checks.some((c) => c.kind === "look");
  const edit = editOf(row);
  const fail = checks.some((c) => c.kind === "look") && findings.some((f) => f.status === "fail" && f.entryIds.includes(row.id));
  const look: Partial<Record<EquationField, boolean>> = {
    qty: row.reviewFields.includes("qty"),
    rate: row.reviewFields.includes("rate"),
    amount: row.reviewFields.includes("amount") || fail,
  };
  const show = (text: string | null) => (text == null ? null : digits(text));
  const kind = t(`type.${v.type}`);
  const sub = status === "done" ? t("dk.seen") : [v.item ? kind : t("dk.line", lineNo), v.customer].filter(Boolean).join(" · ");
  return (
    <>
      <LineStrip src={photo.src} box={row.candidate?.bbox ?? null} photoWidth={photo.width} photoHeight={photo.height} turns={photo.turns} reading={v.sourceText} />
      <div className="dk-item">
        <b>{v.item ?? kind}</b>
        <span className="dk-type">{sub}</span>
      </div>
      {status === "removed" ? (
        <div className="dk-panel">{t("dk.removed")}</div>
      ) : (
        <>
          <Equation qty={show(v.quantityText)} rate={show(v.rateText)} unit={v.unit} amount={show(v.amountText)} look={look} onTap={(f) => onTap(f)} />
          {v.balanceText != null ? (
            <button type="button" className="dk-bal" onClick={() => onTap("balance")} aria-label={t("eq.tap", t("field.balance"), digits(v.balanceText))}>
              <span>{t("field.balance")}</span>
              <b className={cx(row.reviewFields.includes("balance") && "hl")}>{digits(v.balanceText)}</b>
            </button>
          ) : null}
          <div className="dk-checks">
            {checks.map((c) => (
              <div key={c.text} className="dk-check">
                <StatusMark kind={c.kind === "info" ? "wait" : c.kind} />
                <span>{c.text}</span>
              </div>
            ))}
          </div>
          {hint ? <div className="dk-panel">{hint}</div> : null}
          {edit ? (
            <div className="dk-panel ok">
              {t("dk.edited", digits(edit.from), digits(edit.to))}
              {!problems && checks.some((c) => c.kind === "ok") ? ` ${t("dk.nowOk")}` : ""}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/** The check deck (DESIGN_SPEC D2 "Deck"): one card per line, problems first, progress segments, ghost cards behind. */
export function DeckView({
  order,
  index,
  setIndex,
  rows,
  findings,
  entries,
  statuses,
  photo,
  sub,
  busy,
  notice,
  actions,
  onBack,
}: {
  order: readonly string[];
  index: number;
  setIndex: (i: number) => void;
  rows: readonly ReviewRow[];
  findings: readonly Finding[];
  entries: ReadonlyMap<string, ValidationEntry>;
  statuses: readonly CardStatus[];
  photo: Photo;
  sub: string;
  busy: boolean;
  notice: ReactNode;
  actions: DeckActions;
  onBack: () => void;
}) {
  const { t, count } = useI18n();
  const id = order[index]!;
  const row = rows.find((r) => r.id === id)!;
  const entry = entries.get(id);
  const status = statuses[index]!;
  const left = statuses.filter((s) => s === "look" || s === "open").length;
  const lineNo = rows.indexOf(row) + 1;

  const v = row.values;
  const blocked = entry != null && !canAccept(entry, findings);
  const noAmount = blocked && entry != null && !v.crossedOut && v.type !== "unknown";
  const buttons = (() => {
    if (status === "removed") {
      return (
        <Button variant="red" wide disabled={busy} onClick={() => actions.restore(id)}>
          {t("dk.restore")}
        </Button>
      );
    }
    const fix = (
      <Button variant="line" disabled={busy} onClick={() => actions.openFix(id, firstFixField(row))}>
        {t("dk.fix")}
      </Button>
    );
    if (v.crossedOut) {
      return (
        <ButtonRow>
          <Button variant="line" disabled={busy} onClick={() => actions.notCrossed(id)}>
            {t("dk.notCrossed")}
          </Button>
          <Button variant="red" disabled={busy} onClick={() => actions.remove(id)}>
            {t("dk.remove")}
          </Button>
        </ButtonRow>
      );
    }
    if (v.type === "unknown") {
      return (
        <ButtonRow>
          {fix}
          <Button variant="red" disabled={busy} onClick={() => actions.openType(id)}>
            {t("dk.pickType")}
          </Button>
        </ButtonRow>
      );
    }
    if (noAmount) {
      return (
        <ButtonRow>
          <Button variant="line" disabled={busy} onClick={() => actions.remove(id)}>
            {t("dk.remove")}
          </Button>
          <Button variant="red" disabled={busy} onClick={() => actions.openFix(id, "amount")}>
            {t("dk.typeAmount")}
          </Button>
        </ButtonRow>
      );
    }
    return (
      <ButtonRow>
        {fix}
        {status === "look" ? (
          <Button variant="red" disabled={busy} onClick={() => actions.asWritten(id)}>
            {t("dk.asWritten")}
          </Button>
        ) : (
          <Button variant="red" disabled={busy} onClick={() => actions.accept(id)}>
            {t("dk.ok")}
          </Button>
        )}
      </ButtonRow>
    );
  })();

  return (
    <div className="flow column">
      <TopBar
        title={t("rv.start")}
        sub={sub}
        onBack={onBack}
        right={
          <button type="button" className="back" onClick={actions.openMenu} aria-label={t("dk.menu")}>
            <MoreHorizontal size={26} aria-hidden="true" />
          </button>
        }
      />
      <div className="pad">
        <div className="dk-progress" role="group" aria-label={t("dk.lines")}>
          {order.map((o, i) => (
            <button
              key={o}
              type="button"
              aria-label={t("dk.line", i + 1)}
              aria-current={i === index ? "step" : undefined}
              onClick={() => setIndex(i)}
              className={cx("dk-seg", i === index ? "now" : statuses[i] === "done" || statuses[i] === "removed" ? "ok" : statuses[i] === "look" && "look")}
            />
          ))}
        </div>
        <div className="dk-meta">
          <span>
            {count(index + 1)} / {count(order.length)}
          </span>
          <span>{left ? t("dk.left", left) : t("dk.allLook")}</span>
        </div>
      </div>
      <div className="dk-area">
        <div className="dk-stack">
          <div className="dk-ghost g2" aria-hidden="true" />
          <div className="dk-ghost" aria-hidden="true" />
          <SwipeCard key={id} canSwipe={!busy && (status === "open" || status === "done")} onSwiped={() => actions.accept(id)}>
            <LineCard row={row} rows={rows} findings={findings} status={status} photo={photo} lineNo={lineNo} onTap={(f) => actions.openFix(id, f)} />
          </SwipeCard>
        </div>
        <p className="dk-hint">{status === "look" ? t("dk.tapHint") : status === "removed" ? "" : t("dk.swipeHint")}</p>
      </div>
      <div className="pad dk-acts">
        {notice}
        {buttons}
      </div>
    </div>
  );
}
