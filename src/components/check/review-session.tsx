"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { EntryValues, PageValues, TransactionType } from "@/lib/ledger/types";
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
  restoreAcceptances,
  storedAcceptances,
  typedText,
} from "./deck-model";
import { FixSheet, type FixField, LineMenu, TypeSheet } from "./deck-sheets";
import { type DeckActions, DeckView } from "./deck-view";
import { SealedView, SummaryView } from "./end-views";
import { AddSheet, PageSheet } from "./page-sheets";
import type { Photo } from "./reading-view";
import { NothingView, RevealView } from "./reveal-view";
import type { LinePatch, ReviewApi, SavedLine } from "./review-api";
import { lineSentences } from "./sentences";

type Stage = "nothing" | "reveal" | "deck" | "summary" | "done";
type Problem = "save" | "conflict" | "some" | "fail";

const without = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as Record<string, T>;

/** Acceptances live in this tab's session storage, so a reload or a visit to another screen keeps them. */
const storeKey = (runId: string) => `scriba.accept.${runId}`;
function readStored(runId: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(storeKey(runId)) ?? "null");
  } catch {
    return null;
  }
}
function writeStored(runId: string, value: object | null) {
  try {
    if (value) sessionStorage.setItem(storeKey(runId), JSON.stringify(value));
    else sessionStorage.removeItem(storeKey(runId));
  } catch {
    // Storage full or blocked: acceptances then last as long as the page, as before.
  }
}

/**
 * One page from the reveal to the khata: the reveal, the check deck, the summary and the seal
 * over one review state. Every line change is saved at once through `api` (versioned); the
 * confirmation sends only accepted lines and the server re-checks everything.
 */
