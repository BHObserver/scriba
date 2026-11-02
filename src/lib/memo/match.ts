/**
 * U4: which visit a company memo belongs to, and which of its lines is which handwritten goods
 * line. Pure TypeScript: it only proposes, and every proposal is put to the shopkeeper.
 *
 * Names are compared the way "same party?" compares them (`romanize`): a rough common Latin
 * spelling, so জুস meets "Juice" and প্রাণ meets "PRAN Agro Ltd.". Item names on a memo are
 * longer than on the page ("PRAN Potato Biscuit 40g" against "Buiscite"), so they are compared
 * word by word, without the company's own name, sizes and pack words.
 *
 * A pair is sure only when each side is the other's single best match. A name that matches
 * nothing is never paired by guesswork, with one exception: the last goods line and the last
 * memo line left over are paired when their quantities agree.
 */
import { normalizePartyName } from "@/lib/ledger/parties";
import { romanize } from "@/lib/questions/similar";
import type { NormalizedMemo, MemoLine } from "./parse";

/** A memo photographed with a page, with its latest reading. */
export type MemoForPage = { documentId: string; runId: string; memo: NormalizedMemo };

// Words that say nothing about which product it is: company forms, packs, units, "free".
const NOISE = new Set(
  [
    "ltd", "limited", "co", "company", "group", "industries", "industry", "foods", "food", "agro", "products", "product",
    "distribution", "distributor", "distributors", "enterprise", "enterprises", "traders", "trading", "corporation", "corp",
    "plc", "bd", "bangladesh", "and", "the", "of",
    "ctn", "carton", "cartons", "box", "boxes", "pcs", "pc", "piece", "pieces", "pack", "packs", "packet", "packets", "bag",
    "bags", "bottle", "bottles", "jar", "can", "tin", "dozen", "doz", "ml", "ltr", "litre", "liter", "l", "kg", "gm", "gram",
    "grams", "g", "free", "bonus", "new", "mini", "family", "pouch",
    "লিমিটেড", "লিঃ", "কোম্পানি", "গ্রুপ", "ইন্ডাস্ট্রিজ", "ফুডস", "এগ্রো", "কার্টুন", "কার্টন", "বক্স", "প্যাকেট", "পিস", "বস্তা", "কেজি",
    "গ্রাম", "লিটার", "টা", "টি", "ডজন", "বোতল", "ফ্রি",
  ].map((w) => normalizePartyName(w)!),
);

/** The words that name a thing, each in its rough Latin spellings (soft or hard "c", with or without a plural "s"). */
function words(text: string | null | undefined, drop: ReadonlySet<string> = NOISE): string[][] {
  const key = normalizePartyName(text);
  if (!key) return [];
  return key
    .split(" ")
    .filter((w) => !/[0-9]/.test(w) && !NOISE.has(w) && !drop.has(w))
    .map((w) => {
      const latin = /^[a-z]+$/.test(w);
      const forms = latin && w.length >= 4 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w];
      // English spelling: a "c" before e, i or y sounds like "s" (juice, rice), else like "k".
      const spellings = forms.flatMap((f) => [romanize(latin ? f.replace(/c(?=[eiy])/g, "s") : f), romanize(f)]);
      return [...new Set(spellings)].filter((r) => r.length >= 2);
    })
    .filter((variants) => variants.length > 0);
}

/** The consonants of a spelling, with "c" (from ch) and "k" as one sound. */
const skeleton = (latin: string) => latin.replace(/[aeiou ]/g, "").replace(/c/g, "k");

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      prev[j] = Math.min(above + 1, prev[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length]!;
}

