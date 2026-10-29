import Link from "next/link";
import { Card, CardHeader, Pill, formatBytes, formatDateTime } from "@/components/ui";
import { UploadPanel } from "@/components/upload-panel";
import { STORAGE_BUCKET, getLimitsConfig } from "@/lib/config";
import { requireUser } from "@/lib/server/auth";

const DOC_STATUS: Record<string, { label: string; tone: "neutral" | "pass" | "warn" | "accent" }> = {
  uploaded: { label: "Not analyzed", tone: "neutral" },
  extracted: { label: "Ready to review", tone: "accent" },
  partially_confirmed: { label: "Partly confirmed", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "pass" },
};

export default async function DocumentsPage() {
  const { supabase, user } = await requireUser("/documents");
  const { data: docs } = await supabase
    .from("ledger_documents")
    .select("id, storage_path, original_filename, byte_size, width, height, uploaded_at, status, sample_label")
    .order("uploaded_at", { ascending: false })
    .limit(100);

  const paths = (docs ?? []).map((d) => d.storage_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 600)
    : { data: [] };
  const thumb = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Documents</h1>
        <p className="text-sm text-ink-soft">Upload → Analyze → Review → Correct → Validate → Confirm.</p>
      </div>

      <UploadPanel userId={user.id} maxUploadBytes={getLimitsConfig().maxUploadBytes} />

      <Card>
        <CardHeader title="Recent photos" subtitle="Opening a document never calls the model." />
        {docs && docs.length > 0 ? (
          <ul className="divide-y divide-rule">
            {docs.map((d) => {
              const status = DOC_STATUS[d.status] ?? DOC_STATUS.uploaded!;
              const url = thumb.get(d.storage_path);
              return (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded border border-rule bg-paper">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private original via short-lived signed URL */}
                      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.sample_label ?? d.original_filename ?? "Ledger photo"}</p>
                      <p className="text-xs text-ink-soft">
                        {formatDateTime(d.uploaded_at)} · {d.width}×{d.height} · {formatBytes(d.byte_size)}
                      </p>
                    </div>
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-ink-soft">No photos yet. Add one above.</p>
        )}
      </Card>
    </div>
  );
}
