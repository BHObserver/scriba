"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Delete failed.");
      setBusy(false);
      return;
    }
    router.push(body.originalRemoved ? "/documents" : "/documents?orphan=1");
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button variant="ghost" className="text-xs" onClick={() => setConfirming(true)}>
        Delete…
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span>Delete the photo, its extractions, reviews and confirmed records?</span>
      <Button variant="danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</Button>
      <Button onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
      {error ? <span className="text-fail">{error}</span> : null}
    </div>
  );
}
