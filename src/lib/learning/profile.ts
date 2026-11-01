/**
 * The writer profile (P3): what Scriba has learned about one shopkeeper's handwriting from
 * the audit trail, i.e. what the model read on each line (the extracted entry, never edited)
 * against what he confirmed.
 *
 * Pure and deterministic. It only counts: which digits of his were read as which other
 * digits, how many numbers he corrected lately, and which of his confirmed lines show his
 * digits best. Nothing here changes a number; the profile is a hint for the next reading,
 * and every reading is still checked and approved as before.
 */
import { createHash } from "node:crypto";
import { toAsciiDigits } from "@/lib/numerals";

export const NUMBER_FIELDS = ["quantityText", "rateText", "amountText", "balanceText"] as const;
export type NumberField = (typeof NUMBER_FIELDS)[number];
export type NumberTexts = Record<NumberField, string | null>;

export type LearningSample = {
  recordId: string;
  documentId: string;
  /** ISO time the line was confirmed; newest first decides ties and examples. */
  confirmedAt: string;
  /** What the model read on this line, or null for a line he added himself. */
  read: NumberTexts | null;
  confirmed: NumberTexts & { item: string | null; unit: string | null };
  /** The line can be cut from a real photo: it has a box and its page isn't a sample page. */
  hasCrop: boolean;
};

export type DigitSwap = { written: number; read: number };

export type Confusion = {
  /** The digit he wrote (as he confirmed it). */
  written: number;
  /** The digit the model read instead. */
  read: number;
  count: number;
  /** The lines that showed it, newest first. */
  recordIds: string[];
};

export type ReferenceLine = { recordId: string; documentId: string; text: string };

export type WriterProfile = {
  confusions: Confusion[];
  /** Numbers he changed on the latest pages, and how many pages that covers. */
  corrected: { numbers: number; pages: number };
  /** Corrected numbers that taught a digit swap: what "learned from N corrections" counts. */
  learnedFrom: number;
  references: ReferenceLine[];
};

export const RECENT_PAGES = 20;
export const MAX_REFERENCES = 4;
/** A swap seen once may be a slip of the pen; the prompt only hears about repeated ones. */
export const PROMPT_MIN_COUNT = 2;
export const PROMPT_MAX_CONFUSIONS = 5;

/** A number as compared: ASCII digits and the decimal point, nothing else. */
function numberKey(text: string | null): string {
  return text ? toAsciiDigits(text).replace(/[^0-9.]/g, "") : "";
}

/**
 * Digit-for-digit misreads between a model reading and the confirmed number. Only numbers
 * with the same count of digits are compared, and only when most digits agree: a dropped
 * digit or a different number altogether (a value read into the wrong field) says nothing
 * about how a digit is shaped.
 */
export function digitSwaps(read: string | null, confirmed: string | null): DigitSwap[] {
  const a = numberKey(read).replace(".", "");
  const b = numberKey(confirmed).replace(".", "");
  if (a.length === 0 || a.length !== b.length) return [];
  const swaps: DigitSwap[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) swaps.push({ written: Number(b[i]), read: Number(a[i]) });
  return swaps.length <= Math.max(1, Math.floor(a.length / 2)) ? swaps : [];
}

/** The number fields he changed on a line the model read. */
export function correctedFields(sample: LearningSample): NumberField[] {
  const read = sample.read;
  if (!read) return [];
  return NUMBER_FIELDS.filter((f) => numberKey(read[f]) !== numberKey(sample.confirmed[f]));
}

