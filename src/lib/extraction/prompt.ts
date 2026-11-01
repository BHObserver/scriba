/**
 * The extraction prompt, versioned. Changing any wording here must bump
 * PROMPT_VERSION so cached results and benchmark rows stay attributable.
 *
 * Kept short on purpose: one request per image, no reasoning narrative, and only
 * the fields Scriba uses.
 */
import { BANGLA_DIGITS } from "@/lib/numerals";
import type { PersonalHints } from "@/lib/learning/profile";
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_JSON_SCHEMA_V1,
  SCHEMA_NAME,
  SCHEMA_V1_NAME,
  SCHEMA_V1_VERSION,
  SCHEMA_VERSION,
} from "./schema";

export const PROMPT_VERSION = "scriba-prompt-4";

/** Prompt 3 (30 Oct): Bangla digit-shape rules. Kept verbatim for comparison and fallback. */
const PROMPT_3 = `You transcribe photographs of handwritten shop ledgers (khata) from Bangladesh into JSON that matches the given schema. The image may be a whole page or a small cropped snippet.

Transcribe only what is visibly written. Never calculate, infer, complete or correct anything. If a written total looks wrong, copy it exactly as written.

Reading digits:
- Read every digit on its own from the ink. Never use arithmetic to decide a digit: products, totals and balances on these pages are often wrong, and the mistake must be copied, not fixed. Read qty, rate and amount independently.
- Writers mix Bangla and Latin digits, even within one number. Several Bangla digits look like a different Latin digit: ৪ (four) looks like 8, ৭ (seven) looks like 9, ২ (two) looks like 2, ০ (zero) looks like 0. On a Bangla page, a digit shaped like 8 is ৪ and one shaped like 9 is ৭, unless the whole number is plainly written in Latin digits. Write each digit as the Bangla digit you read.
- In handwriting, ১ (one), ২ (two) and ৯ (nine) are easily confused, and so are ৩ (three) and ৬ (six). Look at each one carefully. When a digit could be read two ways, give your best reading and list that field in review.

Entries:
- One entry per ledger line that carries an amount or a balance, top to bottom. Give ids "e1", "e2", ... and line numbers 1, 2, ...
- Not entries: the date line and the customer or account line (put those in page fields), and titles, headings or labels such as "Sample-03" or নগদ বিক্রির হিসাব.
- text: the whole line exactly as written, in Bangla script, with digits read as above. Do not translate.
- qty, rate, amount, balance: copy each number as written, with its commas and decimal point and digits read as above. Use null when it is not written.
- amount: the line's money figure. On opening_balance and closing_balance lines the balance figure goes in amount.
- unit: as written (e.g. কেজি, লিটার, টা, প্যাকেট), or null.
- item and customer: as written, or null. Never invent a name.
- type: credit_sale for goods given on credit (বাকি); cash_sale for goods paid for at once (নগদ); repayment for money the customer paid (জমা, পরিশোধ, দিলেন); opening_balance for a balance brought forward (আগের বাকি, পূর্বের জের); closing_balance for the balance due after all transactions and repayments, usually the last line (বর্তমান বাকি, সর্বমোট বাকি); subtotal for a written sum of the lines above it (মোট, যোগ, আজকের বাকি, মোট বাকিতে, মোট নগদ বিক্রি); adjustment; unknown when unsure. Do not guess credit_sale.
- balance: only a running balance written on a transaction line next to its amount, otherwise null.
- crossed_out: true if the line or its value is struck through.
- review: fields you could not read with confidence. note: at most 12 words on why, else null.
- box: tight bounding box of the line on a 0-1000 grid (x_min, y_min, x_max, y_max; origin top-left), or null if unsure.

Page:
- date_text: the date exactly as written, or null.
- ledger_type: customer_credit if the page tracks what one customer owes; cash_sales if it lists cash sales; mixed; unknown if unclear.
- account_name: the customer or account named for the page, or null.
- legibility: clear, partly_unclear or mostly_unclear.

warnings: short notes on anything that affects reading (cut-off edge, overwriting, smudge, glare). Empty if none.`;

