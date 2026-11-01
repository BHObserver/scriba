import type { Viewport } from "next";
import { toPageView } from "@/components/money/page-view";
import { TodayScreen } from "@/components/money/today-screen";
import { TABS } from "@/components/shell/tabs";
import { dhakaDate } from "@/lib/ledger/dates";
import { requireUser } from "@/lib/server/auth";
import { loadShop, todayData } from "@/lib/server/shop-data";

export const metadata = { title: "Today" };
// The cover is the khata's red cloth; the browser chrome follows it.
export const viewport: Viewport = { themeColor: "#972622" };

/** আজ: everything is read on the server through the user's own client and computed by the engine. */
export default async function TodayPage() {
  const { supabase } = await requireUser("/");
  const shop = await loadShop(supabase);
  const asOf = dhakaDate(new Date());
  const { profile, insights, pages } = todayData(shop, asOf);
  const dues = insights.customerDues;
  return (
    <TodayScreen
      asOf={asOf}
      shopName={profile?.shopName ?? null}
      sample={profile?.isSample ?? false}
      isNewShop={insights.isNewShop}
      day={insights.day}
      week={{
        days: insights.week.days,
        averagePoisha: insights.week.averagePoisha,
        totalPoisha: insights.week.total.poisha,
        diffPoisha: insights.week.diffPoisha,
      }}
      dues={{ totalPoisha: dues.total.poisha, people: dues.parties.length, flagged: dues.flagged }}
      note={insights.note}
      pages={pages.map(toPageView)}
      duesHref={TABS.find((tab) => tab.id === "dues")!.href}
    />
  );
}
