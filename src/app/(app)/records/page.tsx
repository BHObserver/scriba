import Link from "next/link";
import { DetailsTop } from "@/components/details/details-top";
import { Chip, EmptyState } from "@/components/kit";
import { getI18n } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/messages";
import { dhakaDate } from "@/lib/ledger/dates";
import { formatQuantity } from "@/lib/numerals";
import { requireUser } from "@/lib/server/auth";
import { loadShopProfile } from "@/lib/server/shop-data";

export const metadata = { title: "Confirmed lines" };

const LIMIT = 500;

/**
 * মিলিয়ে নেওয়া লাইন: every line a person confirmed, newest first, as written in the khata, with
 * how it was reviewed and a link back to its photo and reading. A table from 900 px.
 */
export default async function RecordsPage() {
  const { supabase } = await requireUser("/records");
  const [{ data: records }, profile, i18n] = await Promise.all([
    supabase
      .from("confirmed_records")
      .select("id, document_id, run_id, transaction_type, source_text, customer_alias, item_name, quantity_milli, unit, unit_rate_poisha, amount_poisha, was_corrected, acknowledgements, confirmed_at")
      .order("confirmed_at", { ascending: false })
      .order("line_order")
      .limit(LIMIT),
    loadShopProfile(supabase),
    getI18n(),
  ]);
  const { t, money, digits } = i18n;
  const list = records ?? [];

  return (
    <div className="dt">
      <DetailsTop title={t("more.records")} sub={t("dt.lines", list.length)} backHref="/settings" sample={profile?.isSample ?? false} note={t("dt.rec.lead")} />
      <div className="dt-body">
        {list.length === 0 ? (
          <EmptyState title={t("dt.rec.empty.t")} body={t("dt.rec.empty.b")} />
        ) : (
          <div className="card overflow-hidden">
            <div className="dt-head" aria-hidden="true">
              <span>{t("dt.col.written")}</span>
              <span>{t("dt.col.type")}</span>
              <span>{t("dt.col.what")}</span>
              <span>{t("dt.col.qty")}</span>
              <span>{t("dt.col.amount")}</span>
              <span>{t("dt.col.review")}</span>
              <span>{t("dt.col.when")}</span>
            </div>
            <ul className="dt-list">
              {list.map((r) => {
                const accepted = ((r.acknowledgements as { accepted?: unknown[] } | null)?.accepted ?? []).length;
                const qty = r.quantity_milli != null ? `${digits(formatQuantity(r.quantity_milli))}${r.unit ? ` ${r.unit}` : ""}` : null;
                const qtyRate = [qty, r.unit_rate_poisha != null ? money(r.unit_rate_poisha) : null].filter(Boolean).join(" × ");
                return (
                  <li key={r.id} className="dt-rec">
                    <span className="dt-src bn">{r.source_text}</span>
                    <span className="dt-meta">
                      <span>{t(`type.${r.transaction_type}` as MessageKey)}</span>
                      <span className="bn">{[r.item_name, r.customer_alias].filter(Boolean).join(" · ") || "—"}</span>
                      <span className="dt-qty">{qtyRate || "—"}</span>
                    </span>
                    <span className="dt-amt num">{money(r.amount_poisha)}</span>
                    <span className="dt-rev">
                      <Chip>{t(r.was_corrected ? "dt.rec.corrected" : "dt.rec.asRead")}</Chip>
                      {accepted > 0 ? <Chip kind="look">{t("dt.rec.accepted", accepted)}</Chip> : null}
                    </span>
                    <span className="dt-when">
                      <span>{i18n.dayMonth(dhakaDate(new Date(r.confirmed_at)))}</span>
                      <Link href={`/documents/${r.document_id}?run=${r.run_id}`}>{t("dt.rec.photo")}</Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {list.length === LIMIT ? <p className="t-small">{t("dt.rec.limit", LIMIT)}</p> : null}
      </div>
    </div>
  );
}
