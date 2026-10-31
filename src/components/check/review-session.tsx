"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { TransactionType } from "@/lib/ledger/types";
import { ackFingerprint, assessEntry } from "@/lib/review/approval";
import type { ReviewRow } from "@/lib/review/state";
import { FIELD_TO_VALUE_KEY } from "@/lib/review/values";
import {
  type Acceptances,
  type Review,
  acceptanceFor,
  cardStatus,
  checkReview,
  confirmEntries,
  deckOrder,
  linesLeft,
  nextWaiting,
  pageOutcome,
  typedText,
} from "./deck-model";
import { FixSheet, type FixField, LineMenu, TypeSheet } from "./deck-sheets";
import { type DeckActions, DeckView } from "./deck-view";
import { SealedView, SummaryView } from "./end-views";
import type { Photo } from "./reading-view";
import { RevealView } from "./reveal-view";
import type { LinePatch, ReviewApi, SavedLine } from "./review-api";
import { lineSentences } from "./sentences";

type Stage = "reveal" | "deck" | "summary" | "done";
type Problem = "save" | "conflict" | "some" | "fail";

const without = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as Record<string, T>;

/**
 * One page from the reveal to the khata: the reveal, the check deck, the summary and the seal
 * over one review state. Every line change is saved at once through `api` (versioned); the
 * confirmation sends only accepted lines and the server re-checks everything.
 */
