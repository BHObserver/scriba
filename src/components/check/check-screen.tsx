"use client";

import { RotateCcw, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OrientedImage } from "@/components/photo-orientation";
import { Button, ButtonLink, TopBar } from "@/components/kit";
import { type ProblemKind, RETRYABLE, type Reading } from "@/components/capture/problems";
import { useReadingQueue } from "@/components/capture/reading-queue";
import { useI18n } from "@/lib/i18n/client";
import type { QuarterTurns } from "@/lib/images/orientation";
import type { QuestionSet } from "@/lib/questions/types";
import type { PageState, ReviewRow } from "@/lib/review/state";
import { type AskApi, httpAskApi } from "./ask-api";
import { isBlockReading } from "./ask-model";
import { AskSession } from "./ask-session";
import { ProblemView } from "./problem-view";
import { type Photo, ReadingView } from "./reading-view";
import { type ReviewApi, httpReviewApi } from "./review-api";
import { ReviewSession } from "./review-session";

/** How often a page that is being read elsewhere (a reload, another tab) asks the server again. */
const POLL_MS = 4000;
/** The checking step stays on screen this long once the reading lands, so it can be read. */
const CHECK_STEP_MS = 700;

type Props = {
  documentId: string;
  photo: Photo;
  /** The latest successful reading's review state; null until the page has been read. */
  review: { runId: string; page: PageState; rows: ReviewRow[] } | null;
  /** For a reading with blocks: Scriba's questions and the photo's day (the ask deck). Null: the line deck. */
  asks?: { set: QuestionSet; capturedOn: string | null } | null;
  /** The stored run's state when there is no review: being read, or a problem. Null: never read. */
  serverReading: Reading | null;
  /** When the photo was taken (ISO): the page's day when its written date can't be read. */
  capturedAt: string;
  /** Orientation to use when the page is read (again). */
  readTurns: QuarterTurns;
  pageNumber: number;
  pageCount: number;
  nextHref: string | null;
  /** Where back goes: the screen that opened the page (History, Close the day), else Today. */
  backHref: string;
  /** The details page: run history and the full review workspace. */
  detailsHref: string;
  /** Development only: the dev board saves and confirms in memory. */
  api?: ReviewApi;
  /** Development only: the dev board answers in memory. */
  askApi?: AskApi;
};

/**
 * `/check/[documentId]` part 1: honest reading steps, then the reveal. A reading this session
 * started (on /capture, or "try again" here) comes from the reading queue; otherwise the stored
 * run decides. Opening this screen never sends a page to be read: only a tap does.
 */
