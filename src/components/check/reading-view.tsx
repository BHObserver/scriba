"use client";

import { OrientedImage } from "@/components/photo-orientation";
import { StatusMark, TopBar } from "@/components/kit";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import type { QuarterTurns } from "@/lib/images/orientation";

export type Photo = { src: string | null; width: number; height: number; turns: QuarterTurns };

/** 0 sending, 1 reading, 2 checking, 3 all done. Each step is a real stage of the work, never a timer. */
export type ReadingStep = 0 | 1 | 2 | 3;

const STEPS: ReadonlyArray<readonly [doing: MessageKey, done: MessageKey]> = [
  ["rd.send", "rd.sent"],
  ["rd.read", "rd.readDone"],
  ["rd.check", "rd.checked"],
];

/** The photo with a scan line, then sending → reading → checking, ticked off as each really ends. */
export function ReadingView({
  photo,
  sub,
  step,
  sendLabel,
  sendProgress,
  backHref,
}: {
  photo: Photo | null;
  sub: string;
  step: ReadingStep;
  /** Replaces "sending the photo" while several pages upload. */
  sendLabel?: string;
  /** Upload progress, 0–1, shown under the sending step. */
  sendProgress?: number;
  backHref?: string;
}) {
  const { t, count } = useI18n();
  return (
    <div className="flow column">
      <TopBar title={t("rd.title")} sub={sub} backHref={backHref} />
      {photo?.src ? (
        <div className="rd-photo">
          <OrientedImage src={photo.src} alt="" turns={photo.turns} size={photo} maxHeightVh={44}>
            {step < 3 ? <div className="rd-scan" aria-hidden="true" /> : null}
          </OrientedImage>
        </div>
      ) : null}
      <ol className="rd-steps" aria-live="polite">
        {STEPS.map(([doing, done], i) => (
          <li key={doing} className={cx("rd-step", i < step && "done", i === step && "now")} aria-current={i === step ? "step" : undefined}>
            {i < step ? (
              <StatusMark kind="ok" />
            ) : i === step ? (
              <span className="mark" aria-hidden="true">
                <i className="spin" />
              </span>
            ) : (
              <span className="mark mark-wait" aria-hidden="true">
                {count(i + 1)}
              </span>
            )}
            <span>{i < step ? t(done) : i === 0 && sendLabel ? sendLabel : t(doing)}</span>
          </li>
        ))}
        {step === 0 && sendProgress != null ? (
          <li className="rd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sendProgress * 100)}>
            <i style={{ width: `${Math.round(sendProgress * 100)}%` }} />
          </li>
        ) : null}
      </ol>
      <p className="t-small pad rd-note text-center">
        {t("rd.time")}
        <br />
        {t("motto")}
      </p>
    </div>
  );
}