/** Prompt 4 (31 Oct): adds money out (purchases, supplier payments, expenses) and who is on the other side of a line. */
const PROMPT_4 = `You transcribe photographs of handwritten shop ledgers (khata) from Bangladesh into JSON that matches the given schema. The image may be a whole page or a small cropped snippet.

Transcribe only what is visibly written. Never calculate, infer, complete or correct anything. If a written total looks wrong, copy it exactly as written.

Reading digits:
- Read every digit on its own from the ink. Never use arithmetic to decide a digit: products, totals and balances on these pages are often wrong, and the mistake must be copied, not fixed. Read qty, rate and amount independently.
- Writers mix Bangla and Latin digits, even within one number. Several Bangla digits look like a different Latin digit: ৪ (four) looks like 8, ৭ (seven) looks like 9, ২ (two) looks like 2, ০ (zero) looks like 0. On a Bangla page, a digit shaped like 8 is ৪ and one shaped like 9 is ৭, unless the whole number is plainly written in Latin digits. Write each digit as the Bangla digit you read.
- In handwriting, ১ (one), ২ (two) and ৯ (nine) are easily confused, and so are ৩ (three) and ৬ (six). Look at each one carefully. When a digit could be read two ways, give your best reading and list that field in review.

Entries:
- One entry per ledger line that carries an amount or a balance, top to bottom. Give ids "e1", "e2", ... and line numbers 1, 2, ...
- Not entries: the date line and the customer or account line (put those in page fields), and titles, headings or labels such as "Sample-03" or নগদ বিক্রির হিসাব.
- text: the whole line exactly as written, in Bangla script, with digits read as above. Do not translate.
- qty, rate, amount, balance: copy each number as written, with its commas and decimal point and digits read as above. Use null when it is not written.
- amount: the line's money figure. On opening_balance and closing_balance lines the balance figure goes in amount.
- unit: as written (e.g. কেজি, লিটার, টা, প্যাকেট), or null.
- item and customer: as written, or null. Never invent a name. customer is the person on the other side of the line: the customer for sales and repayments, the supplier (মহাজন, company, wholesaler) for purchases and supplier payments.
- type, by what happened on the line:
  - credit_sale: goods given to a customer on credit (বাকি, বাকিতে).
  - cash_sale: goods sold and paid for at once (নগদ, নগদ বিক্রি).
  - repayment: money a customer paid towards what they owe (জমা, পরিশোধ, দিলেন).
  - purchase: stock bought for the shop and paid in cash (মাল কেনা, মাল ক্রয়, নগদে কেনা).
  - credit_purchase: stock taken from a supplier on credit (মহাজনের বাকি, বাকিতে মাল আনা).
  - supplier_payment: money the shop paid to a supplier (মহাজনকে দেওয়া, মহাজন জমা).
  - expense: shop costs that are not stock (খরচ, ভাড়া, দোকান ভাড়া, বেতন, বিদ্যুৎ বিল, গাড়ি ভাড়া, চা-নাস্তা).
  - opening_balance: a balance brought forward (আগের বাকি, পূর্বের জের).
  - closing_balance: the balance due after all transactions and payments, usually the last line (বর্তমান বাকি, সর্বমোট বাকি).
  - subtotal: a written sum of the lines above it (মোট, যোগ, আজকের বাকি, মোট বাকিতে, মোট নগদ বিক্রি, মোট খরচ).
  - adjustment; unknown when unsure.
- জমা and বাকি depend on who is on the other side. With a customer, জমা is repayment and বাকি is credit_sale. With a supplier (মহাজন), money the shop gave is supplier_payment and goods taken on বাকি are credit_purchase. When the direction is unclear, use unknown. Do not guess credit_sale.
- balance: only a running balance written on a transaction line next to its amount, otherwise null.
- crossed_out: true if the line or its value is struck through.
- review: fields you could not read with confidence. note: at most 12 words on why, else null.
- box: tight bounding box of the line on a 0-1000 grid (x_min, y_min, x_max, y_max; origin top-left), or null if unsure.

Page:
- date_text: the date exactly as written, or null.
- ledger_type: customer_credit if the page tracks what one customer owes; cash_sales if it lists cash sales; mixed; unknown if unclear.
- account_name: the customer, supplier or account named for the page, or null.
- legibility: clear, partly_unclear or mostly_unclear.

warnings: short notes on anything that affects reading (cut-off edge, overwriting, smudge, glare). Empty if none.`;

