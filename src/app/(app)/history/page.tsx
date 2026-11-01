import { toHistoryDay } from "@/components/history/history-data";
import { HISTORY_DAYS, shownDays } from "@/components/history/history-model";
import { HistoryScreen } from "@/components/history/history-screen";
import { dhakaDate } from "@/lib/ledger/dates";
import { requireUser } from "@/lib/server/auth";
import { duesData, historyData, loadShop } from "@/lib/server/shop-data";
import { SEARCH_LIMIT } from "@/lib/shop/history";

export const metadata = { title: "History" };

/** খাতা: the days are computed by the engine from his pages and confirmed lines; `?days=` shows older ones. */
export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const { days: daysParam, q } = await searchParams;
  const { supabase } = await requireUser("/history");
  const shop = await loadShop(supabase);
  const { profile, days } = historyData(shop);
  const shown = shownDays(daysParam);
  const asOf = dhakaDate(new Date());
  return (
    <HistoryScreen
      asOf={asOf}
      sample={profile?.isSample ?? false}
      days={days.slice(0, shown).map((day) => toHistoryDay(shop, day))}
      moreHref={days.length > shown ? `/history?days=${shown + HISTORY_DAYS}` : null}
      query={typeof q === "string" ? q.slice(0, 80) : ""}
      searchLimit={SEARCH_LIMIT}
      askName={duesData(shop, "customer", asOf).dues.parties[0]?.name ?? null}
    />
  );
}
