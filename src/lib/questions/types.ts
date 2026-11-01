/**
 * "Scriba asks" (U2): the questions Scriba puts to the shopkeeper about a page, and what each
 * answer changes. Pure data, shared by the engine, the answer route and the check screen.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import type { PartyKind } from "@/lib/ledger/parties";
import type { BlockValues, EntryValues, PageValues, ReviewableField } from "@/lib/ledger/types";
import type { NormalizedDoubt } from "@/lib/extraction/parse";
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
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** One piece of a sentence. Text is as written (only its digits follow the language); money is in poisha. */
export type SentenceArg = { text: string } | { money: number } | { count: number } | { day: string } | { say: Sentence };
/** A sentence from the i18n dictionary, `{1}`, `{2}`… filled from `args`. */
export type Sentence = { key: MessageKey; args?: SentenceArg[] };

/** One change an answer makes, applied through the same review rows and page as a manual edit. */
export type Change =
  /** Set values on a line; `checked` fields were looked at and kept as read. */
  | { op: "edit"; entry: string; values?: Partial<EntryValues>; checked?: ReviewableField[] }
  | { op: "reject"; entry: string }
  /** Add a line after `after` (null: at the top). */
  | { op: "add"; after: string | null; values: EntryValues }
  | { op: "date"; dateText: string }
  | { op: "block"; block: string; values: Partial<Omit<BlockValues, "id">> };

export type QuestionOption = {
  /** Stable within its question: "yes", "type:cash_sale", "value:1", "later"… */
  id: string;
  label: Sentence;
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
  | { to: "delivery"; block: string; entries: string[]; after: string; type: EntryValues["type"] };

export type AnswerInput = { kind: "money" | "quantity" | "text" | "date"; target: ValueTarget };

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
  options: QuestionOption[];
  /** The option one tap confirms, when Scriba has a reading to propose. Null: he must choose. */
  proposed: string | null;
  /** A keypad, voice or typed answer, when one is possible. */
  input: AnswerInput | null;
};

export type QuestionSet = {
  /** In the order to ask them: block by block down the page, then the page itself. */
  questions: Question[];
  /** Put aside with "later", to come back to before the page is sealed. */
  later: Question[];
};

/** A party already in the book, for the "same party?" question. */
export type KnownParty = { id: string; kind: PartyKind; name: string; key: string };

export type QuestionInput = {
  page: PageValues;
  rows: ReviewRow[];
  /** The model's doubts from the reading (schema 3); empty otherwise. */
  doubts: readonly NormalizedDoubt[];
  /** Unmerged parties of the shop. */
  parties: readonly KnownParty[];
  /** The day the photo was taken, in Bangladesh (YYYY-MM-DD), for the date question. */
  capturedOn: string | null;
};

/** An answer from the check screen: a chosen option, or a typed or spoken value. */
export type Answer = { option: string } | { value: string };
