/**
 * The demo shop (নমুনা দোকান): D3's sample shop মায়ের দোয়া স্টোর, grown to 45+ days.
 * Today's pages and every customer's story are D3's (drawer ৳৪,৩২০, sales ৳৬,২৯০, the three
 * risks), so the app matches the prototype and the video. Earlier days get deterministic
 * cash sales, stock buying and costs. All of it is sample data: the shop profile is marked
 * `is_sample` and every screen shows the badge. Lines are written as a shopkeeper would and
 * are confirmed through the real confirm function by `scripts/seed-demo.ts`.
 */
import { prepareBook } from "@/lib/insights/book";
import { addDays, weekdayOf } from "@/lib/insights/calendar";
import { type DayCloseSnapshot, dayCloseSnapshot, daySummary } from "@/lib/insights/day";
import type { BookInput, InsightDayClose, InsightParty, InsightRecord, RecordType } from "@/lib/insights/types";
import { dhakaDate } from "@/lib/ledger/dates";
import { partyLinkFor } from "@/lib/ledger/parties";
import type { EntryValues, PageValues, TransactionType } from "@/lib/ledger/types";
import { toBanglaDigits } from "@/lib/numerals";

export const DEMO_PROFILE = { shopName: "মায়ের দোয়া স্টোর", language: "bn" as const, openingCashPoisha: 150_000 };

export type DemoPage = { key: string; date: string; capturedAt: string; page: PageValues; lines: EntryValues[] };
export type DemoClose = { date: string; gapPoisha: number };
export type DemoShop = { today: string; pages: DemoPage[]; closes: DemoClose[] };

const RAHIM = "রহিম উদ্দিন";
const SUMAIYA = "সুমাইয়া আপা";
const BABUL = "বাবুল";
const KARIM = "করিম মিয়া";
const SHAHANA = "শাহানা বেগম";
const JASIM = "জসিম";
const NASIR = "নাসির";
const MINU = "মিনু দিদি";
const HABIB = "হাবিব ভাই";
const MORIYOM = "মরিয়ম খালা";
const NASIR_FULL = "নাসির উদ্দিন";
const ALAMIN = "আল-আমিন এন্টারপ্রাইজ";
const RAFIQ = "রফিক ট্রেডার্স";
const HAQUE = "হক স্টোর";
const NUR = "নূর রাইস মিল";

const UNIT: Record<string, string> = {
  চাল: "কেজি", ডাল: "কেজি", চিনি: "কেজি", আটা: "কেজি", পেঁয়াজ: "কেজি", লবণ: "কেজি",
  "সয়াবিন তেল": "লিটার", তেল: "লিটার", ডিম: "ডজন", সাবান: "পিস", বিস্কুট: "প্যাকেট", "চা পাতা": "প্যাকেট",
};

/** [type, party, item, qty, rate] for a line written as qty × rate, or [type, party, item, amount]. */
type Spec = [TransactionType, string | null, string, number, number?];

const bn = (n: number) => toBanglaDigits(String(n));

function line([type, party, item, a, b]: Spec): EntryValues {
  const isProduct = b !== undefined;
  const amount = isProduct ? a * b : a;
  const unit = isProduct ? (UNIT[item] ?? null) : null;
  const words = [party, item, isProduct ? `${bn(a)}${unit ? ` ${unit}` : ""} × ${bn(b)} =` : null, bn(amount)];
  return {
    sourceText: words.filter(Boolean).join(" "),
    type,
    customer: party,
    item,
    quantityText: isProduct ? bn(a) : null,
    unit,
    rateText: isProduct ? bn(b) : null,
    amountText: bn(amount),
    balanceText: null,
    crossedOut: false,
  };
}

