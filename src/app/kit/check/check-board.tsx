"use client";

import { useMemo } from "react";
import type { ProblemKind } from "@/components/capture/problems";
import { CaptureScreen } from "@/components/capture/capture-screen";
import { ReadingQueueProvider } from "@/components/capture/reading-queue";
import { CheckScreen } from "@/components/check/check-screen";
import { type Photo, ReadingView } from "@/components/check/reading-view";
import { localAskApi } from "@/components/check/ask-api";
import type { MemoView } from "@/components/check/ask-memo";
import { localReviewApi } from "@/components/check/review-api";
import type { NormalizedDoubt } from "@/lib/extraction/parse";
import { useI18n } from "@/lib/i18n/client";
import type { MemoForPage } from "@/lib/memo/match";
import { buildQuestions } from "@/lib/questions/engine";
import type { KnownParty } from "@/lib/questions/types";
import type { PageState, ReviewRow } from "@/lib/review/state";

export type Fixture = {
  photo: Photo;
  page: PageState;
  rows: ReviewRow[];
  doubts: NormalizedDoubt[];
  source: string;
  /** A pretend khata of its own (T3): the parties in it and their dues (party id, poisha) just before the page. */
  book?: { parties: KnownParty[]; dues: Array<[string, number]> };
};
/** A company memo's stored reading (U4): what the engine reads, and what the card shows. */
export type KitMemo = { memo: MemoForPage; view: MemoView };

const DOC = "00000000-0000-4000-8000-000000000000";
/** A pretend book for the ask deck: Pran is already in it (written in English), owed ৳2,800. */
const PARTIES: KnownParty[] = [{ id: "demo-pran", kind: "supplier", name: "Pran", key: "pran" }];
const DUES = new Map([["demo-pran", 280000]]);
const CAPTURED_ON = "2026-11-01";

/**
 * Renders one step of the real screens on fixture data. Buttons that would upload or read are live: don't press them.
 * `closed`: "Fix this page" (T5) warns that the photo's day is closed.
 */
export function CheckBoard({ step, fixture, memos, closed = false }: { step: string; fixture: Fixture; memos: KitMemo[]; closed?: boolean }) {
  const { t } = useI18n();
  const lines = useMemo(() => localReviewApi({ closedDays: closed ? [CAPTURED_ON] : [] }), [closed]);
  const ask = useMemo(() => {
    const book = fixture.book ? { parties: fixture.book.parties, dues: new Map(fixture.book.dues) } : { parties: PARTIES, dues: DUES };
    const base = { doubts: fixture.doubts, parties: book.parties, capturedOn: CAPTURED_ON, dues: book.dues, ...(memos.length > 0 ? { memos: memos.map((m) => m.memo) } : {}) };
    return { api: localAskApi(base, lines), set: buildQuestions({ ...base, page: fixture.page.values, rows: fixture.rows }) };
  }, [fixture, memos, lines]);
  const common = { documentId: DOC, photo: fixture.photo, readTurns: fixture.photo.turns, pageNumber: 1, pageCount: 2, detailsHref: "/kit", nextHref: null, backHref: "/kit", api: lines, capturedAt: "2026-10-31T09:30:00Z" };
  const body = (() => {
    switch (step) {
      case "capture":
        return <CaptureScreen userId="preview" maxUploadBytes={8 * 1024 * 1024} />;
      case "sending":
        return <ReadingView photo={fixture.photo} sub={t("rd.pageOf", 1, 2)} step={0} sendLabel={t("rd.sendN", 1, 2)} sendProgress={0.42} />;
      case "reading":
        return <ReadingView photo={fixture.photo} sub={t("rd.pageOf", 1, 2)} step={1} backHref="/kit/check" />;
      case "checking":
        return <ReadingView photo={fixture.photo} sub={t("rd.pageOf", 1, 2)} step={2} backHref="/kit/check" />;
      case "reveal":
        return <CheckScreen {...common} nextHref="/kit/check?step=unread" review={{ runId: DOC, page: fixture.page, rows: fixture.rows }} serverReading={null} />;
      case "asks":
        return <CheckScreen {...common} askApi={ask.api} asks={{ set: ask.set, capturedOn: CAPTURED_ON, memos: memos.map((m) => m.view) }} review={{ runId: DOC, page: fixture.page, rows: fixture.rows }} serverReading={null} />;
      case "nothing":
        return <CheckScreen {...common} review={{ runId: DOC, page: fixture.page, rows: [] }} serverReading={null} />;
      case "unread":
        return <CheckScreen {...common} review={null} serverReading={null} />;
      default: {
        const problem = step.replace(/^problem-/, "") as ProblemKind;
        return <CheckScreen {...common} review={null} serverReading={{ phase: "problem", problem }} />;
      }
    }
  })();
  return <ReadingQueueProvider>{body}</ReadingQueueProvider>;
}
