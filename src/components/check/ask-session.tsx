"use client";

import { useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import { pageBlocks } from "@/lib/ledger/blocks";
import type { TransactionType } from "@/lib/ledger/types";
import type { Answer, Question, QuestionSet } from "@/lib/questions/types";
import { ackFingerprint, assessEntry } from "@/lib/review/approval";
import { FIELD_TO_VALUE_KEY } from "@/lib/review/values";
import { voiceSupported } from "@/lib/voice/recorder";
import type { AskApi } from "./ask-api";
import { AskFrame, PricesCard, QuestionCard, RestCard, StampCard, draftPoisha } from "./ask-cards";
import { type AskItem, acceptAnswered, acceptRest, blockDone, blockFigures, blockLines, blockTone, deckItems, deckSet, itemKey, questionCounts } from "./ask-model";
import { Kicker } from "./ask-parts";
import { AskSheet, type AskSheetTarget, LinesSheet } from "./ask-sheet";
import { DeckFrame, OverviewView, PageSealView } from "./ask-views";
import { type Acceptances, type Review, acceptanceFor, cardStatus, checkReview, confirmEntries, linesLeft, restoreAcceptances, storedAcceptances, typedText } from "./deck-model";
import { FixSheet, type FixField, TypeSheet } from "./deck-sheets";
import { LineActions, LineCard } from "./deck-view";
import type { Photo } from "./reading-view";
import type { LinePatch } from "./review-api";
import { lineSentences } from "./sentences";

type Stage = "overview" | "deck" | "page" | "done";
type Problem = "save" | "conflict" | "stale" | "bad" | "some" | "fail";

/** The card leaves right in this long before the next one rises in (D5). */
const LEAVE_MS = 240;
const noSubscribe = () => () => {};

const without = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)) as Record<string, T>;

/** Acceptances live in this tab's session storage, as in the line deck (`review-session.tsx`). */
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
    // Storage full or blocked: acceptances last as long as the page.
  }
}

/**
 * One page with blocks from the overview to the khata (B7, DESIGN_SPEC D5): the block overview,
 * the "Scriba asks" deck, the page seal. Answers are saved at once through `api.answer` (the
 * server works the question out again and saves its changes as review edits); a line edited by
 * hand asks the questions again. Lines are accepted here and confirmed through the review API,
 * whose approval rules re-check everything, as in the line deck.
 */
