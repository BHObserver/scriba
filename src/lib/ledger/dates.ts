/**
 * The business date of a page: the day its lines happened.
 *
 * It is the date written on the page when that parses, else the day the photo
 * was taken in Bangladesh time. The shopkeeper can always change it. Written
 * dates are read the Bangladesh way (day before month) in any of:
 *   ৩১/১০/২৬, ৩১-১০-২০২৬, ৩১.১০ · ৩১ অক্টো, অক্টোবর ৩১, 31 Oct 2026 ·
 *   ১৪ কার্তিক, ১৪ কার্তিক ১৪৩৩ (Bangla calendar, Bangladesh's revised form).
 * A missing year is the most recent one that doesn't put the date in the future.
 * Anything else, or a date implausibly far from the photo, stays text only.
 */
import { toAsciiDigits } from "@/lib/numerals";

export type BusinessDateSource = "capture" | "written" | "user";
export type BusinessDate = { iso: string; source: Exclude<BusinessDateSource, "user"> };

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far after the photo a written date may be (a page dated for tomorrow). */
const MAX_AHEAD_DAYS = 7;
/** How far before the photo a written date may be (an old page photographed late). */
const MAX_BEHIND_DAYS = 400;

/** The calendar day of an instant in Bangladesh, as YYYY-MM-DD. */
export function dhakaDate(at: Date): string {
  return new Date(at.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

const GREGORIAN_MONTHS: Array<[number, string[]]> = [
  [1, ["জানু", "jan"]],
  [2, ["ফেব্রু", "ফেব", "feb"]],
  [3, ["মার্চ", "mar"]],
  [4, ["এপ্রি", "apr"]],
  [5, ["মে", "may"]],
  [6, ["জুন", "jun"]],
  [7, ["জুলা", "jul"]],
  [8, ["আগ", "aug"]],
  [9, ["সেপ্ট", "সেপ", "sep"]],
  [10, ["অক্টো", "oct"]],
  [11, ["নভে", "nov"]],
  [12, ["ডিসে", "dec"]],
];

// Bangla calendar months, Boishakh first.
const BANGLA_MONTHS: Array<[number, string[]]> = [
  [1, ["বৈশাখ"]],
  [2, ["জ্যৈষ্ঠ", "জৈষ্ঠ", "জ্যেষ্ঠ"]],
  [3, ["আষাঢ়"]],
  [4, ["শ্রাবণ", "শ্রাবন"]],
  [5, ["ভাদ্র"]],
  [6, ["আশ্বিন"]],
  [7, ["কার্তিক", "কার্ত্তিক"]],
  [8, ["অগ্রহায়ণ", "অগ্রহায়ন", "অঘ্রাণ"]],
  [9, ["পৌষ"]],
  [10, ["মাঘ"]],
  [11, ["ফাল্গুন", "ফাগুন"]],
  [12, ["চৈত্র"]],
];

function monthOf(word: string, table: Array<[number, string[]]>): number | null {
  const w = word.normalize("NFC").toLowerCase();
  for (const [month, prefixes] of table) {
    if (prefixes.some((p) => w.startsWith(p.normalize("NFC")))) return month;
  }
  return null;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function utc(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/**
 * Bangladesh's revised Bangla calendar (2019): the year starts on 14 April;
 * Boishakh to Ashwin have 31 days, Falgun 30 in a Gregorian leap year else 29,
 * and the other months 30.
 */
function fromBanglaCalendar(banglaYear: number, month: number, day: number): Date | null {
  const gYear = banglaYear + 593;
  const length = (m: number) => (m <= 6 ? 31 : m === 11 ? (isLeap(gYear + 1) ? 30 : 29) : 30);
  if (day < 1 || day > length(month)) return null;
  let offset = day - 1;
  for (let m = 1; m < month; m++) offset += length(m);
  return new Date(Date.UTC(gYear, 3, 14) + offset * DAY_MS);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Of the dates a yearless entry could be, the latest one not too far after the photo. */
function closestYear(build: (year: number) => Date | null, reference: Date, refYear: number): Date | null {
  const limit = reference.getTime() + MAX_AHEAD_DAYS * DAY_MS;
  const candidates = [refYear + 1, refYear, refYear - 1]
    .map(build)
    .filter((d): d is Date => d != null && d.getTime() <= limit);
  return candidates[0] ?? null;
}

/**
 * The ISO date written on a page, or null when it doesn't parse or is implausible.
 * `capturedAt` resolves a missing year and bounds the result.
 */
export function parseWrittenDate(text: string | null | undefined, capturedAt: Date): string | null {
  if (!text) return null;
  const reference = new Date(`${dhakaDate(capturedAt)}T00:00:00Z`);
  const refYear = reference.getUTCFullYear();
  const s = toAsciiDigits(text.normalize("NFC"))
    .toLowerCase()
    .replace(/(তারিখ|তাং|তাঃ|date)\s*[:ঃ\-.]?/g, " ")
    .replace(/(ইং|খ্রিঃ|খ্রি|সাল|বাং|বঙ্গাব্দ)\.?/g, " ")
    .replace(/(\d)\s*(?:st|nd|rd|th|শে|লা|রা|ঠা|ই)(?=\s|$|[,./-])/g, "$1")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let date: Date | null = null;
  const numeric = s.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?:\s*[/.\-]\s*(\d{2}|\d{4}))?$/);
  const word = s.match(/^(?:(\d{1,2})\s*[\s.\-/]\s*([\p{L}\p{M}]+)|([\p{L}\p{M}]+)\s*[\s.\-/]?\s*(\d{1,2}))(?:\s*[\s.\-/]\s*(\d{2}|\d{4}))?$/u);

  if (numeric) {
    const [day, month] = [Number(numeric[1]), Number(numeric[2])];
    const y = numeric[3];
    date = y ? utc(y.length === 2 ? 2000 + Number(y) : Number(y), month, day) : closestYear((yr) => utc(yr, month, day), reference, refYear);
  } else if (word) {
    const day = Number(word[1] ?? word[4]);
    const name = word[2] ?? word[3]!;
    const y = word[5] ? Number(word[5]) : null;
    const gMonth = monthOf(name, GREGORIAN_MONTHS);
    const bMonth = gMonth == null ? monthOf(name, BANGLA_MONTHS) : null;
    if (gMonth != null) {
      date = y != null ? utc(word[5]!.length === 2 ? 2000 + y : y, gMonth, day) : closestYear((yr) => utc(yr, gMonth, day), reference, refYear);
    } else if (bMonth != null) {
      if (y == null) {
        // The Bangla year containing the photo's day starts on the 14 April on or before it.
        const bYear = refYear - 593 - (reference.getTime() < Date.UTC(refYear, 3, 14) ? 1 : 0);
        date = closestYear((by) => fromBanglaCalendar(by, bMonth, day), reference, bYear);
      } else if (word[5]!.length === 4) {
        date = fromBanglaCalendar(y, bMonth, day);
      }
    }
  }
  if (!date) return null;
  const diffDays = (date.getTime() - reference.getTime()) / DAY_MS;
  if (diffDays > MAX_AHEAD_DAYS || diffDays < -MAX_BEHIND_DAYS) return null;
  return iso(date);
}

/** The business date for a page: its written date when that parses, else the capture day. */
export function businessDateFor(dateText: string | null | undefined, capturedAt: Date): BusinessDate {
  const written = parseWrittenDate(dateText, capturedAt);
  return written ? { iso: written, source: "written" } : { iso: dhakaDate(capturedAt), source: "capture" };
}