// Today: D3's three pages, line for line.
const TODAY: Spec[][] = [
  [
    ["cash_sale", null, "চাল", 10, 60], ["cash_sale", null, "ডাল", 4, 140], ["cash_sale", null, "সয়াবিন তেল", 5, 180],
    ["cash_sale", null, "চিনি", 6, 130], ["cash_sale", null, "আটা", 10, 55], ["cash_sale", null, "পেঁয়াজ", 8, 80],
    ["cash_sale", null, "ডিম", 3, 150], ["cash_sale", null, "সাবান", 10, 40], ["cash_sale", null, "বিস্কুট", 7, 10],
  ],
  [["credit_sale", KARIM, "চাল", 3, 60], ["credit_sale", KARIM, "ডাল", 1, 140], ["repayment", KARIM, "জমা", 100]],
  [
    ["credit_sale", SHAHANA, "তেল", 2, 180], ["credit_sale", SHAHANA, "চিনি", 1, 130], ["credit_sale", SHAHANA, "ডিম", 1, 150],
    ["credit_sale", BABUL, "চাল", 5, 60], ["credit_sale", BABUL, "পেঁয়াজ", 1, 80], ["repayment", JASIM, "জমা", 500],
    ["purchase", RAFIQ, "চাল", 30, 52], ["purchase", RAFIQ, "বিস্কুট", 2, 120], ["supplier_payment", ALAMIN, "আল-আমিনকে দেওয়া", 600],
    ["expense", null, "ভ্যান ভাড়া", 150], ["expense", null, "চা-নাশতা", 80], ["expense", null, "বিদ্যুৎ বিল", 100],
  ],
];

// Earlier credit and supplier lines by days ago: D3's customers, plus four parties of our own
// (one settled, one steady, a spelling variant of নাসির to merge, a supplier).
const ACCOUNTS: Array<[number, Spec]> = [
  [60, ["credit_sale", RAHIM, "চাল", 25, 58]], [53, ["credit_sale", RAHIM, "তেল", 5, 180]], [45, ["repayment", RAHIM, "জমা", 500]],
  [37, ["credit_sale", RAHIM, "ডাল", 5, 140]], [21, ["credit_sale", RAHIM, "চিনি", 4, 130]], [9, ["credit_sale", RAHIM, "সাবান", 6, 30]],
  [35, ["credit_sale", SUMAIYA, "চাল", 10, 60]], [26, ["repayment", SUMAIYA, "জমা", 400]], [19, ["credit_sale", SUMAIYA, "তেল", 2, 180]],
  [12, ["credit_sale", SUMAIYA, "ডাল", 3, 140]], [5, ["credit_sale", SUMAIYA, "চিনি", 5, 130]],
  [30, ["credit_sale", BABUL, "চাল", 5, 60]], [24, ["credit_sale", BABUL, "ডাল", 2, 125]], [20, ["repayment", BABUL, "জমা", 550]],
  [16, ["credit_sale", BABUL, "চাল", 5, 60]], [10, ["repayment", BABUL, "জমা", 300]], [2, ["credit_sale", BABUL, "আটা", 25, 60]],
  [25, ["credit_sale", KARIM, "ডিম", 3, 150]], [20, ["repayment", KARIM, "জমা", 450]], [11, ["credit_sale", KARIM, "চাল", 10, 60]],
  [10, ["credit_sale", KARIM, "সাবান", 5, 40]],
  [18, ["credit_sale", SHAHANA, "চাল", 15, 60]], [6, ["repayment", SHAHANA, "জমা", 400]], [3, ["credit_sale", SHAHANA, "ডাল", 5, 140]],
  [33, ["credit_sale", JASIM, "চাল", 20, 60]],
  [40, ["credit_sale", NASIR, "চাল", 10, 60]], [12, ["repayment", NASIR, "জমা", 300]], [8, ["credit_sale", NASIR, "চিনি", 1, 130]],
  [15, ["credit_sale", MINU, "তেল", 4, 180]], [3, ["repayment", MINU, "জমা", 300]], [2, ["credit_sale", MINU, "ডাল", 4, 140]],
  [20, ["credit_purchase", ALAMIN, "তেল", 2, 3600]], [12, ["credit_purchase", ALAMIN, "ডাল", 15, 120]],
  [24, ["credit_purchase", RAFIQ, "চিনি", 25, 128]], [9, ["credit_purchase", HAQUE, "সাবান", 50, 30]],
  [28, ["credit_sale", HABIB, "চাল", 5, 60]], [22, ["repayment", HABIB, "জমা", 300]], [14, ["credit_sale", HABIB, "তেল", 2, 180]],
  [7, ["repayment", HABIB, "জমা", 360]],
  [17, ["credit_sale", MORIYOM, "ডাল", 2, 140]], [13, ["repayment", MORIYOM, "জমা", 200]], [4, ["credit_sale", MORIYOM, "চিনি", 2, 130]],
  [19, ["credit_sale", NASIR_FULL, "আটা", 4, 55]],
  [27, ["credit_purchase", NUR, "চাল", 50, 50]], [13, ["supplier_payment", NUR, "নূর রাইস মিলকে দেওয়া", 2500]],
  [6, ["credit_purchase", NUR, "চাল", 40, 52]],
  [15, ["supplier_payment", ALAMIN, "আল-আমিনকে দেওয়া", 2000]], [8, ["supplier_payment", RAFIQ, "রফিক ট্রেডার্সকে দেওয়া", 1500]],
];

