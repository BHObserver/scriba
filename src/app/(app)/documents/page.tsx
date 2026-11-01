import Link from "next/link";
import { DetailsTop } from "@/components/details/details-top";
import { PageThumb } from "@/components/history/page-thumb";
import { Chip, EmptyState } from "@/components/kit";
import { formatBytes } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import { dhakaDate } from "@/lib/ledger/dates";
import { requireUser } from "@/lib/server/auth";
import { loadShopProfile } from "@/lib/server/shop-data";
import { hasPhoto } from "@/lib/shop/rows";

export const metadata = { title: "All photos" };

const STATUS = {
  uploaded: "dt.st.uploaded",
  extracted: "dt.st.extracted",
  partially_confirmed: "dt.st.partially_confirmed",
  confirmed: "dt.st.confirmed",
} as const;

/** সব ছবি: every page photo, newest first, each opening its full record. New pages come in through /capture. */
export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const { orphan } = await searchParams;
  const { supabase } = await requireUser("/documents");
  const [{ data: docs }, profile, i18n] = await Promise.all([
    supabase
      .from("ledger_documents")
      .select("id, original_filename, byte_size, width, height, uploaded_at, business_date, status, sample_label, dataset_label, extraction_runs(processing_mode, started_at)")
      .order("uploaded_at", { ascending: false })
      .limit(100),
    loadShopProfile(supabase),
    getI18n(),
  ]);
  const { t } = i18n;
  const list = docs ?? [];

  return (
    <div className="dt">
      <DetailsTop title={t("more.photos")} sub={t("dt.pages", list.length)} backHref="/settings" sample={profile?.isSample ?? false} note={t("dt.tech")} />
      <div className="dt-body">
        {orphan ? <p className="panel-soft t-body">{t("dt.docs.orphan")}</p> : null}
        {list.length === 0 ? (
          <EmptyState title={t("dt.docs.empty.t")} body={t("dt.docs.empty.b")} />
        ) : (
          <ul className="card dt-list">
            {list.map((d) => {
              const photo = hasPhoto(d);
              const latest = [...(d.extraction_runs ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
              const page = { documentId: d.id, photo: photo ? { width: d.width, height: d.height, turns: turnsForProcessingMode(latest?.processing_mode) } : null };
              const day = d.business_date ?? dhakaDate(new Date(d.uploaded_at));
              const status = STATUS[d.status as keyof typeof STATUS] ?? STATUS.uploaded;
              return (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`} className="dt-doc">
                    <PageThumb page={page} width={48} />
                    <span className="dt-doc-text">
                      <span className="dt-doc-t">{photo ? (d.sample_label ?? d.original_filename ?? i18n.dayMonth(day)) : t("dt.sample.t")}</span>
                      <span className="t-small">
                        {i18n.dayMonth(day)}
                        {photo ? ` · ${i18n.digits(`${d.width}×${d.height} · ${formatBytes(d.byte_size)}`)}` : ` · ${t("dt.sample.none")}`}
                      </span>
                    </span>
                    <Chip kind={d.status === "confirmed" ? "ok" : undefined}>{t(status)}</Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