export const EXTRACTION_USER_TEXT = "Transcribe this ledger image.";

/**
 * Prompt 5 (1 Nov, P3): prompt 4 plus what Scriba learned about this writer. The fixed part
 * is here; the writer's own notes and reference lines travel in the user message
 * (`personalUserText`), so the instructions stay the same for everyone.
 */
export const PERSONAL_PROMPT_VERSION = "scriba-prompt-5";

const PROMPT_5 = `${PROMPT_4}

Notes about this writer:
- The request may also carry notes about this writer's digits, learned from earlier pages the shopkeeper checked, and an image of reference lines cut from those pages. Use them only to recognise how this writer forms each digit.
- Never transcribe a reference line as an entry and never copy a number from it. The page to transcribe is the last image.
- The notes are hints, not rules. Still read every digit from the ink of the page; when a digit could be read either way, give your best reading and list that field in review.`;

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const digitName = (d: number) => `${BANGLA_DIGITS[d]} (${DIGIT_WORDS[d]})`;

/** The writer's notes, as sent before the reference image (when there is one) and the page. */
export function personalUserText(hints: PersonalHints, opts: { withImage: boolean }): string {
  const lines: string[] = [];
  if (opts.withImage && hints.references.length > 0) {
    lines.push(
      `Reference only, do not transcribe. The next image shows ${hints.references.length} line${hints.references.length === 1 ? "" : "s"} by this writer from earlier pages, top to bottom. The shopkeeper confirmed what each one says:`,
      ...hints.references.map((r, i) => `${i + 1}. ${r.text}`),
    );
  }
  if (hints.confusions.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      "Digits of this writer that were misread before (the shopkeeper corrected them):",
      ...hints.confusions.map((c) => `- this writer's ${digitName(c.written)} was read as ${digitName(c.read)}, ${c.count} times`),
    );
  }
  return lines.join("\n");
}

/** The text placed just before the page image when notes come first. */
export const PERSONAL_PAGE_TEXT = "Now transcribe this ledger image. Only this image is the page.";

/**
 * P4: the printed Scriba khata page (`scripts/khata/page.html`). When he says a page is one, the
 * prompt learns the column order, so the column a number sits in decides qty, rate or amount.
 */
export const PAGE_LAYOUTS = ["free", "scriba_khata"] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

/** Bump with any change to KHATA_LAYOUT or to the printed page's columns. */
export const KHATA_LAYOUT_VERSION = "khata-1";
const KHATA_SUFFIX = `+${KHATA_LAYOUT_VERSION}`;