export function ReviewSession({ api, initial, photo, sub, pageNumber, nextHref, detailsHref }: { api: ReviewApi; initial: Review; photo: Photo; sub: string; pageNumber: number; nextHref: string | null; detailsHref: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [review, setReview] = useState(initial);
  const [acceptances, setAcceptances] = useState<Acceptances>({});
  const alreadyIn = initial.rows.some((r) => r.status === "confirmed") && initial.rows.every((r) => r.status !== "draft");
  const [stage, setStage] = useState<Stage>(alreadyIn ? "done" : "reveal");
  const [landed, setLanded] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [fix, setFix] = useState<{ id: string; field: FixField } | null>(null);
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const started = useRef(false);

  const { findings, entries } = useMemo(() => checkReview(review), [review]);
  const rowById = (id: string) => review.rows.find((r) => r.id === id)!;
  const statusesFor = (next: Review, acc: Acceptances) => {
    const checked = checkReview(next);
    return order.map((id) => cardStatus(next.rows.find((r) => r.id === id)!, checked.entries.get(id), checked.findings, acc[id]));
  };
  const statuses = statusesFor(review, acceptances);

  const withLine = (id: string, line: SavedLine): Review => ({ ...review, rows: review.rows.map((r) => (r.id === id ? { ...r, ...line } : r)) });

  async function save(row: ReviewRow, patch: LinePatch): Promise<Review | null> {
    setBusy(true);
    setProblem(null);
    const res = await api.saveLine(row, patch);
    setBusy(false);
    if (!res.ok) {
      setProblem(res.reason === "conflict" ? "conflict" : "save");
      return null;
    }
    const next = withLine(row.id, res.line);
    setReview(next);
    return next;
  }

  function advance(next: Review, acc: Acceptances) {
    const n = nextWaiting(statusesFor(next, acc), index);
    if (n < 0) setStage("summary");
    else setIndex(n);
  }

  function start() {
    if (!started.current && !review.page.reviewStartedAt) api.markStarted();
    started.current = true;
    const o = deckOrder(review);
    setOrder(o);
    setIndex(0);
    setStage(o.length > 0 ? "deck" : "summary");
  }

  /** Every change to a line takes back its acceptance: it has to be looked at again. */
  async function change(id: string, patch: LinePatch, then?: (next: Review, acc: Acceptances) => void) {
    const next = await save(rowById(id), patch);
    if (!next) return;
    const acc = without(acceptances, id);
    setAcceptances(acc);
    then?.(next, acc);
  }

  const actions: DeckActions = {
    accept(id) {
      const acc = { ...acceptances, [id]: acceptanceFor(entries.get(id)!, findings, "ok") };
      setAcceptances(acc);
      advance(review, acc);
    },
    async asWritten(id) {
      const row = rowById(id);
      if (row.reviewFields.length === 0) {
        const acc = { ...acceptances, [id]: acceptanceFor(entries.get(id)!, findings, "asWritten") };
        setAcceptances(acc);
        return advance(review, acc);
      }
      // "That's what's written" on a number Scriba doubted: it is checked now, and the checks run
      // again. If that brings up a problem he hasn't seen yet, the card stays so he can see it.
      const shown = new Set(assessEntry(entries.get(id)!, findings).needsAck.filter((f) => f.ruleId !== "model_uncertainty").map(ackFingerprint));
      const next = await save(row, { markChecked: row.reviewFields });
      if (!next) return;
      const checked = checkReview(next);
      const acceptance = acceptanceFor(checked.entries.get(id)!, checked.findings, "asWritten");
      if (!acceptance.acks.findings.every((fp) => shown.has(fp))) return;
      const acc = { ...acceptances, [id]: acceptance };
      setAcceptances(acc);
      advance(next, acc);
    },
    openFix: (id, field) => setFix({ id, field }),
    openType: (id) => setTypeFor(id),
    remove: (id) => void change(id, { status: "rejected" }, advance),
    restore: (id) => void change(id, { status: "draft" }),
    notCrossed: (id) => void change(id, { values: { ...rowById(id).values, crossedOut: false } }),
    openMenu: () => setMenu(true),
  };

  async function saveFix(typed: string) {
    if (!fix) return;
    const row = rowById(fix.id);
    const key = FIELD_TO_VALUE_KEY[fix.field];
    await change(fix.id, { values: { ...row.values, [key]: typedText(typed, row.values[key] as string | null) } });
    setFix(null);
  }

  async function pickType(type: TransactionType) {
    if (!typeFor) return;
    await change(typeFor, { values: { ...rowById(typeFor).values, type } });
    setTypeFor(null);
  }

  async function confirm() {
    const body = confirmEntries(review, acceptances);
    setBusy(true);
    setProblem(null);
    const res = await api.confirm(body);
    setBusy(false);
    if (!res.ok) {
      if (res.reason === "notReady") {
        let acc = acceptances;
        for (const id of res.lineIds ?? []) acc = without(acc, id);
        setAcceptances(acc);
      }
      setProblem(res.reason === "notReady" ? "some" : res.reason === "conflict" ? "conflict" : "fail");
      return;
    }
    const sent = new Set(body.map((e) => e.id));
    setReview({ ...review, rows: review.rows.map((r) => (sent.has(r.id) ? { ...r, status: "confirmed" } : r)) });
    setLanded(true);
    setStage("done");
  }

  const notice = problem ? (
    <div className="dk-err" role="alert">
      <span>{t(problem === "conflict" ? "dk.err.conflict" : problem === "save" ? "dk.err.save" : problem === "some" ? "sl.err.some" : "sl.err.fail")}</span>
      {problem === "conflict" ? (
        <Button variant="line" onClick={() => window.location.reload()}>
          {t("dk.reload")}
        </Button>
      ) : null}
    </div>
  ) : null;

  const accountName = review.page.values.accountName;
  const current = stage === "deck" ? rowById(order[index]!) : null;

  if (stage === "reveal") {
    return <RevealView photo={photo} rows={review.rows} page={review.page} sub={sub} backHref="/" onStart={start} nextHref={nextHref} nextPage={nextHref ? pageNumber + 1 : undefined} />;
  }
  if (stage === "done") {
    return <SealedView photo={photo} rows={review.rows} findings={findings} outcome={pageOutcome(review, findings)} land={landed} pageNumber={pageNumber} accountName={accountName} sub={sub} nextHref={nextHref} />;
  }
  if (stage === "summary") {
    const statusOf = (row: ReviewRow) => cardStatus(row, entries.get(row.id), findings, acceptances[row.id]);
    return (
      <SummaryView
        rows={review.rows.filter((r) => r.status !== "confirmed")}
        findings={findings}
        statusOf={statusOf}
        asWritten={(row) => acceptances[row.id]?.kind === "asWritten" && statusOf(row) === "done"}
        accountName={accountName}
        sub={sub}
        left={linesLeft(review, acceptances)}
        canConfirm={confirmEntries(review, acceptances).length > 0}
        busy={busy}
        notice={notice}
        onOpenLine={(id) => {
          const known = order.indexOf(id);
          if (known < 0) {
            setOrder([...order, id]);
            setIndex(order.length);
          } else setIndex(known);
          setStage("deck");
        }}
        onConfirm={confirm}
        onBack={() => (order.length > 0 ? setStage("deck") : setStage("reveal"))}
      />
    );
  }

  const fixRow = fix ? rowById(fix.id) : null;
  return (
    <>
      <DeckView
        order={order}
        index={index}
        setIndex={setIndex}
        rows={review.rows}
        findings={findings}
        entries={entries}
        statuses={statuses}
        photo={photo}
        sub={sub}
        busy={busy}
        notice={notice}
        actions={actions}
        onBack={() => setStage("reveal")}
      />
      <FixSheet target={fixRow && fix ? { row: fixRow, field: fix.field } : null} photo={photo} hint={fixRow ? lineSentences(i18n, fixRow, review.rows, findings).hint : null} busy={busy} onSave={saveFix} onClose={() => setFix(null)} />
      <TypeSheet row={typeFor ? rowById(typeFor) : null} busy={busy} onPick={pickType} onClose={() => setTypeFor(null)} />
      <LineMenu
        row={current}
        open={menu}
        busy={busy}
        detailsHref={detailsHref}
        onType={() => {
          setMenu(false);
          if (current) setTypeFor(current.id);
        }}
        onRemove={() => {
          setMenu(false);
          if (current) actions.remove(current.id);
        }}
        onRestore={() => {
          setMenu(false);
          if (current) actions.restore(current.id);
        }}
        onSummary={() => {
          setMenu(false);
          setStage("summary");
        }}
        onClose={() => setMenu(false)}
      />
    </>
  );
}
