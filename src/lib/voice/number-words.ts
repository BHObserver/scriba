/**
 * Spoken numbers → digits, deterministically (P1 voice correction).
 *
 * Muse Voice Transcribe returns what was said as text: "একশো আশি", "দেড়শো", "সাড়ে তিন হাজার",
 * "৩ হাজার ২০০", sometimes digits. This module turns that text into the number(s) it names.
 * No model is involved, and nothing here guesses: when the text names more than one number the
 * caller gets all of them and the person picks; when it names none, the caller says so.
 *
 * Values are kept as integer thousandths ("milli") while parsing, so দেড় (1.5), সোয়া (+.25) and
 * পয়সা (.01) are exact. The result is an ASCII decimal string, the same form the keypad types.
 */
import { toAsciiDigits } from "@/lib/numerals";

export type SpokenNumber =
  | { kind: "one"; value: string }
  /** More than one different number was heard ("তিন কেজি ষাট টাকা"): the person picks one. */
  | { kind: "many"; values: string[] }
  | { kind: "none" };

type Token =
  | { t: "num"; milli: number; digit: boolean; tens?: boolean; en?: boolean }
  | { t: "mod"; milli: number }
  | { t: "scale"; times: number }
  | { t: "point" }
  | { t: "taka" }
  | { t: "poisha" }
  | { t: "and" }
  | { t: "gap" };

type NumToken = Extract<Token, { t: "num" }>;

const nfc = (s: string) => s.normalize("NFC");

// Standard Bangla number words 0–99 (Bangladesh spellings), then common spoken and written variants.
const BANGLA_WORDS: string[] = [
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "ঊনিশ",
  "বিশ", "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ",
  "ত্রিশ", "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ",
  "চল্লিশ", "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ",
  "পঞ্চাশ", "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট",
  "ষাট", "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর",
  "সত্তর", "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি",
  "আশি", "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই",
  "নব্বই", "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই",
];

const BANGLA_VARIANTS: Record<string, number> = {
  শুন্য: 0, শূণ্য: 0, জিরো: 0,
  দু: 2, ছ: 6,
  এগার: 11, তের: 13, চোদ্দ: 14, চোদ্দো: 14, পনের: 15, পনরো: 15, ষোল: 16, সতের: 17, আঠার: 18, আঠেরো: 18,
  কুড়ি: 20, তিরিশ: 30, বেয়াল্লিশ: 42, বায়ান্ন: 52, তেপ্পান্ন: 53, ছিষট্টি: 66, বায়াত্তর: 72, তেয়াত্তর: 73, ছেয়াত্তর: 76,
  নব্বুই: 90, নিরানব্বুই: 99,
};

// Only as the first half of a fused hundred ("বারশো"); alone, বার means "times".
const HUNDRED_PREFIX_ONLY: Record<string, number> = { বার: 12 };

const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const SMALL = new Map<string, number>();
for (const [n, w] of BANGLA_WORDS.entries()) SMALL.set(nfc(w), n);
for (const [w, n] of Object.entries(BANGLA_VARIANTS)) SMALL.set(nfc(w), n);
for (const [w, n] of [...SMALL]) {
  // ঊন/উন are both written; chandrabindu is often dropped (পাঁচ → পাচ).
  if (w.startsWith("ঊন")) SMALL.set(`উন${w.slice(2)}`, n);
  if (w.includes("ঁ")) SMALL.set(w.replaceAll("ঁ", ""), n);
}

/** Fractions that stand alone and can take a scale: দেড়শো = 150, আড়াই হাজার = 2,500. */
const FRACTIONS = new Map<string, number>([
  [nfc("দেড়"), 1500],
  [nfc("আড়াই"), 2500],
  [nfc("আধা"), 500],
  [nfc("আধ"), 500],
]);