export function AskSession({
  api,
  runId,
  initial,
  initialSet,
  photo,
  pageTitle,
  capturedOn,
  pageNumber,
  nextHref,
  backHref,
}: {
  api: AskApi;
  runId: string;
  initial: Review;
  initialSet: QuestionSet;
  photo: Photo;
  pageTitle: string;
  /** The photo's day (YYYY-MM-DD, Bangladesh): the date tile on "no date on the page". */
  capturedOn: string | null;
  pageNumber: number;
  nextHref: string | null;
  backHref: string;
}) {
  const i18n = useI18n();
  const { t, digits } = i18n;
  const reduce = useReducedMotion();
  const router = useRouter();
  const voice = useSyncExternalStore(noSubscribe, voiceSupported, () => false);
  const [review, setReview] = useState(initial);
  const [set, setSet] = useState(initialSet);
  const [acceptances, setAcceptances] = useState<Acceptances>({});
  /** Stamps already shown, by item key. */
  const [seen, setSeen] = useState<string[]>([]);
  /** Cards gone through in this visit, for the progress segments. */
  const [passed, setPassed] = useState<Array<{ key: string; block: string | null }>>([]);
  const alreadyIn = initial.rows.some((r) => r.status === "confirmed") && initial.rows.every((r) => r.status !== "draft");
  const [stage, setStage] = useState<Stage>(alreadyIn ? "done" : "overview");
  const [landed, setLanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sheet, setSheet] = useState<AskSheetTarget | null>(null);
  const [fix, setFix] = useState<{ id: string; field: FixField } | null>(null);
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  /** Prices typed on the prices card, by line, until "Save the prices". */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** "Answer them now": the questions put off for later come back into the deck… */
  const [revisit, setRevisit] = useState(false);
  /** …except those put off again on this pass. */
  const [skipped, setSkipped] = useState<string[]>([]);
  /** The deck has started: from then on acceptances are kept in session storage. */
  const [started, setStarted] = useState(false);

  const { findings, entries } = useMemo(() => checkReview(review), [review]);
  const blocks = pageBlocks(review.page.values);
  const blockOf = (id: string | null) => blocks.find((b) => b.id === id) ?? null;
  const rowById = (id: string) => review.rows.find((r) => r.id === id)!;
  const groups = blockLines(review);
  // The page's parts as tinted regions: round every line the reading put in the part, even one since replaced.
  const regions = blocks.map((block) => ({ block, rows: review.rows.filter((r) => r.values.block === block.id) }));
  const asking = deckSet(set, revisit, skipped);
  const items = deckItems(review, asking, acceptances, new Set(seen));
  const item = items[0] ?? null;
  const view: Stage = stage === "deck" && !item ? "page" : stage;
  const questionById = (id: string) => [...asking.questions, ...asking.later].find((q) => q.id === id);
  // Numbers he types are written like the page's own: Bangla digits unless the page uses Latin ones.
  const sample = review.rows.map((r) => r.values.amountText).find((a) => a != null) ?? null;

  // Written only once the deck has started, so the empty set before that never overwrites what was kept.
  useEffect(() => {
    if (started) writeStored(runId, storedAcceptances(review, acceptances));
  }, [started, runId, review, acceptances]);
  useEffect(() => {
    if (stage === "done" && landed) writeStored(runId, null);
  }, [stage, landed, runId]);

  function begin() {
    if (!started && !review.page.reviewStartedAt) api.markStarted();
    setStarted(true);
  }

  function start() {
    const fresh = !started;
    begin();
    if (fresh) setAcceptances({ ...restoreAcceptances(review, readStored(runId)), ...acceptances });
    setProblem(null);
    setStage("deck");
  }

  /** The card leaves right, then the state moves on and the next card rises in. */
  function advance(apply: () => void) {
    if (reduce) return apply();
    setLeaving(true);
    setTimeout(() => {
      apply();
      setLeaving(false);
    }, LEAVE_MS);
  }
  const pass = (done: AskItem | null) => {
    if (done) setPassed((p) => [...p, { key: itemKey(done), block: done.block }]);
  };

  const failure = (reason: "stale" | "bad_value" | "failed"): Problem => (reason === "stale" ? "stale" : reason === "bad_value" ? "bad" : "save");

  async function answer(q: Question, a: Answer) {
    const current = item;
    // Put off again while answering the later ones: it stays aside, nothing to save.
    if (revisit && "option" in a && q.options.find((o) => o.id === a.option)?.later && set.later.some((x) => x.id === q.id)) {
      setSheet(null);
      return advance(() => {
        setSkipped((s) => [...s, q.id]);
        pass(current);
      });
    }
    setBusy(true);
    setProblem(null);
    const res = await api.answer(review, q.id, q.fp, a);
    setBusy(false);
    if (!res.ok) return setProblem(failure(res.reason));
    begin();
    setSheet(null);
    const acc = acceptAnswered(res.review, q, acceptances);
    advance(() => {
      setReview(res.review);
      setSet(res.set);
      setAcceptances(acc);
      pass(current);
    });
  }

  /** One answer per question, in order, each on the state the last one left. */
  async function answerEach(ids: readonly string[], answerOf: (q: Question) => Answer | null) {
    const current = item;
    let r = review;
    let s = set;
    let acc = acceptances;
    let failed: Problem | null = null;
    setBusy(true);
    setProblem(null);
    for (const id of ids) {
      const q = [...s.questions, ...s.later].find((x) => x.id === id);
      const a = q ? answerOf(q) : null;
      if (!q || !a) continue;
      const res = await api.answer(r, q.id, q.fp, a);
      if (!res.ok) {
        failed = failure(res.reason);
        break;
      }
      r = res.review;
      s = res.set;
      acc = acceptAnswered(r, q, acc);
    }
    setBusy(false);
    begin();
    const apply = () => {
      setReview(r);
      setSet(s);
      setAcceptances(acc);
    };
    if (failed) {
      apply();
      return setProblem(failed);
    }
    advance(() => {
      apply();
      setDrafts({});
      pass(current);
    });
  }

  const savePrices = (ids: readonly string[]) =>
    answerEach(ids, (q) => {
      const typed = q.entry ? drafts[q.entry] : undefined;
      return typed && draftPoisha(typed) != null ? { value: typedText(typed, sample) } : null;
    });

  function pricesLater(ids: readonly string[]) {
    if (revisit) {
      const current = item;
      return advance(() => {
        setSkipped((s) => [...s, ...ids]);
        pass(current);
      });
    }
    void answerEach(ids, (q) => {
      const later = q.options.find((o) => o.later);
      return later ? { option: later.id } : null;
    });
  }

  /** A line changed by hand: saved at once, its acceptance taken back, and the questions asked again. */
  async function change(id: string, patch: LinePatch) {
    setBusy(true);
    setProblem(null);
    const res = await api.saveLine(rowById(id), patch);
    if (!res.ok) {
      setBusy(false);
      return setProblem(res.reason === "conflict" ? "conflict" : "save");
    }
    begin();
    const next: Review = { ...review, rows: review.rows.map((r) => (r.id === id ? { ...r, ...res.line } : r)) };
    const fresh = await api.questions(next);
    setBusy(false);
    setReview(next);
    if (fresh) setSet(fresh);
    setAcceptances((a) => without(a, id));
  }

  const lineActions = {
    accept(id: string) {
      const current = item;
      const acc = { ...acceptances, [id]: acceptanceFor(entries.get(id)!, findings, "ok") };
      advance(() => {
        setAcceptances(acc);
        pass(current);
      });
    },
    async asWritten(id: string) {
      const row = rowById(id);
      const current = item;
      if (row.reviewFields.length === 0) {
        const acc = { ...acceptances, [id]: acceptanceFor(entries.get(id)!, findings, "asWritten") };
        return advance(() => {
          setAcceptances(acc);
          pass(current);
        });
      }
      // As in the line deck: the doubted number is checked now; a problem he hasn't seen keeps the card.
      const shown = new Set(assessEntry(entries.get(id)!, findings).needsAck.filter((f) => f.ruleId !== "model_uncertainty").map(ackFingerprint));
      setBusy(true);
      const res = await api.saveLine(row, { markChecked: row.reviewFields });
      setBusy(false);
      if (!res.ok) return setProblem(res.reason === "conflict" ? "conflict" : "save");
      const next: Review = { ...review, rows: review.rows.map((r) => (r.id === id ? { ...r, ...res.line } : r)) };
      const checked = checkReview(next);
      const acceptance = acceptanceFor(checked.entries.get(id)!, checked.findings, "asWritten");
      setReview(next);
      if (!acceptance.acks.findings.every((fp) => shown.has(fp))) return;
      const acc = { ...acceptances, [id]: acceptance };
      advance(() => {
        setAcceptances(acc);
        pass(current);
      });
    },
    openFix: (id: string, field: FixField) => setFix({ id, field }),
    openType: (id: string) => setTypeFor(id),
    remove: (id: string) => void change(id, { status: "rejected" }),
    restore: (id: string) => void change(id, { status: "draft" }),
    notCrossed: (id: string) => void change(id, { values: { ...rowById(id).values, crossedOut: false } }),
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

  /** The questions put off for later come back, and their blocks get their stamp card again. */
  function answerLater() {
    const blocksLater = new Set(set.later.map((q) => q.block));
    setSeen((s) => s.filter((k) => !blocksLater.has(k.replace(/^stamp:/, ""))));
    setSkipped([]);
    setRevisit(true);
    setProblem(null);
    setStage("deck");
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
      return setProblem(res.reason === "notReady" ? "some" : res.reason === "conflict" ? "conflict" : "fail");
    }
    const sent = new Set(body.map((e) => e.id));
    setReview({ ...review, rows: review.rows.map((r) => (sent.has(r.id) ? { ...r, status: "confirmed" } : r)) });
    setLanded(true);
    setStage("done");
  }

  const notice = problem ? (
    <div className="dk-err" role="alert">
      <span>
        {t(
          (
            {
              save: "dk.err.save",
              conflict: "dk.err.conflict",
              stale: "asks.err.stale",
              bad: "asks.err.bad",
              some: "sl.err.some",
              fail: "sl.err.fail",
            } as const
          )[problem],
        )}
      </span>
      {problem === "conflict" || problem === "stale" ? (
        <Button variant="line" onClick={() => window.location.reload()}>
          {t("dk.reload")}
        </Button>
      ) : null}
    </div>
  ) : null;

  const { accountName, dateText } = review.page.values;
  const details = [accountName, dateText && digits(dateText)].filter(Boolean).join(" · ");
  const sub = [pageTitle, details].filter(Boolean).join(" · ");

  const screen = (() => {
    if (view === "overview") {
      const counts = questionCounts(set);
      return <OverviewView photo={photo} groups={groups} regions={regions} counts={counts} pageQuestions={counts.get(null) ?? 0} sub={sub} backHref={backHref} onStart={start} />;
    }
    if (view === "page" || view === "done") {
      const gap = groups.some((g) => {
        const f = g.block ? blockFigures(g.block, g.rows) : null;
        return f?.kind === "account" && f.now == null;
      });
      return (
        <PageSealView
          photo={photo}
          groups={groups}
          regions={regions}
          sealed={set.later.length === 0 && linesLeft(review, acceptances) === 0 && !gap}
          land={view === "done" ? landed : true}
          later={set.later.length}
          canConfirm={confirmEntries(review, acceptances).length > 0}
          busy={busy}
          done={view === "done"}
          notice={notice}
          sub={details}
          pageNumber={pageNumber}
          nextHref={nextHref}
          onBack={() => (view === "done" ? router.push(backHref) : setStage("overview"))}
          onLater={answerLater}
          onConfirm={confirm}
        />
      );
    }

    const toneOf = (id: string | null) => blockTone(blockOf(id));
    const segments = [...passed.map((p) => ({ key: p.key, tone: toneOf(p.block), done: true })), ...items.map((it) => ({ key: itemKey(it), tone: toneOf(it.block), done: false }))];
    const cardBusy = busy || leaving;
    const card = (() => {
      if (!item) return null;
      const block = item.block ? blockOf(item.block) : null;
      const blockRows = groups.find((g) => (g.block?.id ?? null) === item.block)?.rows ?? [];
      switch (item.kind) {
        case "question": {
          const q = questionById(item.id);
          if (!q) return null;
          const proposed = q.proposed;
          return (
            <AskFrame swipe={proposed != null && !cardBusy} onSwipe={() => proposed && void answer(q, { option: proposed })} leaving={leaving}>
              <QuestionCard
                q={q}
                block={block}
                rows={review.rows}
                photo={photo}
                capturedOn={capturedOn}
                busy={cardBusy}
                voice={voice}
                actions={{
                  answer: (question, option) => void answer(question, { option }),
                  open: (question, options, listen) => setSheet({ kind: "answer", question, options, listen }),
                  lines: (ids) => setLines(ids),
                }}
              />
            </AskFrame>
          );
        }
        case "prices": {
          const qs = item.ids.map(questionById).filter((q): q is Question => q != null);
          if (qs.length === 0) return null;
          return (
            <AskFrame swipe={false} onSwipe={() => {}} leaving={leaving}>
              <PricesCard
                questions={qs}
                block={block}
                rows={blockRows}
                photo={photo}
                drafts={drafts}
                busy={cardBusy}
                onSlot={(question, row) => setSheet({ kind: "price", question, row, start: drafts[row.id] ?? "", listen: false })}
                onSave={() => void savePrices(item.ids)}
                onLater={() => pricesLater(item.ids)}
              />
            </AskFrame>
          );
        }
        case "line": {
          const row = rowById(item.id);
          const status = cardStatus(row, entries.get(row.id), findings, acceptances[row.id]);
          return (
            <AskFrame swipe={false} onSwipe={() => {}} leaving={leaving}>
              <Kicker block={block} />
              <p className="as-q sm">{t("asks.line.title")}</p>
              <div className="as-line">
                <LineCard row={row} rows={review.rows} findings={findings} status={status} photo={photo} lineNo={review.rows.indexOf(row) + 1} onTap={(f) => lineActions.openFix(row.id, f)} />
              </div>
              <div className="as-acts">
                <LineActions row={row} entry={entries.get(row.id)} findings={findings} status={status} busy={cardBusy} actions={lineActions} stack={i18n.locale === "en"} />
              </div>
            </AskFrame>
          );
        }
        case "rest": {
          const asked = passed.some((p) => p.block === item.block && (p.key.startsWith("question:") || p.key.startsWith("prices:")));
          const accept = () => {
            const current = item;
            const acc = acceptRest(review, item.ids, acceptances);
            advance(() => {
              setAcceptances(acc);
              pass(current);
            });
          };
          return (
            <AskFrame swipe={!cardBusy} onSwipe={accept} leaving={leaving}>
              <RestCard ids={item.ids} other={asked} block={block} rows={review.rows} photo={photo} busy={cardBusy} onFix={(id) => setFix({ id, field: rowById(id).values.amountText == null && rowById(id).values.balanceText != null ? "balance" : "amount" })} onAll={accept} />
            </AskFrame>
          );
        }
        case "stamp": {
          if (!block) return null;
          const current = item;
          return (
            <AskFrame swipe={false} onSwipe={() => {}} leaving={leaving}>
              <StampCard
                block={block}
                rows={blockRows}
                done={blockDone(review, set, acceptances, block.id)}
                later={set.later.filter((q) => q.block === block.id).length}
                last={items.length === 1}
                onNext={() =>
                  advance(() => {
                    setSeen((s) => [...s, itemKey(current)]);
                    pass(current);
                  })
                }
              />
            </AskFrame>
          );
        }
      }
    })();
    return (
      <DeckFrame segments={segments} now={passed.length} notice={notice} onBack={() => setStage("overview")}>
        {item ? <div key={itemKey(item)} className="contents">{card}</div> : null}
      </DeckFrame>
    );
  })();

  const fixRow = fix ? rowById(fix.id) : null;
  return (
    <>
      {screen}
      <AskSheet
        target={sheet}
        photo={photo}
        busy={busy}
        onAnswer={(q, a) => void answer(q, a)}
        onPrice={(rowId, typed) => {
          setDrafts((d) => ({ ...d, [rowId]: typed }));
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <LinesSheet
        rows={lines ? lines.map((id) => review.rows.find((r) => r.id === id)).filter((r) => r != null) : null}
        photo={photo}
        onFix={(id) => {
          setLines(null);
          setFix({ id, field: "amount" });
        }}
        onClose={() => setLines(null)}
      />
      <FixSheet target={fixRow && fix ? { row: fixRow, field: fix.field } : null} photo={photo} hint={fixRow ? lineSentences(i18n, fixRow, review.rows, findings).hint : null} busy={busy} onSave={saveFix} onClose={() => setFix(null)} />
      <TypeSheet row={typeFor ? rowById(typeFor) : null} busy={busy} onPick={pickType} onClose={() => setTypeFor(null)} />
    </>
  );
}
