/**
 * "Scriba asks" (U2): the questions Scriba puts to the shopkeeper about a page, and what each
 * answer changes. Pure data, shared by the engine, the answer route and the check screen.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import type { PartyKind } from "@/lib/ledger/parties";
import type { BlockKind, BlockValues, EntryValues, PageValues, ReviewableField } from "@/lib/ledger/types";
import type { NormalizedDoubt } from "@/lib/extraction/parse";
import type { MemoForPage } from "@/lib/memo/match";
import type { ReviewRow } from "@/lib/review/state";

export const QUESTION_KINDS = [
  /** What a block is: a company visit, a customer's account… */
  "meaning",
  /** A new name that may be a party already in the book ("Praan" = প্রাণ?). */
  "same_party",
  /** Whether a block of sales (or expenses) with no kind written is all one kind. */
  "block_kind",
  /** Which way money or goods went on one line (paid or received, due before or now). */
  "direction",
  /** A value the model was unsure of, with its candidate readings, or one that isn't a number. */
  "doubt",
  /** Goods with no price. */
  "price",
  /** Several goods from one visit with no price: one total for the delivery. */
  "delivery",
  /** An account with no "due before". */
  "opening",
  /** A sum that doesn't come out. */
  "unbalanced",
  /** A page with no date. */
  "date",
  /** U4: which visit a company's memo belongs to, when its name doesn't say. */
  "memo",
  /** U4: goods on the memo that aren't on the page. */
  "memo_extra",
  /** U4: a figure on the page that the memo gives differently. */
  "memo_differs",
  /**
   * T2: lines that may be a part of their own: after an account's first subtotal (asked by code),
   * or from a line he picked down ("from here, a separate part", never put to him unasked).
   */
  "split",
  /**
   * T3: a "before" read from the page that isn't what the khata shows for that party just before
   * the page: a misread digit, or a khata to correct.
   */
  "book_differs",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** One piece of a sentence. Text is as written (only its digits follow the language); money is in poisha. */
export type SentenceArg = { text: string } | { money: number } | { count: number } | { day: string } | { say: Sentence };
/** A sentence from the i18n dictionary, `{1}`, `{2}`… filled from `args`. */
export type Sentence = { key: MessageKey; args?: SentenceArg[] };

/** `verified`: code checked it against his records (the screen shows a tick), not only a reason. */
export type Why = { sentence: Sentence; verified: boolean };

/** One change an answer makes, applied through the same review rows and page as a manual edit. */
export type Change =
  /** Set values on a line; `checked` fields were looked at and kept as read. */
  | { op: "edit"; entry: string; values?: Partial<EntryValues>; checked?: ReviewableField[] }
  | { op: "reject"; entry: string }
  /** Add a line after `after` (null: at the top). */
  | { op: "add"; after: string | null; values: EntryValues }
  | { op: "date"; dateText: string }
  | { op: "block"; block: string; values: Partial<Omit<BlockValues, "id">> }
  /**
   * T2: a new part, just after `block` in the page's order, takes the block's open lines from
   * `from` to its end. `from` is never the block's first line.
   */
  | { op: "split"; block: string; from: string; values: SplitValues };

/** What the new part of a split is. */
export type SplitValues = { kind: BlockKind; party?: string | null; person?: string | null; title?: string | null };

export type QuestionOption = {
  /** Stable within its question: "yes", "type:cash_sale", "value:1", "later"… */
  id: string;
  label: Sentence;
  /** A second line under the label, worked out by code: "6 at ৳15 each". */
  detail?: Sentence;
  changes: Change[];
  /** For a reading or a number, the value it stands for (voice answers match on it). */
  value?: string;
  /** Problems this answer accepts as they are, as approval fingerprints. */
  accepts?: string[];
  /** Puts the question aside; it waits in `later` until the rest is done. */
  later?: boolean;
  /** Only moves the screen (to the lines in question). Nothing is saved. */
  local?: boolean;
};

/** What a typed or spoken answer fills in. */
export type ValueTarget =
  | { to: "entry"; entry: string; field: ReviewableField }
  | { to: "party"; block: string }
  | { to: "date" }
  | { to: "opening"; block: string | null; after: string | null }
  | { to: "delivery"; block: string; entries: string[]; after: string; type: EntryValues["type"] }
  /** T2: the name of whose account the lines from `from` down are: a split into a part of `kind`. */
  | { to: "split"; block: string; from: string; kind: BlockKind };

export type AnswerInput = {
  kind: "money" | "quantity" | "text" | "date";
  target: ValueTarget;
  /** What typing stands for, when it is one of the answers ("Someone else's account"), not just "Type it". */
  label?: Sentence;
};

export type Question = {
  /** Stable while its subject exists: "meaning:b1", "doubt:<row>:amount"… */
  id: string;
  kind: QuestionKind;
  /** The state the question is about. An answer is accepted only for the state it was given on. */
  fp: string;
  block: string | null;
  /** The line the question is about, if one (a review row id). */
  entry: string | null;
  field: ReviewableField | null;
  /** Every line the question touches, for the handwriting strips. */
  entries: string[];
  sentence: Sentence;
  /** A smaller line under the question: why Scriba asks, or what code found that helps him judge. */
  why: Why | null;
  options: QuestionOption[];
  /** The option one tap confirms, when Scriba has a reading to propose. Null: he must choose. */
  proposed: string | null;
  /** A keypad, voice or typed answer, when one is possible. */
  input: AnswerInput | null;
  /** U4: the company memo behind the question's figures (show its lines beside the page's). */
  memo?: MemoRef;
};

/** U4: the memo a question takes its figures from, and the memo lines it shows. */
export type MemoRef = { document: string; run: string; lines: string[] };

export type QuestionSet = {
  /** In the order to ask them: block by block down the page, then the page itself. */
  questions: Question[];
  /** Put aside with "later", to come back to before the page is sealed. */
  later: Question[];
};

/**
 * A party already in the book, for the "same party?" question and the khata's due (T3).
 * `mergedInto`: a spelling merged into another party. Its name is in the book (its due is that
 * party's), but it is never offered as a match.
 */
export type KnownParty = { id: string; kind: PartyKind; name: string; key: string; mergedInto?: string };

export type QuestionInput = {
  page: PageValues;
  rows: ReviewRow[];
  /** The model's doubts from the reading (schema 3); empty otherwise. */
  doubts: readonly NormalizedDoubt[];
  /** Unmerged parties of the shop. */
  parties: readonly KnownParty[];
  /** The day the photo was taken, in Bangladesh (YYYY-MM-DD), for the date question. */
  capturedOn: string | null;
  /**
   * What the khata showed for some of the parties just before this page, in poisha (positive:
   * they owe the shop, or the shop owes them): the parties `bookPartiesOf` names that have
   * anything in the book before the page. The "before" questions compare with it (T3), and "same
   * party?" says why it asks. Absent when not loaded.
   */
  dues?: ReadonlyMap<string, number>;
  /** U4: the company memos photographed with the page, with their latest readings. */
  memos?: readonly MemoForPage[];
};

/** An answer from the check screen: a chosen option, or a typed or spoken value. */
export type Answer = { option: string } | { value: string };
