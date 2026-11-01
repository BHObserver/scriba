import { notFound } from "next/navigation";
import { DayScreen } from "@/components/history/day-screen";
import { toHistoryDay } from "@/components/history/history-data";
import { dhakaDate } from "@/lib/ledger/dates";
import { requireUser } from "@/lib/server/auth";
import { historyData, loadShop } from "@/lib/server/shop-data";

export const metadata = { title: "Day" };

/** One day of the khata: its pages, whether they're checked, and how the day ended. */
export default async function HistoryDayPage({ params }: PageProps<"/history/[date]">) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const { supabase } = await requireUser(`/history/${date}`);
  const shop = await loadShop(supabase);
  const { profile, days } = historyData(shop);
  const day = days.find((d) => d.date === date);
  if (!day) notFound();
  return <DayScreen asOf={dhakaDate(new Date())} sample={profile?.isSample ?? false} day={toHistoryDay(shop, day, { lines: true })} />;
}