export function ReviewSession({
  api,
  runId,
  initial,
  photo,
  pageTitle,
  capturedAt,
  pageNumber,
  nextHref,
  detailsHref,
}: {
  api: ReviewApi;
  runId: string;
  initial: Review;
  photo: Photo;
  pageTitle: string;
  /** When the photo was taken: the page's day when its written date can't be read. */
  capturedAt: string;
  pageNumber: number;
  nextHref: string | null;
  detailsHref: string;
}) {
  const i18n = useI18n();
  const { t, digits } = i18n;
  const [review, setReview] = useState(initial);
  const [acceptances, setAcceptances] = useState<Acceptances>({});
  const alreadyIn = initial.rows.some((r) => r.status === "confirmed") && initial.rows.every((r) => r.status !== "draft");
  const [stage, setStage] = useState<Stage>(alreadyIn ? "done" : initial.rows.every((r) => r.status === "rejected") ? "nothing" : "reveal");
  const [landed, setLanded] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [fix, setFix] = useState<{ id: string; field: FixField } | null>(null);
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  /** Where a new line goes: after this row, or null for the top of the page. */
  const [adding, setAdding] = useState<{ afterId: string | null } | null>(null);
  const [pageOpen, setPageOpen] = useState(false);
  const started = useRef(false);

  const { findings, entries } = useMemo(() => checkReview(review), [review]);
  const rowById = (id: string) => review.rows.find((r) => r.id === id)!;
  const statusesFor = (next: Review, acc: Acceptances, ids: readonly string[] = order) => {
    const checked = checkReview(next);
    return ids.map((id) => cardStatus(next.rows.find((r) => r.id === id)!, checked.entries.get(id), checked.findings, acc[id]));
  };
  const statuses = statusesFor(review, acceptances);

  // Written only once the deck has started, so the empty set before that never overwrites what was kept.
  useEffect(() => {
    if (started.current) writeStored(runId, storedAcceptances(review, acceptances));
  }, [runId, review, acceptances]);

  const withLine = (id: string, line: SavedLine): Review => ({ ...review, rows: review.rows.map((r) => (r.id === id ? { ...r, ...line } : r)) });

  function begin() {
    if (!started.current && !review.page.reviewStartedAt) api.markStarted();
    started.current = true;
  }

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

  /** Into the deck from the reveal, with whatever he had already accepted on this page in this tab. */
  function start() {
    const fresh = !started.current;
    begin();
    const acc = fresh ? { ...restoreAcceptances(review, readStored(runId)), ...acceptances } : acceptances;
    setAcceptances(acc);
    const o = deckOrder(review);
    const first = nextWaiting(statusesFor(review, acc, o), -1);
    setOrder(o);
    setIndex(Math.max(first, 0));
    setStage(o.length > 0 && first >= 0 ? "deck" : "summary");
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

  function openAdd(afterId: string | null) {
    setProblem(null);
    setAdding({ afterId });
  }

  /** A new line goes into the page where he asked, and its card comes next in the deck. */
  async function addLine(values: EntryValues) {
    if (!adding) return;
    setBusy(true);
    setProblem(null);
    const res = await api.addLine(adding.afterId, values);
    setBusy(false);
    if (!res.ok) return setProblem("save");
    begin();
    const rows = [...review.rows];
    rows.splice(adding.afterId ? rows.findIndex((r) => r.id === adding.afterId) + 1 : 0, 0, res.row);
    setReview({ ...review, rows });
    const at = stage === "deck" ? index + 1 : order.length;
    setOrder([...order.slice(0, at), res.row.id, ...order.slice(at)]);
    setIndex(at);
    setStage("deck");
    setAdding(null);
  }

  /** Page details change which checks run; acceptances stand only where the problems shown are unchanged. */
  async function savePage(values: PageValues) {
    setBusy(true);
    setProblem(null);
    const res = await api.savePage(review.page, values);
    setBusy(false);
    if (!res.ok) return setProblem(res.reason === "conflict" ? "conflict" : "save");
    setReview({ ...review, page: res.page });
    setPageOpen(false);
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

  // The written date is khata text: never translated, only its digits follow the language.
  const { accountName, dateText, ledgerType } = review.page.values;
  const sub = [pageTitle, accountName, dateText && digits(dateText)].filter(Boolean).join(" · ");
  const current = stage === "deck" ? rowById(order[index]!) : null;
  const lastRow = review.rows.at(-1) ?? null;
  const addAfter = adding?.afterId ? review.rows.findIndex((r) => r.id === adding.afterId) + 1 : 0;
  // Numbers he types are written like the page's own: Bangla digits unless the page uses Latin ones.
  const sample = review.rows.map((r) => r.values.amountText).find((a) => a != null) ?? null;

  const screen = (() => {
    if (stage === "nothing") {
      return <NothingView title={pageTitle} photo={photo} backHref="/" retakeHref="/capture" onAdd={() => openAdd(lastRow?.id ?? null)} />;
    }
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
          pageLabel={[t(`pg.${ledgerType}`), dateText && digits(dateText)].filter(Boolean).join(" · ")}
          onOpenLine={(id) => {
            const known = order.indexOf(id);
            if (known < 0) {
              setOrder([...order, id]);
              setIndex(order.length);
            } else setIndex(known);
            setStage("deck");
          }}
          onPage={() => setPageOpen(true)}
          onAdd={() => openAdd(lastRow?.id ?? null)}
          onConfirm={confirm}
          onBack={() => (order.length > 0 ? setStage("deck") : setStage("reveal"))}
        />
      );
    }
    return (
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
    );
  })();

  // Done writing to storage once the page is in the khata.
  useEffect(() => {
    if (stage === "done" && landed) writeStored(runId, null);
  }, [stage, landed, runId]);

  const fixRow = fix ? rowById(fix.id) : null;
  return (
    <>
      {screen}
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
        onAdd={() => {
          setMenu(false);
          openAdd(current?.id ?? lastRow?.id ?? null);
        }}
        onPage={() => {
          setMenu(false);
          setProblem(null);
          setPageOpen(true);
        }}
        onSummary={() => {
          setMenu(false);
          setStage("summary");
        }}
        onClose={() => setMenu(false)}
      />
      <AddSheet
        open={adding != null}
        position={addAfter > 0 ? t("ad.after", addAfter) : t("ad.first")}
        sample={sample}
        busy={busy}
        notice={adding ? notice : null}
        onSave={addLine}
        onClose={() => setAdding(null)}
      />
      <PageSheet open={pageOpen} page={review.page} capturedAt={capturedAt} busy={busy} notice={pageOpen ? notice : null} onSave={savePage} onClose={() => setPageOpen(false)} />
    </>
  );
}