/** Days of filler before today. D3's oldest line is 60 days ago, so the book reaches back that far. */
export const DEMO_DAYS = 45;
/** Closed days, by days ago, and what the count differed by. Never yesterday, never two in a row. */
const CLOSES: Array<[number, number]> = [[2, 0], [4, -5_000], [6, 0], [9, 2_000], [12, 0]];

const CATALOG: Array<[string, number]> = [
  ["চাল", 60], ["ডাল", 140], ["সয়াবিন তেল", 180], ["চিনি", 130], ["আটা", 55], ["পেঁয়াজ", 80],
  ["ডিম", 150], ["সাবান", 40], ["বিস্কুট", 10], ["লবণ", 40], ["চা পাতা", 120],
];

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cash sales, stock bought for cash and costs for a day `ago` days back. */
function fillerDay(ago: number, weekday: number): Spec[] {
  const rnd = random(1000 + ago);
  const pick = (n: number) => Math.floor(rnd() * n);
  // Fridays are busier; the last week sells a little more than the one before.
  const factor = (weekday === 5 ? 1.4 : 1) * (ago <= 7 ? 1.1 : 1);
  const specs: Spec[] = [];
  const shuffled = [...CATALOG];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const items = shuffled.slice(0, 6 + pick(4));
  for (const [item, rate] of items) {
    const base = rate >= 100 ? 1 + pick(4) : rate <= 15 ? 4 + pick(10) : 2 + pick(8);
    specs.push(["cash_sale", null, item, Math.max(1, Math.round(base * factor)), rate]);
  }
  if (ago % 3 === 0) specs.push(ago % 2 === 0 ? ["purchase", RAFIQ, "চাল", 30, 52] : ["purchase", HAQUE, "ডাল", 10, 120]);
  specs.push(["expense", null, "চা-নাশতা", 60 + 10 * pick(5)]);
  if (ago % 2 === 0) specs.push(["expense", null, "ভ্যান ভাড়া", 100 + 50 * pick(2)]);
  if (ago === 30) specs.push(["expense", null, "দোকান ভাড়া", 3000]);
  return specs;
}

/** "৩১/১০/২৬" for 2026-10-31: how the page's date is written. */
function writtenDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return toBanglaDigits(`${Number(d)}/${Number(m)}/${y!.slice(2)}`);
}

/**
 * Today's page `n` (1–3) at Dhaka hh:mm, but at least 10·(4−n) minutes before `latest`, so pages
 * captured now (S01/S04 in the seed) come after them; never before the day began.
 */