/** Words that change the next number: সাড়ে তিন = 3.5, সোয়া দুই = 2.25, পৌনে পাঁচ = 4.75. */
const MODIFIERS = new Map<string, number>([
  [nfc("সাড়ে"), 500],
  [nfc("সোয়া"), 250],
  [nfc("সওয়া"), 250],
  [nfc("পৌনে"), -250],
  [nfc("পোনে"), -250],
]);

const SCALES = new Map<string, number>([
  [nfc("শো"), 100],
  [nfc("শ"), 100],
  [nfc("শত"), 100],
  [nfc("হাজার"), 1000],
  [nfc("লাখ"), 100_000],
  [nfc("লক্ষ"), 100_000],
  [nfc("কোটি"), 10_000_000],
  ["hundred", 100],
  ["thousand", 1000],
  ["lakh", 100_000],
  ["lakhs", 100_000],
  ["lac", 100_000],
  ["million", 1_000_000],
  ["crore", 10_000_000],
]);

const WORDS = new Map<string, Token>([
  [nfc("দশমিক"), { t: "point" }],
  [nfc("পয়েন্ট"), { t: "point" }],
  ["point", { t: "point" }],
  [nfc("টাকা"), { t: "taka" }],
  ["taka", { t: "taka" }],
  ["tk", { t: "taka" }],
  [nfc("পয়সা"), { t: "poisha" }],
  ["paisa", { t: "poisha" }],
  ["poisha", { t: "poisha" }],
  ["and", { t: "and" }],
]);

// Suffixes written onto a number word: fused scales (একশো, দুহাজার), then counters (তিনটা, দুটো, একটি).
const FUSED_SCALES = ["শত", "শো", "শ", "হাজার", "লাখ", "কোটি"].map(nfc);
const COUNTERS = ["টাকা", "খানা", "খানি", "খান", "টা", "টি", "টো", "টে", "জন"].map(nfc);

function numberWord(w: string): NumToken | null {
  const small = SMALL.get(w);
  if (small !== undefined) return { t: "num", milli: small * 1000, digit: false };
  const frac = FRACTIONS.get(w);
  if (frac !== undefined) return { t: "num", milli: frac, digit: false };
  const en = EN_UNITS.indexOf(w);
  if (en >= 0) return { t: "num", milli: en * 1000, digit: false, en: true };
  const tens = EN_TENS.indexOf(w);
  if (tens >= 2) return { t: "num", milli: tens * 10_000, digit: false, en: true, tens: true };
  return null;
}

/** One written word → its tokens. Exact words first, so দশ and বিশ are never read as "দ + শ". */
function wordTokens(w: string): Token[] {
  if (/^\d+(?:\.\d+)?$/.test(w)) {
    const [whole, frac = ""] = w.split(".");
    if (frac.length > 3 || whole!.length > 12) return [{ t: "gap" }];
    return [{ t: "num", milli: Number(whole) * 1000 + Number(frac.padEnd(3, "0")), digit: true }];
  }
  const exact = numberWord(w);
  if (exact) return [exact];
  const mod = MODIFIERS.get(w);
  if (mod !== undefined) return [{ t: "mod", milli: mod }];
  const scale = SCALES.get(w);
  if (scale !== undefined) return [{ t: "scale", times: scale }];
  const word = WORDS.get(w);
  if (word) return [word];
  for (const suffix of FUSED_SCALES) {
    if (!w.endsWith(suffix) || w.length === suffix.length) continue;
    const head = w.slice(0, -suffix.length);
    const first = numberWord(head) ?? (suffix === "শো" || suffix === "শ" ? prefixOnly(head) : null);
    if (first && !first.en) return [first, { t: "scale", times: SCALES.get(suffix)! }];
  }
  for (const suffix of COUNTERS) {
    if (!w.endsWith(suffix) || w.length === suffix.length) continue;
    const head = wordTokens(w.slice(0, -suffix.length));
    if (head.length > 0 && head.every((t) => t.t === "num" || t.t === "scale")) {
      return suffix === COUNTERS[0] ? [...head, { t: "taka" }] : head;
    }
  }
  return [{ t: "gap" }];
}

