"use client";

import type { ReactNode } from "react";
import { OrientedImage } from "@/components/photo-orientation";
import { Button, ButtonLink, Seal, StatusMark, TopBar, type MarkKind } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { ReviewRow } from "@/lib/review/state";
import { deriveNumbers, type Finding } from "@/lib/validation/engine";
import type { CardStatus, PageOutcome } from "./deck-model";
import { editOf } from "./deck-model";
import type { Photo } from "./reading-view";
import { lineSentences, pageSentence } from "./sentences";

function amountPoisha(row: ReviewRow): number | null {
  const a = deriveNumbers(row.values).amount;
  return a && a.ok ? a.value : null;
}

/** Summary (DESIGN_SPEC D2 "Summary → confirm"): the page's figure with its check, every line with its note, then confirm. */
export function SummaryView({
  rows,
  findings,
  statusOf,
  asWritten,
  accountName,
  sub,
  left,
  canConfirm,
  busy,
  notice,
  onOpenLine,
  onConfirm,
  onBack,
}: {
  rows: readonly ReviewRow[];
  findings: readonly Finding[];
  statusOf: (row: ReviewRow) => CardStatus;
  asWritten: (row: ReviewRow) => boolean;
  accountName: string | null;
  sub: string;
  left: number;
  canConfirm: boolean;
  busy: boolean;
  notice: ReactNode;
  onOpenLine: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const i18n = useI18n();
  const { t, digits, money } = i18n;
  const hero = pageSentence(i18n, rows, findings);

  return (
    <div className="flow column">
      <TopBar title={t("sm.title")} sub={sub} onBack={onBack} />
      <div className="pad sm-scroll">
        {hero ? (
          <section className="card sm-hero">
            <div className="stitch" aria-hidden="true" />
            <div className="sm-hero-in">
              <span className="t-label">{hero.label === "closing" ? (accountName ? t("sm.due", accountName) : t("sm.closing")) : t("sm.total")}</span>
              <span className="hero-n">{money(hero.amount)}</span>
              <div className="sm-eq">
                <StatusMark kind={hero.kind} />
                <span>{hero.text}</span>
              </div>
            </div>
          </section>
        ) : null}
        <ul className="card sm-list">
          {rows.map((row) => {
            const status = statusOf(row);
            const edit = editOf(row);
            const kept = asWritten(row);
            const firstProblem = kept ? lineSentences(i18n, row, rows, findings).checks.find((c) => c.kind === "look") : undefined;
            const note =
              status === "removed"
                ? t("sm.removed")
                : edit
                  ? t("dk.edited", digits(edit.from), digits(edit.to))
                  : kept
                    ? [t("sm.asWritten"), firstProblem?.text].filter(Boolean).join(" ")
                    : status === "look" || status === "open"
                      ? t("sm.notYet")
                      : null;
            const mark: MarkKind = status === "look" || status === "open" ? "wait" : kept ? "look" : status === "removed" ? "wait" : "ok";
            const v = row.values;
            const name = v.item ? [v.item, v.quantityText && digits(v.quantityText), v.unit].filter(Boolean).join(" ") : t(`type.${v.type}`);
            const amount = amountPoisha(row);
            const body = (
              <>
                <StatusMark kind={mark} />
                <span className={status === "removed" ? "sm-name line-through text-ink-soft" : "sm-name"}>{name}</span>
                <span className="sm-amt">{status === "removed" ? "" : amount != null ? money(amount) : digits(v.amountText ?? "—")}</span>
                {note ? <span className="sm-note">{note}</span> : null}
              </>
            );
            return (
              <li key={row.id}>
                {status === "look" || status === "open" ? (
                  <button type="button" className="sm-row" onClick={() => onOpenLine(row.id)}>
                    {body}
                  </button>
                ) : (
                  <div className="sm-row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="pad sm-acts">
        {notice}
        <Button variant="red" wide disabled={!canConfirm || left > 0 || busy} onClick={onConfirm}>
          {left > 0 ? t("sm.left", left) : t("sm.confirm")}
        </Button>
        <p className="t-small text-center">{t("sm.after")}</p>
      </div>
    </div>
  );
}

/**
 * The end of a page (DESIGN_SPEC D2 "seal"): the seal lands only when every line is in or
 * removed, nothing fails and at least one check passed. Otherwise the page is "in" and the
 * screen says plainly what still doesn't add up.
 */
export function SealedView({ photo, rows, findings, outcome, land, pageNumber, accountName, sub, nextHref }: { photo: Photo; rows: readonly ReviewRow[]; findings: readonly Finding[]; outcome: PageOutcome; land: boolean; pageNumber: number; accountName: string | null; sub: string; nextHref: string | null }) {
  const i18n = useI18n();
  const { t, money } = i18n;
  const hero = pageSentence(i18n, rows, findings);
  const balanceFail = outcome.fails.find((f) => f.ruleId === "balance_equation");
  const body = (() => {
    if (outcome.sealed) {
      const due = hero?.label === "closing" && accountName ? ` ${t("sl.due", accountName, money(hero.amount))}` : "";
      return t("sl.lines", outcome.confirmed) + due;
    }
    if (balanceFail?.expected != null && balanceFail.observed != null) return t("sl.balFail", money(balanceFail.expected).replace("৳", ""), money(balanceFail.observed));
    if (outcome.fails.length > 0) return `${t("sl.lines", outcome.confirmed)} ${t("sl.fails", outcome.fails.length)}`;
    return `${t("sl.lines", outcome.confirmed)} ${t("sl.noChecks")}`;
  })();
  return (
    <div className="flow column">
      <TopBar title={t("sl.title")} sub={sub} backHref="/" />
      {photo.src ? (
        <div className="sl-photo">
          <OrientedImage src={photo.src} alt="" turns={photo.turns} size={photo} maxHeightVh={40} />
          {outcome.sealed ? <Seal size={124} land={land} /> : null}
        </div>
      ) : null}
      <div className="sl-text" aria-live="polite">
        <h2 className="t-title">{outcome.sealed ? t("sl.ok", pageNumber) : t("sl.in", pageNumber)}</h2>
        <p className="t-body">{body}</p>
      </div>
      <div className="pad sl-acts">
        {nextHref ? (
          <ButtonLink href={nextHref} variant="red" wide>
            {t("rv.nextPage", pageNumber + 1)}
          </ButtonLink>
        ) : (
          <ButtonLink href="/capture" variant="red" wide>
            {t("sl.again")}
          </ButtonLink>
        )}
        <ButtonLink href="/" variant="line" wide>
          {t("sl.today")}
        </ButtonLink>
      </div>
    </div>
  );
}
