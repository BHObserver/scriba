"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { groundTruthTemplate } from "@/lib/evaluation/ground-truth";

/**
 * Enter ground truth by reading the photograph yourself. The editor starts from a
 * blank template or a private JSON file, never from the model's output, so the
 * ground truth stays independent of what is being evaluated.
 */
export function GroundTruthEditor({ documentId, sampleId, currentVersion }: { documentId: string; sampleId: string; currentVersion: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(groundTruthTemplate(sampleId), null, 2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    let annotation: unknown;
    try {
      annotation = JSON.parse(text);
    } catch {
      setError("That is not valid JSON.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/ground-truth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, annotation }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError([body.error, ...(body.issues ?? [])].filter(Boolean).join(" · "));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" className="text-xs" onClick={() => setOpen(true)}>
        {currentVersion ? `Add version ${currentVersion + 1}` : "Add ground truth"}
      </Button>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-ink-soft">
        Fill this in from the photo only. Use <code>expected_flag: true</code> for lines that are wrong on purpose, and
        list fields you cannot read in <code>unreadable</code>.
      </p>
      <input
        type="file"
        accept="application/json"
        className="text-xs"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setText(await f.text());
        }}
      />
      <textarea
        lang="bn"
        className="bn h-72 w-full rounded border border-rule bg-card p-2 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? <Notice tone="fail">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save ground truth"}</Button>
        <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
