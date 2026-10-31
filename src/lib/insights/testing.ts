/**
 * Test builders for the insights engine, and D3's sample shop (Claude Design `proto/shop.js`)
 * so the engine's figures can be checked against the money-screens prototype.
 */
import type { PartyKind } from "@/lib/ledger/parties";
import { addDays } from "./calendar";
import type { BookInput, InsightParty, InsightRecord, RecordType } from "./types";

export type RecSpec = {
  date: string;
  type: RecordType;
  taka: number;
  party?: string | null;
  item?: string | null;
  doc?: string;
  run?: string;
  id?: string;
  corrected?: boolean;
  confirmedAt?: string;
  capturedAt?: string;
};

/** Records in the order given; ids r1, r2… unless set. One page per date unless `doc` is set. */
export function makeRecords(specs: readonly RecSpec[]): InsightRecord[] {
  return specs.map((s, i) => {
    const documentId = s.doc ?? `doc-${s.date}`;
    return {
      id: s.id ?? `r${i + 1}`,
      documentId,
      runId: s.run ?? `run-${documentId}`,
      businessDate: s.date,
      capturedAt: s.capturedAt ?? `${s.date}T04:00:00.000Z`,
      lineOrder: i,
      type: s.type,
      partyId: s.party ?? null,
      itemName: s.item ?? null,
      amountPoisha: Math.round(s.taka * 100),
      wasCorrected: s.corrected ?? false,
      confirmedAt: s.confirmedAt ?? `${s.date}T12:00:00.000Z`,
    };
  });
}

export function makeParty(id: string, kind: PartyKind, displayName: string, mergedInto: string | null = null): InsightParty {
  return { id, kind, displayName, mergedInto };
}

export function bookInput(records: InsightRecord[], extra: Partial<Omit<BookInput, "records">> = {}): BookInput {
  return { records, parties: [], closes: [], usualOpeningCashPoisha: 0, ...extra };
}

// ---------------------------------------------------------------------------
// D3 sample shop: মায়ের দোয়া স্টোর on Saturday 31 Oct 2026, morning cash ৳১,৫০০.
// ---------------------------------------------------------------------------

export const SAMPLE_TODAY = "2026-10-31";

export const SAMPLE_PARTIES: InsightParty[] = [
  makeParty("rahim", "customer", "রহিম উদ্দিন"),
  makeParty("sumaiya", "customer", "সুমাইয়া আপা"),
  makeParty("babul", "customer", "বাবুল"),
  makeParty("karim", "customer", "করিম মিয়া"),
  makeParty("shahana", "customer", "শাহানা বেগম"),
  makeParty("jasim", "customer", "জসিম"),
  makeParty("nasir", "customer", "নাসির"),
  makeParty("minu", "customer", "মিনু দিদি"),
  makeParty("alamin", "supplier", "আল-আমিন এন্টারপ্রাইজ"),
  makeParty("rafiq", "supplier", "রফিক ট্রেডার্স"),
  makeParty("haque", "supplier", "হক স্টোর"),
];

type Line = [ago: number, page: string | null, type: RecordType, party: string | null, item: string, taka: number];

const TODAY_LINES: Line[] = [
  [0, "p1", "cash_sale", null, "চাল", 10 * 60],
  [0, "p1", "cash_sale", null, "ডাল", 4 * 140],
  [0, "p1", "cash_sale", null, "সয়াবিন তেল", 5 * 180],
  [0, "p1", "cash_sale", null, "চিনি", 6 * 130],
  [0, "p1", "cash_sale", null, "আটা", 10 * 55],
  [0, "p1", "cash_sale", null, "পেঁয়াজ", 8 * 80],
  [0, "p1", "cash_sale", null, "ডিম", 3 * 150],
  [0, "p1", "cash_sale", null, "সাবান", 10 * 40],
  [0, "p1", "cash_sale", null, "বিস্কুট", 7 * 10],
  [0, "p2", "credit_sale", "karim", "চাল", 3 * 60],
  [0, "p2", "credit_sale", "karim", "ডাল", 1 * 140],
  [0, "p2", "repayment", "karim", "জমা", 100],
  [0, "p3", "credit_sale", "shahana", "তেল", 2 * 180],
  [0, "p3", "credit_sale", "shahana", "চিনি", 1 * 130],
  [0, "p3", "credit_sale", "shahana", "ডিম", 1 * 150],
  [0, "p3", "credit_sale", "babul", "চাল", 5 * 60],
  [0, "p3", "credit_sale", "babul", "পেঁয়াজ", 1 * 80],
  [0, "p3", "repayment", "jasim", "জমা", 500],
  [0, "p3", "purchase", "rafiq", "চাল", 30 * 52],
  [0, "p3", "purchase", "rafiq", "বিস্কুট", 2 * 120],
  [0, "p3", "supplier_payment", "alamin", "আল-আমিনকে দেওয়া", 600],
  [0, "p3", "expense", null, "ভ্যান ভাড়া", 150],
  [0, "p3", "expense", null, "চা-নাশতা", 80],
  [0, "p3", "expense", null, "বিদ্যুৎ বিল", 100],
];

