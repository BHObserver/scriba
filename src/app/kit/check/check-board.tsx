"use client";

import { useMemo } from "react";
import type { ProblemKind } from "@/components/capture/problems";
import { CaptureScreen } from "@/components/capture/capture-screen";
import { ReadingQueueProvider } from "@/components/capture/reading-queue";
import { CheckScreen } from "@/components/check/check-screen";
import { type Photo, ReadingView } from "@/components/check/reading-view";
import { localAskApi } from "@/components/check/ask-api";
import { localReviewApi } from "@/components/check/review-api";
import type { NormalizedDoubt } from "@/lib/extraction/parse";
import { useI18n } from "@/lib/i18n/client";
import { buildQuestions } from "@/lib/questions/engine";
import type { KnownParty } from "@/lib/questions/types";
import type { PageState, ReviewRow } from "@/lib/review/state";

export type Fixture = { photo: Photo; page: PageState; rows: ReviewRow[]; doubts: NormalizedDoubt[]; source: string };

const DOC = "00000000-0000-4000-8000-000000000000";
const API = localReviewApi();
/** A pretend book for the ask deck: Pran is already in it (written in English), owed ৳2,800. */
const PARTIES: KnownParty[] = [{ id: "demo-pran", kind: "supplier", name: "Pran", key: "pran" }];
const DUES = new Map([["demo-pran", 280000]]);
const CAPTURED_ON = "2026-11-01";

/** Renders one step of the real screens on fixture data. Buttons that would upload or read are live: don't press them. */
export function CheckBoard({ step, fixture }: { step: string; fixture: Fixture }) {
  const { t } = useI18n();
  const ask = useMemo(() => {
    const base = { doubts: fixture.doubts, parties: PARTIES, capturedOn: CAPTURED_ON, dues: DUES };
    return { api: localAskApi(base), set: buildQuestions({ ...base, page: fixture.page.values, rows: fixture.rows }) };
  }, [fixture]);
  const common = { documentId: DOC, photo: fixture.photo, readTurns: fixture.photo.turns, pageNumber: 1, pageCount: 2, detailsHref: "/kit", nextHref: null, backHref: "/kit", api: API, capturedAt: "2026-10-31T09:30:00Z" };
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
        return <CheckScreen {...common} askApi={ask.api} asks={{ set: ask.set, capturedOn: CAPTURED_ON }} review={{ runId: DOC, page: fixture.page, rows: fixture.rows }} serverReading={null} />;
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
