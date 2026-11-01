/**
 * Names that may be the same party (U2): "Praan" and প্রাণ, "Fresh" and ফ্রেশ, করিম and Karim.
 *
 * Parties are linked by `normalizePartyName`, which only folds spelling variants within one
 * script. A khata mixes scripts, so a name read today may be a party already in the book under
 * another spelling. This only proposes: Scriba asks, and the shopkeeper says yes or no. Nothing
 * is merged here, so a loose match costs one "no" and a missed one is never a wrong number.
 *
 * Both names are written in a rough common Latin spelling, then compared three ways: the same
 * spelling, the same consonants (Bangla leaves the inherent vowel unwritten: করিম → "krim"), or
 * one letter apart on names of five letters or more.
 */
import { normalizePartyName } from "@/lib/ledger/parties";

const INDEPENDENT: Record<string, string> = {
  অ: "o", আ: "a", ই: "i", ঈ: "i", উ: "u", ঊ: "u", ঋ: "ri", এ: "e", ঐ: "oi", ও: "o", ঔ: "ou",
};
const SIGNS: Record<string, string> = {
  "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou",
};
const CONSONANTS: Record<string, string> = {
  ক: "k", খ: "kh", গ: "g", ঘ: "gh", ঙ: "ng", চ: "ch", ছ: "ch", জ: "j", ঝ: "jh", ঞ: "n",
  ট: "t", ঠ: "th", ড: "d", ঢ: "dh", ণ: "n", ত: "t", থ: "th", দ: "d", ধ: "dh", ন: "n",
  প: "p", ফ: "f", ব: "b", ভ: "bh", ম: "m", য: "j", র: "r", ল: "l", শ: "sh", ষ: "sh",
  স: "s", হ: "h", "ৎ": "t", "ং": "ng",
};
// NFC writes য়, ড়, ঢ় as a letter followed by the nukta sign.
const NUKTA = "\u09BC";
const WITH_NUKTA: Record<string, string> = { "\u09AF": "y", "\u09A1": "r", "\u09A2": "r" };
// Signs that add no letter: hasanta, visarga, chandrabindu, nukta, zero-width joiners.
const SILENT = new Set(["\u09CD", "\u0983", "\u0981", NUKTA, "\u200C", "\u200D"]);

// Applied to both sides after romanizing, longest first, so English and Bangla spellings meet.
const LATIN_FOLDS: Array<[RegExp, string]> = [
  [/c(?!h)/g, "k"],
  [/q/g, "k"],
  [/ph/g, "f"],
  [/sh/g, "s"],
  [/(k|g|j|t|d|b)h/g, "$1"],
  [/ch/g, "c"],
  [/z/g, "j"],
  [/v/g, "b"],
  [/w/g, "o"],
  [/x/g, "ks"],
  [/ee|y/g, "i"],
  [/oo/g, "u"],
  [/([a-z])\1+/g, "$1"],
];

/** A rough Latin spelling of a name in either script, for comparing only. */
export function romanize(name: string): string {
  const key = normalizePartyName(name);
  if (!key) return "";
  const chars = [...key];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (chars[i + 1] === NUKTA && WITH_NUKTA[ch]) {
      out += WITH_NUKTA[ch];
      i++;
    } else if (!SILENT.has(ch)) {
      out += CONSONANTS[ch] ?? INDEPENDENT[ch] ?? SIGNS[ch] ?? (/[a-z0-9 ]/.test(ch) ? ch : "");
    }
  }
  let latin = out.replace(/\s+/g, " ").trim();
  for (const [re, to] of LATIN_FOLDS) latin = latin.replace(re, to);
  return latin;
}

function consonants(latin: string): string {
  return latin.replace(/[aeiou ]/g, "");
}

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

/** True when two names may be the same party. Names with the same party key are not "similar": they are the same. */
export function soundsAlike(a: string, b: string): boolean {
  const ka = normalizePartyName(a);
  const kb = normalizePartyName(b);
  if (!ka || !kb || ka === kb) return false;
  const ra = romanize(a);
  const rb = romanize(b);
  if (ra.length === 0 || rb.length === 0) return false;
  if (ra === rb) return true;
  const ca = consonants(ra);
  if (ca.length >= 2 && ca === consonants(rb)) return true;
  // Short names one letter apart are usually different people (রহিম, করিম).
  return Math.min(ra.length, rb.length) >= 5 && editDistance(ra, rb) <= 1;
}