const PAST_LINES: Line[] = [
  // রহিম উদ্দিন: nothing paid for 45 days
  [60, null, "credit_sale", "rahim", "চাল", 25 * 58],
  [53, null, "credit_sale", "rahim", "তেল", 5 * 180],
  [45, null, "repayment", "rahim", "জমা", 500],
  [37, null, "credit_sale", "rahim", "ডাল", 5 * 140],
  [21, null, "credit_sale", "rahim", "চিনি", 4 * 130],
  [9, null, "credit_sale", "rahim", "সাবান", 6 * 30],
  // সুমাইয়া আপা: balance up three weeks running
  [35, null, "credit_sale", "sumaiya", "চাল", 10 * 60],
  [26, null, "repayment", "sumaiya", "জমা", 400],
  [19, null, "credit_sale", "sumaiya", "তেল", 2 * 180],
  [12, null, "credit_sale", "sumaiya", "ডাল", 3 * 140],
  [5, null, "credit_sale", "sumaiya", "চিনি", 5 * 130],
  // বাবুল: one unusually large credit
  [30, null, "credit_sale", "babul", "চাল", 5 * 60],
  [24, null, "credit_sale", "babul", "ডাল", 2 * 125],
  [20, null, "repayment", "babul", "জমা", 550],
  [16, null, "credit_sale", "babul", "চাল", 5 * 60],
  [10, null, "repayment", "babul", "জমা", 300],
  [2, null, "credit_sale", "babul", "আটা", 25 * 60],
  [25, null, "credit_sale", "karim", "ডিম", 3 * 150],
  [20, null, "repayment", "karim", "জমা", 450],
  [11, null, "credit_sale", "karim", "চাল", 10 * 60],
  [10, null, "credit_sale", "karim", "সাবান", 5 * 40],
  [18, null, "credit_sale", "shahana", "চাল", 15 * 60],
  [6, null, "repayment", "shahana", "জমা", 400],
  [3, null, "credit_sale", "shahana", "ডাল", 5 * 140],
  [33, null, "credit_sale", "jasim", "চাল", 20 * 60],
  [40, null, "credit_sale", "nasir", "চাল", 10 * 60],
  [12, null, "repayment", "nasir", "জমা", 300],
  [8, null, "credit_sale", "nasir", "চিনি", 1 * 130],
  [15, null, "credit_sale", "minu", "তেল", 4 * 180],
  [3, null, "repayment", "minu", "জমা", 300],
  [2, null, "credit_sale", "minu", "ডাল", 4 * 140],
  [20, null, "credit_purchase", "alamin", "তেল", 2 * 3600],
  [12, null, "credit_purchase", "alamin", "ডাল", 15 * 120],
  [24, null, "credit_purchase", "rafiq", "চিনি", 25 * 128],
  [9, null, "credit_purchase", "haque", "সাবান", 50 * 30],
];

/** Today's pages are p1–p3 (captured in that order); each earlier day is one page. */
export function sampleShop(): BookInput {
  const pageTime: Record<string, string> = { p1: "04:00", p2: "06:00", p3: "09:00" };
  const records = makeRecords(
    [...PAST_LINES, ...TODAY_LINES].map(([ago, page, type, party, item, taka]) => {
      const date = addDays(SAMPLE_TODAY, -ago);
      return {
        date,
        type,
        party,
        item,
        taka,
        doc: page ?? `doc-${date}`,
        capturedAt: `${date}T${page ? pageTime[page] : "04:00"}:00.000Z`,
      };
    }),
  );
  return { records, parties: SAMPLE_PARTIES, closes: [], usualOpeningCashPoisha: 150_000 };
}
