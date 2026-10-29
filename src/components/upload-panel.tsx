"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, CardHeader, Notice, formatBytes } from "@/components/ui";
import { EXTENSION_FOR, type ImageInspection, inspectImage } from "@/lib/images/inspect";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Selected = {
  file: File;
  bytes: Uint8Array;
  sha256: string;
  previewUrl: string;
  inspection: Extract<ImageInspection, { ok: true }>;
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upload the exact original bytes to the private bucket, reporting progress. */
function uploadWithProgress(opts: {
  url: string;
  token: string;
  apiKey: string;
  body: Blob;
  contentType: string;
  onProgress: (fraction: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", opts.url);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.token}`);
    xhr.setRequestHeader("apikey", opts.apiKey);
    xhr.setRequestHeader("Content-Type", opts.contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(opts.body);
  });
}

export function UploadPanel({ userId, maxUploadBytes }: { userId: string; maxUploadBytes: number }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "verifying">("idle");

  useEffect(() => () => {
    if (selected) URL.revokeObjectURL(selected.previewUrl);
  }, [selected]);

  async function choose(file: File | undefined) {
    setError(null);
    setSelected(null);
    if (!file) return;
    if (file.size > maxUploadBytes) {
      setError(`This photo is ${formatBytes(file.size)}; the limit is ${formatBytes(maxUploadBytes)}.`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspection = inspectImage(bytes);
    if (!inspection.ok) {
      setError(inspection.message);
      return;
    }
    setSelected({ file, bytes, inspection, sha256: await sha256Hex(bytes), previewUrl: URL.createObjectURL(file) });
  }

  async function upload() {
    if (!selected) return;
    setError(null);
    setStage("uploading");
    setProgress(0);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again.");
      const ext = EXTENSION_FOR[selected.inspection.mimeType];
      const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
      await uploadWithProgress({
        url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/scriba-originals/${storagePath}`,
        token: data.session.access_token,
        apiKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        // The untouched original: no resizing, re-encoding or rotation.
        body: new Blob([selected.bytes as BlobPart], { type: selected.inspection.mimeType }),
        contentType: selected.inspection.mimeType,
        onProgress: setProgress,
      });
      setStage("verifying");
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, originalFilename: selected.file.name || null, clientSha256: selected.sha256 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload could not be recorded.");
      router.push(`/documents/${body.documentId}${body.duplicate ? "?duplicate=1" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStage("idle");
      setProgress(null);
    }
  }

  const busy = stage !== "idle";

  return (
    <Card>
      <CardHeader
        title="Add a ledger photo"
        subtitle="A full khata page or a small snippet. JPEG, PNG or WebP. One photo at a time."
      />
      <div className="space-y-4 p-4">
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-rule px-4 py-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void choose(e.dataTransfer.files[0]);
          }}
        >
          <p className="text-sm text-ink-soft">Drop a photo here, or</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
              Choose a file
            </Button>
            <Button type="button" onClick={() => cameraInput.current?.click()} disabled={busy}>
              Take a photo
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </div>

        {error ? <Notice tone="fail">{error}</Notice> : null}

        {selected ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- the original is shown as-is */}
            <img src={selected.previewUrl} alt="Selected ledger photo" className="max-h-80 w-full rounded border border-rule object-contain" />
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-ink-soft">File</dt><dd className="truncate">{selected.file.name}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-soft">Size</dt><dd>{formatBytes(selected.bytes.byteLength)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-soft">Dimensions</dt><dd>{selected.inspection.width} × {selected.inspection.height}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-soft">Type</dt><dd>{selected.inspection.mimeType}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-soft">SHA-256</dt><dd className="font-mono text-xs">{selected.sha256.slice(0, 16)}…</dd></div>
              {selected.inspection.hasGpsMetadata ? (
                <div className="pt-2">
                  <Notice tone="warn">
                    This photo contains location (GPS) metadata. Scriba keeps the original unchanged, so the location is stored privately and sent to Meta with the image. Remove it before uploading if you prefer.
                  </Notice>
                </div>
              ) : null}
              <div className="pt-3">
                <Button type="button" variant="primary" onClick={upload} disabled={busy} className="w-full">
                  {stage === "uploading" ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : stage === "verifying" ? "Verifying checksum…" : "Upload original"}
                </Button>
                {progress != null ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-rule" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-ink-soft">Uploading does not send anything to Meta. You decide when to analyze.</p>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
