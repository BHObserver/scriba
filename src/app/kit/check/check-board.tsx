"use client";

import type { ProblemKind } from "@/components/capture/problems";
import { CaptureScreen } from "@/components/capture/capture-screen";
import { ReadingQueueProvider } from "@/components/capture/reading-queue";
import { CheckScreen } from "@/components/check/check-screen";
import { type Photo, ReadingView } from "@/components/check/reading-view";
import { localReviewApi } from "@/components/check/review-api";
import { useI18n } from "@/lib/i18n/client";
import type { PageState, ReviewRow } from "@/lib/review/state";

export type Fixture = { photo: Photo; page: PageState; rows: ReviewRow[]; source: string };

const DOC = "00000000-0000-4000-8000-000000000000";
const API = localReviewApi();

/** Renders one step of the real screens on fixture data. Buttons that would upload or read are live: don't press them. */
export function CheckBoard({ step, fixture }: { step: string; fixture: Fixture }) {
  const { t } = useI18n();
  const common = { documentId: DOC, photo: fixture.photo, readTurns: fixture.photo.turns, pageNumber: 1, pageCount: 2, detailsHref: "/kit", nextHref: null, api: API, capturedAt: "2026-10-31T09:30:00Z" };
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
