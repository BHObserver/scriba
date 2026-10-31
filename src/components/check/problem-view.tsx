"use client";

import type { ReactNode } from "react";
import { OrientedImage } from "@/components/photo-orientation";
import { TopBar } from "@/components/kit";
import type { ProblemKind } from "@/components/capture/problems";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Photo } from "./reading-view";

const COPY: Record<ProblemKind, { t: MessageKey; b: MessageKey; tips?: boolean; note?: MessageKey }> = {
  unreadable: { t: "unreadable.t", b: "unreadable.b", tips: true },
  small: { t: "small.t", b: "small.b" },
  file: { t: "file.t", b: "file.b" },
  sideways: { t: "side.t", b: "side.b" },
  offline: { t: "offline.t", b: "offline.b", note: "offline.note" },
  sendFailed: { t: "sendFailed.t", b: "sendFailed.b" },
  failed: { t: "failed.t", b: "failed.b" },
  busy: { t: "busy.t", b: "busy.b" },
  waiting: { t: "waiting.t", b: "waiting.b" },
  notAllowed: { t: "notAllowed.t", b: "notAllowed.b" },
};

/**
 * One problem screen (D4 `ProblemScreen`): optional photo, a turmeric-soft panel that says what
 * happened in plain words, tips where they help, and the caller's actions (primary first).
 * `kept` says the photo is safely stored; only say it when the upload really succeeded.
 */
export function ProblemView({
  kind,
  title,
  photo,
  kept,
  onBack,
  backHref,
  children,
}: {
  kind: ProblemKind;
  title: string;
  photo?: Photo | null;
  kept: boolean;
  onBack?: () => void;
  backHref?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const copy = COPY[kind];
  return (
    <div className="flow column">
      <TopBar title={title} onBack={onBack} backHref={backHref} />
      <div className="pad pb-main">
        {photo?.src ? (
          <div className="pb-photo">
            <OrientedImage src={photo.src} alt="" turns={photo.turns} size={photo} />
          </div>
        ) : null}
        <section className="pb-panel" role="alert">
          <h2 className="t-sec">{t(copy.t)}</h2>
          <p className="t-body">{t(copy.b)}</p>
          {kept ? <span className="t-small pb-kept">{t("prob.kept")}</span> : null}
        </section>
        {copy.tips ? (
          <section className="pb-tips">
            <span className="t-label">{t("prob.tips")}</span>
            <ul>
              <li>{t("tip.light")}</li>
              <li>{t("tip.fill")}</li>
              <li>{t("tip.still")}</li>
            </ul>
          </section>
        ) : null}
        {copy.note ? <p className="t-small">{t(copy.note)}</p> : null}
      </div>
      <div className="pad pb-acts">{children}</div>
    </div>
  );
}