/** A confirmed line in words, for the prompt: never the line's free text, which may still hold the misread. */
export function describeLine(c: LearningSample["confirmed"]): string {
  const parts = [
    c.item ? `item ${c.item}` : null,
    c.quantityText ? `qty ${c.quantityText}${c.unit ? ` ${c.unit}` : ""}` : null,
    c.rateText ? `rate ${c.rateText}` : null,
    c.amountText ? `amount ${c.amountText}` : null,
    c.balanceText ? `balance ${c.balanceText}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

const newestFirst = (a: LearningSample, b: LearningSample) =>
  a.confirmedAt < b.confirmedAt ? 1 : a.confirmedAt > b.confirmedAt ? -1 : a.recordId < b.recordId ? -1 : 1;

/**
 * The profile from his confirmed lines. `excludeDocumentId` leaves one page out entirely,
 * so a page being read again never learns from itself (and F2 can measure on unseen pages).
 */
export function buildWriterProfile(
  all: readonly LearningSample[],
  opts: { excludeDocumentId?: string; recentPages?: number; maxReferences?: number } = {},
): WriterProfile {
  const samples = all.filter((s) => s.documentId !== opts.excludeDocumentId).sort(newestFirst);

  const byPair = new Map<string, Confusion>();
  const swapsOf = new Map<string, DigitSwap[]>();
  let learnedFrom = 0;
  for (const s of samples) {
    const swaps: DigitSwap[] = [];
    for (const f of correctedFields(s)) {
      const found = digitSwaps(s.read![f], s.confirmed[f]);
      if (found.length > 0) learnedFrom++;
      swaps.push(...found);
    }
    swapsOf.set(s.recordId, swaps);
    for (const w of swaps) {
      const key = `${w.written}>${w.read}`;
      const c = byPair.get(key) ?? { written: w.written, read: w.read, count: 0, recordIds: [] };
      c.count++;
      if (!c.recordIds.includes(s.recordId)) c.recordIds.push(s.recordId);
      byPair.set(key, c);
    }
  }
  // Ties: the pair seen most recently first (samples are newest first, so the first id is its latest).
  const order = (id: string) => samples.findIndex((s) => s.recordId === id);
  const confusions = [...byPair.values()].sort(
    (a, b) => b.count - a.count || order(a.recordIds[0]!) - order(b.recordIds[0]!) || a.written - b.written || a.read - b.read,
  );

  const recent: string[] = [];
  for (const s of samples) {
    if (!recent.includes(s.documentId)) recent.push(s.documentId);
    if (recent.length === (opts.recentPages ?? RECENT_PAGES)) break;
  }
  const numbers = samples.filter((s) => recent.includes(s.documentId)).reduce((n, s) => n + correctedFields(s).length, 0);

  return {
    confusions,
    corrected: { numbers, pages: recent.length },
    learnedFrom,
    references: pickReferences(samples, confusions, swapsOf, opts.maxReferences ?? MAX_REFERENCES),
  };
}

/**
 * Up to `max` lines that show his digits best: lines holding a digit he writes in a way the
 * model mixes up come first (the lines it misread before lead), one per page where possible,
 * newest first. Only lines that can be cut from a photo qualify.
 */
function pickReferences(
  samples: readonly LearningSample[],
  confusions: readonly Confusion[],
  swapsOf: ReadonlyMap<string, DigitSwap[]>,
  max: number,
): ReferenceLine[] {
  const hard = new Set(confusions.slice(0, PROMPT_MAX_CONFUSIONS).map((c) => String(c.written)));
  const digits = (s: LearningSample) => NUMBER_FIELDS.map((f) => numberKey(s.confirmed[f])).join("");
  const rank = (s: LearningSample) =>
    (swapsOf.get(s.recordId)?.length ? 0 : 2) + ([...digits(s)].some((d) => hard.has(d)) ? 0 : 1);
  const usable = samples
    .filter((s) => s.hasCrop && s.confirmed.amountText && describeLine(s.confirmed).length > 0)
    .map((s, i) => ({ s, i, r: rank(s) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.s);

  const picked: LearningSample[] = [];
  for (const s of usable) if (picked.length < max && !picked.some((p) => p.documentId === s.documentId)) picked.push(s);
  for (const s of usable) if (picked.length < max && !picked.includes(s)) picked.push(s);
  return picked.map((s) => ({ recordId: s.recordId, documentId: s.documentId, text: describeLine(s.confirmed) }));
}

export type PersonalHints = {
  /** The confusions the prompt mentions (seen at least twice), most frequent first. */
  confusions: Confusion[];
  references: ReferenceLine[];
  /** Changes whenever what is sent to the model changes: part of the extraction cache key. */
  key: string;
};

/** What a personalized reading sends, or null when the profile has nothing worth sending yet. */
export function personalHints(profile: WriterProfile): PersonalHints | null {
  const confusions = profile.confusions.filter((c) => c.count >= PROMPT_MIN_COUNT).slice(0, PROMPT_MAX_CONFUSIONS);
  if (confusions.length === 0 && profile.references.length === 0) return null;
  const canonical = JSON.stringify([
    confusions.map((c) => [c.written, c.read, c.count]),
    profile.references.map((r) => [r.recordId, r.text]),
  ]);
  return { confusions, references: profile.references, key: createHash("sha256").update(canonical).digest("hex").slice(0, 16) };
}
