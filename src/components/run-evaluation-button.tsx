"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";

export function RunEvaluationButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok ? `Evaluated ${body.samples} photo(s); ${body.skipped} skipped.` : (body.error ?? "Evaluation failed."));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button variant="primary" onClick={run} disabled={busy}>{busy ? "Computing…" : "Run evaluation (no API calls)"}</Button>
      {message ? <Notice tone="info">{message}</Notice> : null}
    </div>
  );
}
