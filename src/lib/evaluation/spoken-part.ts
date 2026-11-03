/**
 * V1: score one spoken part of a page against its ground truth, offline. No call is made.
 *
 * He reads one part of the khata aloud; Muse Voice Transcribe returns text; the code reads the
 * numbers from it (number-words.ts), as the app would. This says which of the part's written
 * figures came through, in order, which item and name words did, and which marker words he used
 * (মোট, আগের, দিলাম…), so the voice sessions can be designed from what he actually says.
 * Pure, like metrics.ts.
 */
import { parseMoney, parseQuantity } from "@/lib/numerals";
import { readSpokenNumbers } from "@/lib/voice/number-words";
import type { GroundTruth, GroundTruthEntry } from "./ground-truth";
import type { Ratio } from "./metrics";

/** A block from a ground truth's informal `_blocks`. */
export type TruthBlock = { id: string; kind: string; party?: string | null; person?: string | null; title?: string | null; lines: number[] };

/** What a written figure is: a line's money, a written total, the old due, a payment, or a count. */
export type FigureRole = "amount" | "total" | "before" | "paid" | "qty";
export type ExpectedFigure = { line: number; role: FigureRole; value: string };
export type ExpectedWord = { role: "item" | "name"; word: string };
export type ExpectedPart = { figures: ExpectedFigure[]; words: ExpectedWord[]; markers: MarkerGroup[] };

/** Words that say what a figure is. Grouped by meaning; a part expects a group when it has such a line. */
export const MARKERS = {
  total: ["মোট", "সর্বমোট", "টোটাল", "total"],
  before: ["আগের", "আগে", "পুরান", "পুরানো", "পুরাতন"],
  paid: ["দিলাম", "দিছি", "দিয়েছি", "দিলো", "দিল", "দিছে", "দিয়েছে", "জমা", "পরিশোধ", "শোধ"],
  credit: ["বাকি", "বাকিতে", "বাঁকি"],
  visit: ["আসছিল", "আসছিলো", "এসেছিল", "এসেছিলো", "আসছে", "আইছিল"],
} as const;
export type MarkerGroup = keyof typeof MARKERS;

const ROLE_OF: Partial<Record<GroundTruthEntry["type"], FigureRole>> = {
  subtotal: "total",
  closing_balance: "total",
  opening_balance: "before",
  supplier_payment: "paid",
  repayment: "paid",
};

// The figure as a plain decimal, the form readSpokenNumbers returns ("140", "0.5").
const money = (text: string | null) => {
  const p = parseMoney(text);
  return p.ok ? String(p.value / 100) : null;
};
const quantity = (text: string | null) => {
  const p = parseQuantity(text);
  return p.ok ? String(p.value / 1000) : null;
};

/** What a reading of this part should carry: its written figures in page order, its words, its marker groups. */
export function expectedPart(truth: GroundTruth, block: TruthBlock): ExpectedPart {
  const lines = block.lines.map((n) => truth.entries.find((e) => e.line === n)).filter((e): e is GroundTruthEntry => e !== undefined);
  const figures: ExpectedFigure[] = [];
  const words: ExpectedWord[] = [];
  const markers = new Set<MarkerGroup>();
  const addWord = (role: ExpectedWord["role"], word: string | null | undefined) => {
    const w = word?.trim().normalize("NFC");
    if (w && !words.some((x) => x.word === w)) words.push({ role, word: w });
  };
  addWord("name", block.party);
  addWord("name", block.person);
  if (block.kind === "supplier_visit") markers.add("visit");
  for (const e of lines) {
    addWord("name", e.customer);
    addWord("item", e.item);
    const qty = quantity(e.quantity);
    if (qty !== null) figures.push({ line: e.line, role: "qty", value: qty });
    const role = ROLE_OF[e.type] ?? "amount";
    const amount = money(e.amount);
    if (amount !== null) figures.push({ line: e.line, role, value: amount });
    const balance = money(e.balance);
    if (balance !== null) figures.push({ line: e.line, role: "total", value: balance });
    if (role === "total" || role === "before" || role === "paid") markers.add(role);
    if (e.type === "credit_sale" && e.customer) markers.add("credit");
  }
  return { figures, words, markers: [...markers] };
}

