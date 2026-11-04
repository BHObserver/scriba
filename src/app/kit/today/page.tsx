import Link from "next/link";
import { TodayScreen, type TodayView } from "@/components/money/today-screen";
import { TabBar } from "@/components/shell/tab-bar";
import { prepareBook } from "@/lib/insights/book";
import { addDays } from "@/lib/insights/calendar";
import { bookInput, SAMPLE_TODAY, sampleShop } from "@/lib/insights/testing";
import { todayInsights } from "@/lib/insights/today";

export const metadata = { title: "Kit · Today" };

const STEPS = ["today", "yesterday", "new", "new-waiting"] as const;
type Step = (typeof STEPS)[number];

/**
 * Today from D3's sample shop (the engine's test fixture), without signing in: the full day, a
 * new shop, and a new shop whose first page waits. For design review and screenshots only.
 */
function view(step: Step): TodayView {
  // "yesterday": the sample day seen the morning after, before that day's page is in (F2 fix 10).
  const fresh = step !== "today" && step !== "yesterday";
  const book = prepareBook(fresh ? bookInput([], { usualOpeningCashPoisha: 150_000 }) : sampleShop());
  const pages = step === "new-waiting" ? [{ documentId: "kit-page-1", state: "waiting" as const, waitingLines: 7, confirmedLines: 0 }] : [];
  const insights = todayInsights(
    book,
    SAMPLE_TODAY,
    pages.map((p) => ({ documentId: p.documentId, checked: false, waitingLines: p.waitingLines })),
  );
  return {
    asOf: SAMPLE_TODAY,
    today: step === "yesterday" ? addDays(SAMPLE_TODAY, 1) : SAMPLE_TODAY,
    shopName: fresh ? "রহমান স্টোর" : "মায়ের দোয়া স্টোর",
    sample: !fresh,
    isNewShop: insights.isNewShop,
    day: insights.day,
    week: {
      days: insights.week.days,
      averagePoisha: insights.week.averagePoisha,
      totalPoisha: insights.week.total.poisha,
      diffPoisha: insights.week.diffPoisha,
    },
    dues: { totalPoisha: insights.customerDues.total.poisha, people: insights.customerDues.parties.length, flagged: insights.customerDues.flagged },
    note: insights.note,
    askName: insights.customerDues.parties[0]?.name ?? null,
    pages,
    duesHref: "/kit/today",
  };
}

export default async function KitTodayPage({ searchParams }: PageProps<"/kit/today">) {
  const { step: param } = await searchParams;
  const step: Step = STEPS.find((s) => s === param) ?? "today";
  return (
    <>
      <nav className="pad" style={{ display: "flex", gap: 12, padding: "8px 20px", fontSize: 13 }} aria-label="Kit steps">
        {STEPS.map((s) => (
          <Link key={s} href={`/kit/today?step=${s}`} aria-current={s === step ? "page" : undefined}>
            {s}
          </Link>
        ))}
      </nav>
      <main className="app-main" style={{ paddingTop: 0 }}>
        <TodayScreen key={step} {...view(step)} />
      </main>
      <TabBar />
    </>
  );
}
