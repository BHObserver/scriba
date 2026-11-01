import { duesTab } from "@/components/money/dues-model";
import { DuesScreen } from "@/components/money/dues-screen";
import { waitingPages } from "@/components/money/money-model";
import { toPageView } from "@/components/money/page-view";
import type { PartyAccount } from "@/lib/insights/accounts";
import { dhakaDate } from "@/lib/ledger/dates";
import { requireUser } from "@/lib/server/auth";
import { duesData, loadShop } from "@/lib/server/shop-data";

export const metadata = { title: "Dues" };

/** Only what a row shows, so the client gets no more than it needs. */
function toRow(a: PartyAccount) {
  return { partyId: a.partyId, name: a.name, balancePoisha: a.balancePoisha, risk: a.risks[0] ?? null, lastPaymentDate: a.lastPayment?.date ?? null };
}

/** বাকি: both lists are computed by the engine from confirmed lines; `?tab=supplier` opens দেনা. */
export default async function DuesPage({ searchParams }: PageProps<"/parties">) {
  const { tab } = await searchParams;
  const { supabase } = await requireUser("/parties");
  const shop = await loadShop(supabase);
  const asOf = dhakaDate(new Date());
  const customers = duesData(shop, "customer", asOf).dues;
  const suppliers = duesData(shop, "supplier", asOf).dues;
  const waiting = waitingPages(shop.pages.map(toPageView), "/parties");
  return (
    <DuesScreen
      asOf={asOf}
      sample={shop.profile?.isSample ?? false}
      tab={duesTab(tab)}
      lists={{
        customer: { rows: customers.parties.map(toRow), totalPoisha: customers.total.poisha },
        supplier: { rows: suppliers.parties.map(toRow), totalPoisha: suppliers.total.poisha },
      }}
      waiting={{ count: waiting.ids.length, href: waiting.href }}
    />
  );
}