export type FigureResult = ExpectedFigure & { heard: boolean };
export type WordResult = ExpectedWord & { found: "exact" | "near" | null };
export type PartScore = {
  /** The numbers the code reads from the transcript, in order. */
  heard: string[];
  figures: FigureResult[];
  /** Heard numbers paired with no written figure. */
  extra: string[];
  words: WordResult[];
  /** Marker groups he said, and the expected groups he didn't. */
  said: MarkerGroup[];
  unsaid: MarkerGroup[];
};

const same = (a: string, b: string) => Math.round(Number(a) * 1000) === Math.round(Number(b) * 1000);

/** Pair written figures with heard numbers in order (no crossing), as many as possible. */
function alignFigures(expected: ExpectedFigure[], heard: string[]): { figures: FigureResult[]; extra: string[] } {
  const best = Array.from({ length: expected.length + 1 }, () => new Array<number>(heard.length + 1).fill(0));
  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= heard.length; j++) {
      best[i]![j] = same(expected[i - 1]!.value, heard[j - 1]!) ? best[i - 1]![j - 1]! + 1 : Math.max(best[i - 1]![j]!, best[i]![j - 1]!);
    }
  }
  const hit = new Array<boolean>(expected.length).fill(false);
  const used = new Array<boolean>(heard.length).fill(false);
  for (let i = expected.length, j = heard.length; i > 0 && j > 0; ) {
    if (same(expected[i - 1]!.value, heard[j - 1]!) && best[i]![j] === best[i - 1]![j - 1]! + 1) {
      hit[--i] = true;
      used[--j] = true;
    } else if (best[i - 1]![j]! >= best[i]![j - 1]!) i--;
    else j--;
  }
  return { figures: expected.map((f, k) => ({ ...f, heard: hit[k]! })), extra: heard.filter((_, k) => !used[k]) };
}

// Spellings a transcript may choose differently: chandrabindu, nukta (NFC splits য় ড় ঢ়), hasanta,
// ণ/ন, long and short ি ু, the three sibilants, ৎ/ত.
export function looseKey(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u0981\u09BC\u09CD\u0983\u200C\u200D]/g, "")
    .replace(/ণ/g, "ন")
    .replace(/ী/g, "ি")
    .replace(/ূ/g, "ু")
    .replace(/[শষ]/g, "স")
    .replace(/ৎ/g, "ত");
}

const tokensOf = (text: string) =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Edits (insert, delete, change one letter) between two words; stops counting past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

/** Score one transcript against what its part should carry. */
export function scorePart(expected: ExpectedPart, transcript: string): PartScore {
  const heard = readSpokenNumbers(transcript);
  const { figures, extra } = alignFigures(expected.figures, heard);
  const text = transcript.normalize("NFC").toLowerCase();
  const loose = looseKey(transcript);
  const tokens = tokensOf(transcript).map(looseKey);
  // Near: the same after looseKey, or one letter off for a long word (বিস্কিট for বিস্কুট), also when
  // a suffix follows (বিস্কিটের). Short words stay exact: চাল and ডাল are one letter apart.
  const near = (word: string) => {
    const key = looseKey(word);
    if (loose.includes(key)) return true;
    return key.length >= 5 && tokens.some((t) => editDistance(t, key, 1) <= 1 || editDistance(t.slice(0, key.length), key, 1) <= 1);
  };
  const words = expected.words.map((w): WordResult => {
    const found = text.includes(w.word.toLowerCase()) ? "exact" : near(w.word) ? "near" : null;
    return { ...w, found };
  });
  // A marker counts when a word of the transcript is one, or starts with one (আগেরটা, জমাদিল).
  const said = (Object.keys(MARKERS) as MarkerGroup[]).filter((g) =>
    MARKERS[g].some((m) => {
      const key = looseKey(m);
      return tokens.some((t) => t === key || (key.length >= 3 && t.startsWith(key)));
    }),
  );
  return { heard, figures, extra, words, said, unsaid: expected.markers.filter((g) => !said.includes(g)) };
}

/** Money figures heard (every role but counts), counts heard, and words found exactly or nearly. */
export function partRatios(score: PartScore): { money: Ratio; qty: Ratio; words: Ratio } {
  const ratio = (xs: boolean[]): Ratio => ({ numerator: xs.filter(Boolean).length, denominator: xs.length });
  return {
    money: ratio(score.figures.filter((f) => f.role !== "qty").map((f) => f.heard)),
    qty: ratio(score.figures.filter((f) => f.role === "qty").map((f) => f.heard)),
    words: ratio(score.words.map((w) => w.found !== null)),
  };
}
