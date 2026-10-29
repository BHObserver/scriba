"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OrientationControls, useOrientation } from "@/components/photo-orientation";
import { Button, Notice } from "@/components/ui";
import { processingModeForTurns } from "@/lib/images/orientation";

type Props = {
  documentId: string;
  hasSuccessfulRun: boolean;
  lastRunFailed: { status: string; message: string | null } | null;
};

/**
 * The explicit, paid "Analyze handwriting" action.
 * - A request id is created once per deliberate click and reused if the same
 *   click's request has to be re-sent, so the server can de-duplicate it.
 * - The button is disabled while a request is in flight.
 * - Re-analysis of an already analyzed photo requires an explicit confirmation.
 * - Nothing here retries automatically.
 * - The chosen orientation is sent as the processing mode; the server turns a copy.
 */
export function AnalyzePanel({ documentId, hasSuccessfulRun, lastRunFailed }: Props) {
  const router = useRouter();
  const { turns } = useOrientation();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warn" | "fail" | "pass"; text: string } | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);

  async function analyze(mode: "use_cache" | "fresh") {
    if (inFlight.current) return; // guards against double clicks before re-render
    inFlight.current = true;
    setBusy(true);
    setMessage({ tone: "info", text: "Sending one request to Meta. This can take up to a minute for a full page…" });
    const requestId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/documents/${documentId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, mode, processingMode: processingModeForTurns(turns) }),
      });
      const body = await res.json().catch(() => ({}));
      switch (body.kind) {
        case "completed":
          setMessage({ tone: "pass", text: "Extraction finished. Review every line against the photo." });
          break;
        case "cached":
          setMessage({ tone: "pass", text: "A matching earlier result was reused. No new request was sent." });
          break;
        case "duplicate_request":
          setMessage({ tone: "info", text: "This request was already received; showing its result." });
          break;
        default:
          setMessage({
            tone: body.uncertain || body.kind === "previous_uncertain" ? "warn" : "fail",
            text:
              (body.message ?? body.error ?? "The extraction did not complete.") +
              (body.uncertain ? " Meta may still have processed it. Check usage before trying again." : ""),
          });
      }
      router.refresh();
    } catch {
      setMessage({
        tone: "warn",
        text: "The connection to Scriba was lost while waiting. The request may have completed. Reload the page before trying again.",
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirmFresh(false);
    }
  }

  return (
    <div className="space-y-3">
      {!hasSuccessfulRun ? (
        <>
          <OrientationControls disabled={busy} />
          <Button variant="primary" className="w-full" onClick={() => analyze("use_cache")} disabled={busy} aria-busy={busy}>
            {busy ? "Analyzing handwriting…" : lastRunFailed ? "Analyze again (new request)" : "Analyze handwriting"}
          </Button>
          <p className="text-xs text-ink-soft">
            {turns === 0 ? "Sends this photo, unchanged, " : `Sends a copy turned ${turns * 90}° clockwise (the stored original is unchanged) `}
            to Meta&apos;s <span className="font-medium">Muse Spark</span> model in one request. Uses API credits.
          </p>
          <p className="text-xs text-ink-soft">Turn the photo first if the writing is not upright: sideways photos were misread in testing.</p>
        </>
      ) : confirmFresh ? (
        <Notice tone="warn">
          <p>Re-analyzing sends a new paid request and creates a separate run. The current run and your review stay as they are.</p>
          <div className="mt-2">
            <OrientationControls disabled={busy} />
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => analyze("fresh")} disabled={busy}>
              {busy ? "Analyzing…" : "Yes, send a new request"}
            </Button>
            <Button onClick={() => setConfirmFresh(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Notice>
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => setConfirmFresh(true)} disabled={busy}>
          Re-analyze with a new request…
        </Button>
      )}
      {lastRunFailed && !message ? (
        <Notice tone={lastRunFailed.status === "uncertain" ? "warn" : "fail"}>
          Last attempt: {lastRunFailed.status.replaceAll("_", " ")}. {lastRunFailed.message}
        </Notice>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </div>
  );
}
