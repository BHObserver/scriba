import { notFound, redirect } from "next/navigation";
import type { LedgerEntryView } from "@/components/money/dues-model";
import { PartyScreen } from "@/components/money/party-screen";
import { dhakaDate } from "@/lib/ledger/dates";
import { UUID_RE, requireUser } from "@/lib/server/auth";
import { lineDetails, loadShop, partyData } from "@/lib/server/shop-data";

export const metadata = { title: "Dues" };

/** The newest lines come with the page; older ones load on request (POST /api/lines). */
const FIRST_LINES = 40;
/** Unpaid lines read for the reminder's picture, newest last. */
const UNPAID_LINES = 60;

/**
 * One party's account: balance, reasons, last payment, oldest unpaid credit and every credit and
 * payment under its handwriting. A merged spelling opens the party it was merged into.
 */
export default async function PartyPage({ params }: PageProps<"/parties/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireUser(`/parties/${id}`);
  const shop = await loadShop(supabase);
  const asOf = dhakaDate(new Date());
  const view = partyData(shop, id, asOf);
  if (!view) notFound();
  if (view.kind === "merged") redirect(`/parties/${view.intoId}`);
  const { account } = view;

  // A page's number is its place among that day's pages, as Close the day counts them.
  const pageNumber = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const p of shop.pages) {
    const n = (perDay.get(p.businessDate) ?? 0) + 1;
    perDay.set(p.businessDate, n);
    pageNumber.set(p.documentId, n);
  }
  const entries: LedgerEntryView[] = account.entries
    .map((e) => ({ ...e, page: pageNumber.get(e.documentId) ?? null }))
    .reverse();
  const unpaid = account.unpaidRecordIds.slice(-UNPAID_LINES);
  const lines = await lineDetails(supabase, shop, [...entries.slice(0, FIRST_LINES).map((e) => e.recordId), ...unpaid]);

  return (
    <PartyScreen
      key={account.partyId}
      asOf={asOf}
      shopName={shop.profile?.shopName ?? null}
      sample={shop.profile?.isSample ?? false}
      party={{
        id: account.partyId,
        kind: account.kind,
        name: account.name,
        balancePoisha: account.balancePoisha,
        risks: account.risks,
        lastPaymentDate: account.lastPayment?.date ?? null,
        oldestUnpaid: account.oldestUnpaid ? { date: account.oldestUnpaid.date, leftPoisha: account.oldestUnpaid.leftPoisha } : null,
        unpaidRecordIds: unpaid,
      }}
      entries={entries}
      firstLines={FIRST_LINES}
      lines={lines}
      aliases={view.aliases}
      mergeTargets={view.mergeTargets}
    />
  );
}