function prefixOnly(head: string): NumToken | null {
  const n = HUNDRED_PREFIX_ONLY[head];
  return n === undefined ? null : { t: "num", milli: n * 1000, digit: false };
}

export function tokenize(text: string): Token[] {
  const cleaned = toAsciiDigits(nfc(text))
    .toLowerCase()
    .replace(/[‌‍]/g, "")
    .replace(/(?<=\d),(?=\d)/g, "")
    // Split digits from letters written onto them: "৩টা", "১৮০টাকা", "2শো".
    .replace(/(\d)(?=[^\d.\s])/g, "$1 ")
    .replace(/([^\d.\s])(?=\d)/g, "$1 ")
    .replace(/['‘’`]/g, "")
    // Punctuation always separates numbers, so "তিন, চার" is two numbers, never 34.
    .replace(/[,;:!?।॥]+/g, " ¦ ");
  const tokens: Token[] = [];
  for (const raw of cleaned.split(/[\s"“”()\-–—/৳+*×=]+/)) {
    if (raw === "¦") {
      tokens.push({ t: "gap" });
      continue;
    }
    const w = raw.replace(/^\.+|\.+$/g, "").replace(/(?<=\D)\.|\.(?=\D)/g, "");
    if (w) tokens.push(...wordTokens(w));
  }
  return tokens;
}

type Segment = {
  /** Sum of the groups closed by a scale, in milli. */
  groups: number;
  /** The number waiting for a scale, or the last units. */
  current: number | null;
  /** The smallest scale used so far; the next one must be smaller. */
  lastScale: number;
  /** Set once taka is said; a number after it can only be poisha. */
  taka: boolean;
  /** True when the segment is a single bare digit word (for "এক আট শূন্য" → 180). */
  lone: boolean;
  /** True when the previous segment ended because this one started right after it. */
  adjacent: boolean;
};

const fresh = (adjacent = false): Segment => ({ groups: 0, current: null, lastScale: Infinity, taka: false, lone: false, adjacent });
const isDigit = (milli: number) => milli % 1000 === 0 && milli < 10_000;
const hasValue = (s: Segment) => s.current !== null || s.lastScale !== Infinity;
const valueOf = (s: Segment) => s.groups + (s.current ?? 0);
const safe = (n: number) => Number.isSafeInteger(n) && n >= 0;

function milliToDecimal(milli: number): string {
  const whole = Math.floor(milli / 1000);
  const frac = String(milli % 1000).padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

/**
 * Read the number(s) a transcript names. "একশো আশি" → 180, "দেড়শো" → 150, "সাড়ে তিন হাজার" → 3,500,
 * "আশি টাকা পঞ্চাশ পয়সা" → 80.5, "তিন দশমিক পাঁচ" → 3.5, "এক আট শূন্য" → 180, "৩ হাজার ২০০" → 3,200,
 * "one hundred and eighty" → 180.
 */
export function readSpokenNumbers(text: string): string[] {
  const tokens = tokenize(text);
  const done: Segment[] = [];
  let seg = fresh();
  let pendingMod: number | null = null;
  const close = (adjacentNext: boolean) => {
    if (hasValue(seg)) done.push(seg);
    seg = fresh(adjacentNext && hasValue(seg));
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const next = tokens[i + 1];
    switch (tok.t) {
      case "num": {
        let milli = tok.milli;
        if (pendingMod !== null) {
          if (milli % 1000 !== 0 || milli < 1000) {
            pendingMod = null;
            close(false);
            break;
          }
          milli += pendingMod;
          pendingMod = null;
        }
        if (seg.taka) {
          // "… টাকা পঞ্চাশ পয়সা": poisha after taka; any other number after taka is a new one.
          if (next?.t === "poisha" && milli % 1000 === 0 && milli < 100_000) {
            seg.groups += milli / 100;
            i++;
            close(false);
          } else {
            close(true);
            seg.current = milli;
            seg.lone = isDigit(milli);
          }
          break;
        }
        if (seg.current !== null) {
          const prev = tokens[i - 1];
          // English "twenty five"; Bangla never builds a number this way.
          if (tok.en && !tok.tens && prev?.t === "num" && prev.tens && milli < 10_000) {
            seg.current += milli;
            seg.lone = false;
            break;
          }
          close(true);
        } else if (seg.lastScale !== Infinity && milli >= seg.lastScale * 1000) {
          close(true);
        }
        seg.current = milli;
        seg.lone = seg.lastScale === Infinity && isDigit(milli);
        break;
      }
      case "mod":
        if (seg.current !== null || seg.taka) close(true);
        pendingMod = tok.milli;
        break;
      case "scale": {
        pendingMod = null;
        if (seg.taka || tok.times >= seg.lastScale) {
          // "দুই হাজার তিন হাজার": the তিন belongs to the second number.
          const carry = seg.taka ? null : seg.current;
          seg.current = null;
          close(true);
          seg.current = carry;
        }
        const times = seg.current ?? 1000;
        const add = times * tok.times;
        if (!safe(add) || !safe(seg.groups + add)) {
          seg = fresh();
          break;
        }
        seg.groups += add;
        seg.current = null;
        seg.lastScale = tok.times;
        seg.lone = false;
        break;
      }
      case "point": {
        pendingMod = null;
        // The decimals: digit words one by one ("পাঁচ শূন্য"), or one number ("পঁচিশ", "25").
        let digits = "";
        for (let d = tokens[i + 1]; d?.t === "num" && d.milli % 1000 === 0; d = tokens[i + 1]) {
          const one = isDigit(d.milli) && !d.digit;
          if (!one && digits) break;
          digits += String(d.milli / 1000);
          i++;
          if (!one) break;
        }
        if (digits) {
          // A point after a fraction, or more decimals than a gram, is not a number to place.
          if (!hasValue(seg) || valueOf(seg) % 1000 !== 0 || digits.length > 3) seg = fresh();
          else {
            seg.current = valueOf(seg) + Number(digits.padEnd(3, "0"));
            seg.groups = 0;
            seg.lone = false;
          }
        }
        close(false);
        break;
      }
      case "taka":
        pendingMod = null;
        if (hasValue(seg)) {
          seg.taka = true;
          seg.lone = false;
        }
        break;
      case "poisha":
        pendingMod = null;
        // "পঞ্চাশ পয়সা" alone is half a taka.
        if (seg.lastScale === Infinity && seg.current !== null && seg.current % 1000 === 0 && seg.current < 100_000) {
          seg.current = seg.current / 100;
          seg.lone = false;
        }
        close(false);
        break;
      case "and": {
        const joins = seg.lastScale !== Infinity && seg.lastScale >= 100 && seg.current === null && next?.t === "num";
        if (!joins) close(false);
        break;
      }
      case "gap":
        pendingMod = null;
        close(false);
        break;
    }
  }
  close(false);

  // Digits said one by one ("এক আট শূন্য") join into one number.
  const values: string[] = [];
  for (let k = 0; k < done.length; k++) {
    const s = done[k]!;
    if (!safe(valueOf(s))) continue;
    if (s.lone && done[k + 1]?.lone && done[k + 1]?.adjacent) {
      let run = String(valueOf(s) / 1000);
      while (done[k + 1]?.lone && done[k + 1]?.adjacent) run += String(valueOf(done[++k]!) / 1000);
      values.push(run.replace(/^0+(?=\d)/, ""));
    } else {
      values.push(milliToDecimal(valueOf(s)));
    }
  }
  return values;
}

/** One number, several (the person picks), or none. The same number said twice counts once. */
export function parseSpokenNumber(text: string): SpokenNumber {
  const values = [...new Set(readSpokenNumbers(text))];
  if (values.length === 0) return { kind: "none" };
  if (values.length === 1) return { kind: "one", value: values[0]! };
  return { kind: "many", values };
}
