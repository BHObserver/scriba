import Link from "next/link";
import { Card, CardHeader, Notice, Pill, formatDateTime } from "@/components/ui";
import { TRANSACTION_TYPE_LABELS, type TransactionType } from "@/lib/ledger/types";
import { formatQuantity, formatTaka } from "@/lib/numerals";
import { requireUser } from "@/lib/server/auth";

export default async function RecordsPage() {
  const { supabase } = await requireUser("/records");
  const { data: records } = await supabase
    .from("confirmed_records")
    .select(
      "id, document_id, run_id, line_order, transaction_type, source_text, customer_alias, item_name, quantity_milli, unit, unit_rate_poisha, amount_poisha, balance_poisha, was_corrected, acknowledgements, confirmed_at",
    )
    .order("confirmed_at", { ascending: false })
    .order("line_order")
    .limit(500);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Confirmed records</h1>
        <p className="text-sm text-ink-soft">Lines a person approved. Each links back to its photo, the model&apos;s reading and the review trail.</p>
      </div>
      <Notice tone="info">These are reviewed Scriba records. They are not double-entry journal postings and are not sent to any other system.</Notice>
      <Card>
        <CardHeader title={`${records?.length ?? 0} record(s)`} />
        {records && records.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-rule text-left text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-2 font-medium">Written</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Item / customer</th>
                  <th className="px-2 py-2 text-right font-medium">Qty × rate</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 font-medium">Review</th>
                  <th className="px-4 py-2 font-medium">Confirmed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {records.map((r) => {
                  const accepted = (r.acknowledgements?.accepted ?? []) as unknown[];
                  return (
                    <tr key={r.id}>
                      <td className="bn max-w-xs px-4 py-2">{r.source_text}</td>
                      <td className="px-2 py-2">{TRANSACTION_TYPE_LABELS[r.transaction_type as TransactionType]}</td>
                      <td className="bn px-2 py-2">{[r.item_name, r.customer_alias].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.quantity_milli != null ? `${formatQuantity(r.quantity_milli)}${r.unit ? ` ${r.unit}` : ""}` : "—"}
                        {r.unit_rate_poisha != null ? ` × ${formatTaka(r.unit_rate_poisha)}` : ""}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{formatTaka(r.amount_poisha)}</td>
                      <td className="space-x-1 px-2 py-2">
                        {r.was_corrected ? <Pill tone="accent">corrected</Pill> : <Pill>as read</Pill>}
                        {accepted.length > 0 ? <Pill tone="warn">{accepted.length} accepted warning(s)</Pill> : null}
                      </td>
                      <td className="px-4 py-2 text-xs text-ink-soft">
                        {formatDateTime(r.confirmed_at)}
                        <br />
                        <Link href={`/documents/${r.document_id}?run=${r.run_id}`} className="text-accent hover:underline">Source photo</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-ink-soft">Nothing confirmed yet.</p>
        )}
      </Card>
    </div>
  );
}