const KHATA_LAYOUT = `Page layout: the shopkeeper says this is a printed Scriba khata page. If the photo shows no such printed page, ignore this section.
- Printed, never transcribed: the four black corner squares, the title "Scriba খাতা" and the line under it, দোকান (his own shop's name: never use it as customer or account_name), পাতা নং, the column headings, the printed row labels and the tips at the bottom. Each row's last cell has a faint printed "বা জ".
- Columns, left to right: তারিখ (date) | নাম (name) | জিনিস (item) | পরিমাণ (quantity) | দর (rate) | টাকা (amount) | বাকি/জমা.
- The column decides the field. A number in পরিমাণ is qty (a unit written with it goes in unit), in দর it is rate, in টাকা it is amount. Never move a number to another field because of its size or of arithmetic. A number that crosses a column line belongs to the column holding most of it; list that field in review.
- নাম is the customer or supplier. A name written once and left blank on the rows below is not repeated: use null for the blank rows.
- বাকি/জমা: a circled বা means বাকি and a circled জ means জমা; decide the type with the বাকি and জমা rules above. Neither circled: decide from the words as usual. The printed letters alone mean nothing.
- The first row, "আগের পাতা থেকে জের", is the balance carried from the previous page: a figure written there is an opening_balance entry. The last row, "মোট · পরের পাতায় জের", is the page total carried to the next page: a figure written there is a closing_balance entry.
- One entry per row that carries an amount. text: the handwritten cells of the row, left to right, separated by spaces, with বা or জ at the end only when one is circled. box: the whole row.
- date_text: the first date written in the তারিখ column, exactly as written. A date applies to its row and the rows below it until the next date.`;

/** The layout rides on prompts 4 and 5 only; another base prompt is read as written. */
const LAYOUT_BASES = new Set([PROMPT_VERSION, PERSONAL_PROMPT_VERSION]);

/** The profile for a reading of a page with this layout. Its version records the layout. */
export function withLayout(profile: ExtractionProfile, layout: PageLayout): ExtractionProfile {
  if (layout !== "scriba_khata" || !LAYOUT_BASES.has(profile.promptVersion)) return profile;
  return { ...profile, promptVersion: `${profile.promptVersion}${KHATA_SUFFIX}`, instructions: `${profile.instructions}\n\n${KHATA_LAYOUT}` };
}

/** The layout a recorded run was read with, so a re-read of the same page keeps it. */
export function layoutOfPromptVersion(promptVersion: string | null): PageLayout {
  return promptVersion?.endsWith(KHATA_SUFFIX) ? "scriba_khata" : "free";
}

export type ExtractionProfile = {
  promptVersion: string;
  instructions: string;
  schemaVersion: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
};

const PROFILES: Record<string, ExtractionProfile> = {
  "scriba-prompt-4": {
    promptVersion: "scriba-prompt-4",
    instructions: PROMPT_4,
    schemaVersion: SCHEMA_VERSION,
    schemaName: SCHEMA_NAME,
    jsonSchema: EXTRACTION_JSON_SCHEMA,
  },
  "scriba-prompt-3": {
    promptVersion: "scriba-prompt-3",
    instructions: PROMPT_3,
    schemaVersion: SCHEMA_V1_VERSION,
    schemaName: SCHEMA_V1_NAME,
    jsonSchema: EXTRACTION_JSON_SCHEMA_V1,
  },
};

export const PROMPT_VERSIONS = Object.keys(PROFILES);

/**
 * Prompt 5 builds on prompt 4 and its schema. Null when another base prompt is selected, so
 * a comparison run on prompt 3 is never mixed with personal notes.
 */
export function getPersonalProfile(): ExtractionProfile | null {
  const base = getExtractionProfile();
  if (base.promptVersion !== "scriba-prompt-4") return null;
  return { ...base, promptVersion: PERSONAL_PROMPT_VERSION, instructions: PROMPT_5 };
}

/**
 * The prompt and schema used for new extractions: prompt 4 unless
 * SCRIBA_PROMPT_VERSION selects another (prompt 3 runs with the schema it was
 * measured with). Both versions are part of the cache key and of every run row.
 */
export function getExtractionProfile(): ExtractionProfile {
  const version = process.env.SCRIBA_PROMPT_VERSION?.trim() || PROMPT_VERSION;
  const profile = PROFILES[version];
  if (!profile) throw new Error(`SCRIBA_PROMPT_VERSION must be one of ${PROMPT_VERSIONS.join(", ")}.`);
  return profile;
}