function capturedAt(date: string, hhmm: string, latest: Date, n: number): string {
  const planned = new Date(`${date}T${hhmm}:00+06:00`).getTime();
  const dayStart = new Date(`${date}T00:00:00+06:00`).getTime();
  return new Date(Math.max(Math.min(planned, latest.getTime() - (4 - n) * 10 * 60_000), dayStart + n * 1000)).toISOString();
}

export function demoShop(now: Date): DemoShop {
  const today = dhakaDate(now);
  const pages: DemoPage[] = [];
  const page = (key: string, date: string, at: string, specs: Spec[]) =>
    pages.push({ key, date, capturedAt: at, page: { dateText: writtenDate(date), ledgerType: "mixed", accountName: null }, lines: specs.map(line) });

  const oldest = Math.max(DEMO_DAYS - 1, ...ACCOUNTS.map(([ago]) => ago));
  for (let ago = oldest; ago >= 1; ago--) {
    const date = addDays(today, -ago);
    const at = (hhmm: string) => new Date(`${date}T${hhmm}:00+06:00`).toISOString();
    if (ago < DEMO_DAYS) page(`d${ago}-cash`, date, at("20:30"), fillerDay(ago, weekdayOf(date)));
    const accounts = ACCOUNTS.filter(([a]) => a === ago).map(([, s]) => s);
    if (accounts.length > 0) page(`d${ago}-accounts`, date, at("20:40"), accounts);
  }
  TODAY.forEach((specs, i) => page(`today-${i + 1}`, today, capturedAt(today, ["10:00", "12:00", "15:00"][i]!, now, i + 1), specs));

  return { today, pages, closes: CLOSES.map(([ago, gapPoisha]) => ({ date: addDays(today, -ago), gapPoisha })) };
}

/**
 * The demo's day closes, oldest first, each computed by the engine from the book as it stood
 * (earlier closes included), exactly as the close route does: counted = expected + the gap.
 */
export function closeSnapshots(input: BookInput, closes: readonly DemoClose[]): DayCloseSnapshot[] {
  const done: InsightDayClose[] = [];
  return [...closes]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((c) => {
      const day = daySummary(prepareBook({ ...input, closes: done }), c.date);
      const snapshot = dayCloseSnapshot(day, day.expectedCash.poisha + c.gapPoisha);
      done.push({
        businessDate: c.date,
        openingCashPoisha: snapshot.openingCashPoisha,
        expectedCashPoisha: snapshot.expectedCashPoisha,
        countedCashPoisha: snapshot.countedCashPoisha,
      });
      return snapshot;
    });
}

/**
 * The demo as the confirm function would store it (parties by kind + key, records per line),
 * without a database: for tests and `bun run live:ask`.
 */
export function demoBookInput(now: Date): BookInput {
  const shop = demoShop(now);
  const parties = new Map<string, InsightParty>();
  const records: InsightRecord[] = [];
  for (const p of shop.pages) {
    const types = p.lines.map((l) => l.type);
    p.lines.forEach((l, i) => {
      const link = partyLinkFor(l, p.page, types);
      const partyId = link ? `${link.kind}:${link.key}` : null;
      if (link && partyId && !parties.has(partyId)) parties.set(partyId, { id: partyId, kind: link.kind, displayName: link.name, mergedInto: null });
      records.push({
        id: `${p.key}-${i}`,
        documentId: p.key,
        runId: `run-${p.key}`,
        businessDate: p.date,
        capturedAt: p.capturedAt,
        lineOrder: i + 1,
        type: l.type as RecordType,
        partyId,
        itemName: l.item,
        amountPoisha: Number(l.amountText!.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))) * 100,
        wasCorrected: false,
        confirmedAt: p.capturedAt,
      });
    });
  }
  return { records, parties: [...parties.values()], closes: [], usualOpeningCashPoisha: DEMO_PROFILE.openingCashPoisha };
}
