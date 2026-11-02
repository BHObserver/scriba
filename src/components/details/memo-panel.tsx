"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { UploadError, sha256Hex, uploadPage } from "@/components/capture/upload";
import { inspectImage } from "@/lib/images/inspect";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { MAX_MEMOS_PER_PAGE } from "@/lib/memo/schema";

/** One company memo of the page, as the details screen lists it. */
export type MemoSummary = {
  id: string;
  /** The latest reading's company and total; null when no reading succeeded. */
  company: string | null;
  totalPoisha: number | null;
  read: boolean;
  /** The latest run failed (and none succeeded after it). */
  failed: boolean;
};

/** One paid request: the analyze route's credit rules (cache, request id, rate limit) apply. */
async function analyzeMemo(id: string, mode: "use_cache" | "fresh"): Promise<boolean> {
  try {
    const res = await fetch(`/api/documents/${id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), mode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * U4: the company memos photographed with a page. Adding one uploads it with `memoFor`, then reads
 * it once; the page's questions then use its prices. "Read again" is a fresh, paid reading.
 */
export function MemoPanel({ pageId, userId, memos, maxUploadBytes }: { pageId: string; userId: string; memos: MemoSummary[]; maxUploadBytes: number }) {
  const { t, money } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [reading, setReading] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<MessageKey | null>(null);

  async function read(id: string, mode: "use_cache" | "fresh") {
    setReading((prev) => new Set(prev).add(id));
    const ok = await analyzeMemo(id, mode);
    setReading((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!ok) setError("dt.memo.err.read");
    router.refresh();
  }

  async function add(file: File) {
    setError(null);
    if (file.size > maxUploadBytes) return setError("dt.memo.err.file");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspection = inspectImage(bytes);
    if (!inspection.ok) return setError("dt.memo.err.file");
    setSending(true);
    try {
      const sha256 = await sha256Hex(bytes);
      const { documentId } = await uploadPage({ bytes, mimeType: inspection.mimeType, sha256, filename: file.name || null }, userId, () => {}, pageId);
      setSending(false);
      router.refresh();
      await read(documentId, "use_cache");
    } catch (e) {
      setSending(false);
      setError(
        e instanceof UploadError && e.status === 409
          ? "dt.memo.err.taken"
          : e instanceof UploadError && (e.problem === "file" || e.problem === "small")
            ? "dt.memo.err.file"
            : "dt.memo.err.send",
      );
    }
  }

  return (
    <div className="space-y-3 p-4 text-sm">
      {memos.length > 0 ? (
        <ul className="space-y-2">
          {memos.map((m) => {
            const busy = reading.has(m.id);
            return (
              <li key={m.id} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed-in thumbnail route */}
                <img src={`/api/documents/${m.id}/thumb?w=96`} alt="" width={48} height={64} className="h-16 w-12 shrink-0 rounded border border-rule object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.company ?? t("dt.memo.company")}</p>
                  <p className="text-xs text-ink-soft">
                    {busy
                      ? t("dt.memo.reading")
                      : m.read
                        ? m.totalPoisha != null
                          ? t("dt.memo.total", money(m.totalPoisha))
                          : t("dt.memo.noTotal")
                        : m.failed
                          ? t("dt.memo.failed")
                          : t("dt.memo.unread")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || sending}
                  onClick={() => void read(m.id, m.read ? "fresh" : "use_cache")}
                  className="shrink-0 text-xs text-accent hover:underline disabled:opacity-50"
                >
                  {m.read ? t("dt.memo.again") : t("dt.memo.read")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {memos.length < MAX_MEMOS_PER_PAGE ? (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void add(file);
            }}
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => input.current?.click()}
            className="w-full rounded-md border border-rule px-3 py-2 font-medium hover:bg-paper disabled:opacity-50"
          >
            {sending ? t("dt.memo.sending") : t("dt.memo.add")}
          </button>
        </>
      ) : (
        <p className="text-xs text-ink-soft">{t("dt.memo.max", MAX_MEMOS_PER_PAGE)}</p>
      )}
      {error ? <p className="text-xs text-fail">{t(error)}</p> : null}
    </div>
  );
}