/** 2: the same word; 1: a likely spelling of it; 0: not alike. */
function wordScore(a: readonly string[], b: readonly string[]): number {
  let best = 0;
  for (const x of a) {
    for (const y of b) {
      if (x === y) return 2;
      const sx = skeleton(x);
      const alike =
        (sx.length >= 2 && sx === skeleton(y)) ||
        (Math.min(x.length, y.length) >= 5 && editDistance(x, y) <= 1) ||
        (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
      if (alike) best = 1;
    }
  }
  return best;
}

/** How alike two names are: the best of their words (2, 1 or 0). */
export function nameScore(a: string | null | undefined, b: string | null | undefined, drop?: ReadonlySet<string>): number {
  const wa = words(a, drop);
  const wb = words(b, drop);
  let best = 0;
  for (const x of wa) for (const y of wb) best = Math.max(best, wordScore(x, y));
  return best;
}

/** The company's own words, left out when items are compared ("PRAN" in "PRAN Mango Juice"). */
export function companyWords(memo: NormalizedMemo): Set<string> {
  return new Set((normalizePartyName(memo.company) ?? "").split(" ").filter(Boolean));
}

// ---------------------------------------------------------------------------
// Which visit
// ---------------------------------------------------------------------------

/** A block the memo may belong to: the company and rep written for it. */
export type VisitCandidate = { block: string; party: string | null; person: string | null };

/**
 * The blocks whose company or rep is named on the memo. One: the memo is theirs. None or
 * several: Scriba asks.
 */
export function blocksNamedOnMemo(memo: NormalizedMemo, candidates: readonly VisitCandidate[]): string[] {
  const named = (c: VisitCandidate) =>
    nameScore(memo.company, c.party) > 0 || (memo.person != null && c.person != null && nameScore(memo.person, c.person) > 0);
  return candidates.filter(named).map((c) => c.block);
}

// ---------------------------------------------------------------------------
// Which line
// ---------------------------------------------------------------------------

/** A goods line on the page, as matching needs it. */
export type GoodsLine = { id: string; item: string | null; quantityMilli: number | null };

export type LinePair = {
  goods: string;
  line: string;
  /** Each is the other's only best match (or the last two left, with the same quantity). */
  sure: boolean;
};

export type Pairing = {
  /** Sure pairs, and for goods with no sure pair, the memo lines they may be (best first, at most 3). */
  pairs: LinePair[];
  /** Memo lines no goods line may be. */
  unmatched: string[];
};

const MAX_CANDIDATES = 3;

/**
 * Pair the page's goods with the memo's lines. Crossed-out memo lines take no part. A goods line
 * may have several unsure candidates; a memo line belongs to at most one sure pair.
 */
export function pairLines(goods: readonly GoodsLine[], memo: NormalizedMemo): Pairing {
  const lines = memo.lines.filter((l) => !l.crossedOut);
  const drop = companyWords(memo);
  const sameQty = (g: GoodsLine, l: MemoLine) => g.quantityMilli != null && g.quantityMilli === l.quantityMilli;
  // Name first; the same quantity only breaks a tie between names that are equally alike.
  const score = new Map<string, number>();
  for (const g of goods) {
    for (const l of lines) {
      const s = nameScore(g.item, l.item ?? l.text, drop);
      if (s > 0) score.set(`${g.id}|${l.id}`, s * 2 + (sameQty(g, l) ? 1 : 0));
    }
  }
  const at = (g: string, l: string) => score.get(`${g}|${l}`) ?? 0;
  const onlyBest = <T>(items: readonly T[], of: (x: T) => number): T | null => {
    const top = Math.max(0, ...items.map(of));
    const best = items.filter((x) => of(x) === top);
    return top > 0 && best.length === 1 ? best[0]! : null;
  };

  const pairs: LinePair[] = [];
  const taken = new Set<string>();
  const done = new Set<string>();
  for (const g of goods) {
    const l = onlyBest(lines, (x) => at(g.id, x.id));
    if (l && onlyBest(goods, (x) => at(x.id, l.id)) === g) {
      pairs.push({ goods: g.id, line: l.id, sure: true });
      taken.add(l.id);
      done.add(g.id);
    }
  }
  // The last goods line and the last memo line left over, with the same quantity.
  const goodsLeft = goods.filter((g) => !done.has(g.id));
  const linesLeft = lines.filter((l) => !taken.has(l.id));
  if (goodsLeft.length === 1 && linesLeft.length === 1 && sameQty(goodsLeft[0]!, linesLeft[0]!)) {
    pairs.push({ goods: goodsLeft[0]!.id, line: linesLeft[0]!.id, sure: true });
    taken.add(linesLeft[0]!.id);
    done.add(goodsLeft[0]!.id);
  }
  const maybe = new Set<string>();
  for (const g of goods.filter((x) => !done.has(x.id))) {
    const candidates = lines
      .filter((l) => !taken.has(l.id) && at(g.id, l.id) > 0)
      .sort((a, b) => at(g.id, b.id) - at(g.id, a.id))
      .slice(0, MAX_CANDIDATES);
    for (const l of candidates) {
      pairs.push({ goods: g.id, line: l.id, sure: false });
      maybe.add(l.id);
    }
  }
  return { pairs, unmatched: lines.filter((l) => !taken.has(l.id) && !maybe.has(l.id)).map((l) => l.id) };
}
