import type { Viewport } from "next";
import { CloseScreen } from "@/components/money/close-screen";
import { toPageView } from "@/components/money/page-view";
import { dhakaDate } from "@/lib/ledger/dates";
import { requireUser } from "@/lib/server/auth";
import { closeData, homeDay, loadShop } from "@/lib/server/shop-data";

export const metadata = { title: "Close the day" };
export const viewport: Viewport = { themeColor: "#972622" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** দিনের হিসাব for today, or for an earlier day with `?date=YYYY-MM-DD` (never a future day). */
export default async function ClosePage({ searchParams }: PageProps<"/close">) {
  const { date: param } = await searchParams;
  const { supabase } = await requireUser("/close");
  const asOf = dhakaDate(new Date());
  const date = typeof param === "string" && DATE_RE.test(param) && param <= asOf ? param : asOf;
  const shop = await loadShop(supabase);
  const { profile, day, pages } = closeData(shop, date);
  return (
    <CloseScreen
      key={date}
      date={date}
      asOf={asOf}
      home={homeDay(shop, asOf)}
      shopName={profile?.shopName ?? null}
      sample={profile?.isSample ?? false}
      day={day}
      pages={pages.map(toPageView)}
    />
  );
}
