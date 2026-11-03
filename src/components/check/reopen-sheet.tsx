"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Sheet } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { Review } from "./deck-model";
import type { ReopenPreview, ReopenResult, ReviewApi } from "./review-api";

type Failure = Exclude<ReopenResult, { ok: true }>["reason"];

/**
 * "Fix this page" on a page already in the khata (T5). The sheet first asks what reopening would
 * do (T4's preview, which changes nothing): how many of the page's lines leave the khata, and the
 * closed days that hold it, whose count must be done again. One tap then takes the lines out; his
 * values and answers stay, and `onReopened` gets the review as it now is, every line a draft.
 */
export function ReopenSheet({
  open,
  api,
  review,
  onReopened,
  onClose,
}: {
  open: boolean;
  api: Pick<ReviewApi, "reopenPreview" | "reopen">;
  review: Review;
  onReopened: (review: Review) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} label={t("ro.title")}>
      {open ? <ReopenBody api={api} review={review} onReopened={onReopened} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ReopenBody({ api, review, onReopened, onClose }: { api: Pick<ReviewApi, "reopenPreview" | "reopen">; review: Review; onReopened: (review: Review) => void | Promise<void>; onClose: () => void }) {
  const i18n = useI18n();
  const { t, dayMonth } = i18n;
  /** Undefined while asking; null when it couldn't be asked. */
  const [preview, setPreview] = useState<ReopenPreview | null | undefined>(undefined);
  const [asked, setAsked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let live = true;
    void api.reopenPreview(review).then((p) => {
      if (live) setPreview(p);
    });
    return () => {
      live = false;
    };
    // Asked once per opening (and on "try again"), on the review the sheet opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  async function reopen() {
    setBusy(true);
    setFailure(null);
    const res = await api.reopen(review);
    if (!res.ok) {
      setBusy(false);
      return setFailure(res.reason);
    }
    await onReopened(res.review);
    setBusy(false);
  }

  // A refusal, before or on the tap: nothing to do here but close.
  const refused = failure === "not_latest" || failure === "not_confirmed" ? failure : preview && !preview.canReopen ? (preview.reason ?? "not_confirmed") : null;
  const body = (() => {
    if (preview === undefined) {
      return (
        <p className="t-body" aria-busy="true">
          {t("ro.loading")}
        </p>
      );
    }
    if (preview === null) {
      return (
        <div className="dk-err" role="alert">
          <span>{t("ro.err.load")}</span>
          <Button
            variant="line"
            onClick={() => {
              setPreview(undefined);
              setAsked((n) => n + 1);
            }}
          >
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (refused) return <p className="t-body">{t(`ro.${refused}`)}</p>;
    return (
      <>
        <p className="t-body">{preview.records === 1 ? t("ro.body1") : t("ro.body", preview.records)}</p>
        <p className="t-body">{t("ro.kept")}</p>
        {preview.closedDays.length > 0 ? <p className="dk-panel">{t("ro.closed", preview.closedDays.map(dayMonth).join(", "))}</p> : null}
        {failure ? (
          <div className="dk-err" role="alert">
            <span>{t(failure === "busy" ? "ro.err.busy" : "ro.err.fail")}</span>
          </div>
        ) : null}
      </>
    );
  })();

  return (
    <div className="grid gap-3">
      <div className="fx-head">
        <h2 className="t-sec">{t("ro.title")}</h2>
        <button type="button" className="back" onClick={onClose} aria-label={t("close")}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      {body}
      <div className="grid gap-2 pt-1">
        {preview && !refused ? (
          <Button variant="red" wide disabled={busy} onClick={() => void reopen()}>
            {t("ro.go")}
          </Button>
        ) : null}
        <Button variant="line" wide disabled={busy} onClick={onClose}>
          {preview && !refused ? t("ro.keep") : t("close")}
        </Button>
      </div>
    </div>
  );
}