export function CheckScreen({ documentId, photo, review, asks, serverReading, capturedAt, readTurns, pageNumber, pageCount, nextHref, backHref, detailsHref, api, askApi }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { readings, read, forget } = useReadingQueue();
  const queued = readings.get(documentId) ?? null;
  const reading = review ? null : (queued ?? serverReading);

  // Arriving at a page that is already read goes straight to the reveal; watching it being read
  // shows the checking step first, while the validator runs over the new lines.
  const [readOnArrival] = useState(review != null);
  const [checkShown, setCheckShown] = useState(false);
  const [turns, setTurns] = useState<QuarterTurns>(readTurns);

  const landed = !review && queued?.phase === "done";
  useEffect(() => {
    if (landed) router.refresh();
  }, [landed, router]);

  const polling = !review && reading?.phase === "server";
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [polling, router]);

  useEffect(() => {
    if (!review || readOnArrival || checkShown) return;
    const id = setTimeout(() => setCheckShown(true), CHECK_STEP_MS);
    return () => clearTimeout(id);
  }, [review, readOnArrival, checkShown]);

  const pageTitle = t("kh.page", pageNumber);
  const readingSub = t("rd.pageOf", pageNumber, pageCount);
  const readAgain = (withTurns: QuarterTurns) => read([{ documentId, turns: withTurns }]);
  // Before the server has a run, the queue knows which way the page was sent.
  const sentPhoto = !review && queued ? { ...photo, turns: queued.turns } : photo;

  if (review && (readOnArrival || checkShown)) {
    if (asks && isBlockReading(review.page.values) && review.rows.some((r) => r.status !== "rejected")) {
      return (
        <AskSession
          api={askApi ?? httpAskApi(review.runId)}
          runId={review.runId}
          initial={{ page: review.page, rows: review.rows }}
          initialSet={asks.set}
          photo={photo}
          pageTitle={pageTitle}
          capturedOn={asks.capturedOn}
          pageNumber={pageNumber}
          nextHref={nextHref}
          backHref={backHref}
        />
      );
    }
    return (
      <ReviewSession
        api={api ?? httpReviewApi(review.runId)}
        runId={review.runId}
        initial={{ page: review.page, rows: review.rows }}
        photo={photo}
        pageTitle={pageTitle}
        capturedAt={capturedAt}
        pageNumber={pageNumber}
        nextHref={nextHref}
        backHref={backHref}
        detailsHref={detailsHref}
      />
    );
  }
  if (review || reading?.phase === "done") return <ReadingView photo={sentPhoto} sub={readingSub} step={2} backHref={backHref} />;
  if (reading?.phase === "reading" || reading?.phase === "server") return <ReadingView photo={sentPhoto} sub={readingSub} step={1} backHref={backHref} />;

  if (reading?.phase === "problem") {
    return (
      <ProblemView kind={reading.problem} title={pageTitle} photo={sentPhoto} kept backHref={backHref}>
        <ProblemActions
          kind={reading.problem}
          detailsHref={detailsHref}
          onRetry={() => readAgain(queued?.turns ?? readTurns)}
          onCheckAgain={() => {
            forget(documentId);
            router.refresh();
          }}
        />
      </ProblemView>
    );
  }

  // Never read: the photo is stored but nothing has been sent. Turn it upright, then one tap reads it.
  return (
    <div className="flow column">
      <TopBar title={pageTitle} backHref={backHref} />
      <div className="pad pb-main">
        {photo.src ? (
          <div className="rd-photo">
            <OrientedImage src={photo.src} alt="" turns={turns} size={photo} maxHeightVh={44} />
          </div>
        ) : null}
        <div className="flex justify-center gap-3">
          <Button variant="line" onClick={() => setTurns(((turns + 3) % 4) as QuarterTurns)}>
            <RotateCcw size={20} aria-hidden="true" />
            {t("turn.left")}
          </Button>
          <Button variant="line" onClick={() => setTurns(((turns + 1) % 4) as QuarterTurns)}>
            <RotateCw size={20} aria-hidden="true" />
            {t("turn.right")}
          </Button>
        </div>
        <section className="grid gap-2">
          <h2 className="t-sec">{t("unread.t")}</h2>
          <p className="t-body">{t("unread.b")}</p>
        </section>
      </div>
      <div className="pad pb-acts">
        <Button variant="red" wide onClick={() => readAgain(turns)}>
          {t("cap.read")}
        </Button>
      </div>
    </div>
  );
}

function ProblemActions({ kind, detailsHref, onRetry, onCheckAgain }: { kind: ProblemKind; detailsHref: string; onRetry: () => void; onCheckAgain: () => void }) {
  const { t } = useI18n();
  const details = (
    <ButtonLink href={detailsHref} variant="ghost" wide>
      {t("details")}
    </ButtonLink>
  );
  if (RETRYABLE.has(kind)) {
    return (
      <>
        <Button variant="red" wide onClick={onRetry}>
          {t("retry")}
        </Button>
        {details}
      </>
    );
  }
  switch (kind) {
    case "waiting":
      // Never re-read silently: Meta may still be answering the last request.
      return (
        <>
          <Button variant="red" wide onClick={onCheckAgain}>
            {t("waiting.cta")}
          </Button>
          {details}
        </>
      );
    case "notAllowed":
      return (
        <ButtonLink href={detailsHref} variant="line" wide>
          {t("details")}
        </ButtonLink>
      );
    default:
      return (
        <>
          <ButtonLink href="/capture" variant="red" wide>
            {t("retake")}
          </ButtonLink>
          {details}
        </>
      );
  }
}
