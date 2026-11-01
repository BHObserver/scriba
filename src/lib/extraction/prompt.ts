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
  EXTRACTION_JSON_SCHEMA_V3,
  LAYOUT_JSON_SCHEMA,
  LAYOUT_SCHEMA_NAME,
  LAYOUT_SCHEMA_VERSION,
  SCHEMA_NAME,
  SCHEMA_V1_NAME,
  SCHEMA_V1_VERSION,
  SCHEMA_V3_NAME,
  SCHEMA_V3_VERSION,
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

/** Prompt 4's digit rules, cut from it so prompt 6 carries them word for word. */
export const DIGIT_RULES = PROMPT_4.slice(PROMPT_4.indexOf("Reading digits:"), PROMPT_4.indexOf("\n\nEntries:"));

/**
 * Prompt 6 (2 Nov, U1): schema 3. The model groups scattered writing into blocks by meaning,
 * copies each word in the script it was written in, records goods without a price and lists
 * its doubts. Code still computes every number.
 */
export const BLOCKS_PROMPT_VERSION = "scriba-prompt-6";

const PROMPT_6 = `You transcribe photographs of handwritten shop ledgers (khata) from Bangladesh into JSON that matches the given schema. The image may be a whole page or a small cropped snippet. The writing may be scattered: groups of lines in different places on the page, side by side or at an angle, joined by arrows or brackets, with notes in the margin.

Transcribe only what is visibly written. Never calculate, infer, complete or correct anything. If a written total looks wrong, copy it exactly as written. Never write a price, amount or total that is not on the page.

${DIGIT_RULES}

Blocks:
- First find the blocks. A block is writing that belongs together by meaning, wherever it sits: one company's visit, the day's sales, one customer's account, the day's costs, a note. Group by meaning, not by position: two columns side by side are usually two blocks, and a block may continue below or beside another one.
- A heading or a name written once applies to the lines beside or below it, up to the next heading or the next gap. An arrow or a bracket joins the writing at its ends.
- Give ids "b1", "b2", ... in reading order: top to bottom, then left to right.
- kind:
  - supplier_visit: a company's sales rep came to the shop (for example Pran/প্রাণ, Fresh/ফ্রেশ, Akij/আকিজ, ACI/এসিআই, Aarong/আড়ং, Square/স্কয়ার, Teer/তীর). It may show what the shop owed the company before the visit, money given to the rep (দিলাম: the shop paid), and goods delivered. Goods by the carton, box or sack (কার্টুন, Box, বস্তা) with no price are a delivery to the shop, so such a block is a supplier_visit even when the name is hard to read.
  - supplier_account: what the shop owes one supplier or wholesaler (মহাজন) over several days.
  - customer_account: what one customer owes: goods given on credit and the customer's payments.
  - day_sales: the day's sales, for cash or on credit, possibly to several customers.
  - expenses: shop costs that are not stock.
  - other: anything else, or when unsure.
- title: the block's heading exactly as written, or null.
- party: the company, supplier or customer the block is about, as written, without the person. person: a rep or contact named with it, as written, or null. For "Praan (Selim)", party is "Praan" and person is "Selim".
- date_text: a date written for this block only, exactly as written, or null.
- box: the whole block on a 0-1000 grid (x_min, y_min, x_max, y_max; origin top-left), or null if unsure.

Entries:
- One entry per line that carries an amount, a balance, or goods (an item with or without a quantity). List them block by block, top to bottom within each block. Give ids "e1", "e2", ... and line numbers 1, 2, ... in that order.
- block: the id of the block the line belongs to.
- Not entries: dates, headings and names written on a line of their own (they belong to the block), and titles or labels such as "Sample-03" or নগদ বিক্রির হিসাব. A margin note without a number is not an entry: put it in the note of the line it explains.
- text: the whole line exactly as written, in the script it was written in: Bangla words in Bangla script, English words in Latin letters, Banglish as it is spelled (for example "Before - 2800", "Juice 1 Box"). Do not translate, transliterate or correct spelling. This is for words only: every digit follows the digit rules above, so on a Bangla page digits are written as Bangla digits.
- qty, rate, amount, balance: copy each number as written, with its commas and decimal point and digits read as above. Use null when it is not written.
- amount: the line's money figure. On opening_balance and closing_balance lines the balance figure goes in amount.
- Goods without a price: a line such as "Juice 1 Box" has item "Juice", qty "1", unit "Box" and amount null. Never price goods, and never move a quantity into amount.
- unit: as written (e.g. কেজি, লিটার, টা, প্যাকেট, Box, pcs), or null.
- item: as written, or null. customer: a name written on the line itself (in day_sales, the customer of that line), as written, else null. The block's party is not repeated on its lines. Never invent a name.
- Role words, in any script: Before, Prev, আগের, পূর্বের mean a balance from before; Given, Paid, দিলাম, দেওয়া, জমা mean money paid; Total, মোট, যোগ mean a written sum.
- type, by what happened on the line:
  - credit_sale: goods given to a customer on credit (বাকি, বাকিতে).
  - cash_sale: goods sold and paid for at once (নগদ, নগদ বিক্রি).
  - repayment: money a customer paid towards what they owe (জমা, পরিশোধ, দিলেন).
  - purchase: stock bought for the shop and paid in cash (মাল কেনা, মাল ক্রয়, নগদে কেনা).
  - credit_purchase: stock taken from a supplier on credit (মহাজনের বাকি, বাকিতে মাল আনা). Goods a company delivered in a supplier_visit are credit_purchase, unless the line says they were paid for.
  - supplier_payment: money the shop paid to a supplier (মহাজনকে দেওয়া, মহাজন জমা). Given or দিলাম in a supplier_visit is supplier_payment.
  - expense: shop costs that are not stock (খরচ, ভাড়া, দোকান ভাড়া, বেতন, বিদ্যুৎ বিল, গাড়ি ভাড়া, চা-নাস্তা).
  - opening_balance: a balance brought forward (আগের বাকি, পূর্বের জের, Before). In a supplier_visit, what the shop owed the company before the visit.
  - closing_balance: the balance due after all transactions and payments, usually the block's last line (বর্তমান বাকি, সর্বমোট বাকি).
  - subtotal: a written sum of the lines above it in the same block (মোট, যোগ, Total, আজকের বাকি, মোট বাকিতে, মোট নগদ বিক্রি, মোট খরচ).
  - adjustment; unknown when unsure.
- The block decides who is on the other side. In customer_account and day_sales blocks, জমা is repayment and বাকি is credit_sale. In supplier_visit and supplier_account blocks, money the shop gave is supplier_payment and goods taken on বাকি are credit_purchase. When the direction is unclear, use unknown. Do not guess credit_sale.
- balance: only a running balance written on a transaction line next to its amount, otherwise null.
- crossed_out: true if the line or its value is struck through.
- review: fields you could not read with confidence. note: at most 12 words on why, else null.
- box: tight bounding box of the line on the same grid, or null if unsure.

Doubts:
- When a value could be read in two or three ways, give your best reading in the entry, list that field in review, and add a doubt: entry (the entry id), field (never text), options (two or three readings exactly as they could be written, your best reading first) and note (at most 12 words, or null).
- A doubt is about reading the ink, never about arithmetic. When only one reading is plausible, add no doubt.

Page:
- date_text: the page's date exactly as written, or null.
- ledger_type: customer_credit if the whole page tracks what one customer owes; cash_sales if it only lists cash sales; mixed if it has blocks of different kinds; unknown if unclear.
- legibility: clear, partly_unclear or mostly_unclear.

warnings: short notes on anything that affects reading (cut-off edge, overwriting, smudge, glare, writing too small to read). Empty if none.`;

export const EXTRACTION_USER_TEXT = "Transcribe this ledger image.";

/**
 * U3: two-pass reading of a prompt 6 page. Pass 1 finds the blocks and their boxes without
 * reading the lines; pass 2 reads each block cut from the page, up close, with prompt 6's rules.
 * Bump TWO_PASS_VERSION with any change to these prompts, the hint, the crop or the merge.
 */
export const TWO_PASS_VERSION = "2pass-1";
const TWO_PASS_SUFFIX = `+${TWO_PASS_VERSION}`;

const BLOCK_RULES = PROMPT_6.slice(PROMPT_6.indexOf("Blocks:"), PROMPT_6.indexOf("\n\nEntries:"));
const PAGE_RULES = PROMPT_6.slice(PROMPT_6.indexOf("Page:"));
/** Prompt 6 from its rules on: everything but the opening paragraph, word for word. */
const PROMPT_6_RULES = PROMPT_6.slice(PROMPT_6.indexOf("Transcribe only what is visibly written."));

const LAYOUT_PROMPT = `You look at a photograph of a handwritten shop ledger (khata) page from Bangladesh and describe its layout as JSON that matches the given schema. Do not transcribe the lines: in a second step, each block is cut from the photo along its box and read up close. The writing may be scattered: groups of lines in different places on the page, side by side or at an angle, joined by arrows or brackets, with notes in the margin.

Never calculate, infer or complete anything. title, party, person and date_text are copied as written, in the script they were written in.

${BLOCK_RULES}

Boxes:
- The box decides what the second step can read, so it must hold the whole block: its heading or name, every line down to the last one, and any margin note, arrow or bracket that belongs to it. When unsure where a block ends, make the box larger rather than smaller.
- Give every block a box. Use null only when you cannot see where the block is.

${PAGE_RULES}`;

const BLOCK_PROMPT = `You transcribe one block of a photographed handwritten shop ledger (khata) page from Bangladesh into JSON that matches the given schema. The image was cut from the photo of the page around one block: writing that belongs together by meaning, such as one company's visit or the day's sales.

This image:
- The message says what a first look at the whole page found for this block. It is a hint: when the writing says otherwise, follow the writing.
- Return the block as "b1". The edges of the image may show parts of other blocks, often cut off: leave those lines out. Only if the image plainly holds two whole blocks, return both.
- Every box is on this image's own 0-1000 grid.

${PROMPT_6_RULES}`;

export const LAYOUT_USER_TEXT = "Describe the layout of this ledger page.";
const BLOCK_USER_TEXT = "Transcribe this block.";

/** The text sent with a block's crop: what pass 1 found for it, as a hint. */
export function blockUserText(block: { kind: string; title: string | null; party: string | null; person: string | null }): string {
  const found = [
    `kind ${block.kind}`,
    ...(block.title ? [`heading "${block.title}"`] : []),
    ...(block.party ? [`party "${block.party}"`] : []),
    ...(block.person ? [`person "${block.person}"`] : []),
  ];
  return `${BLOCK_USER_TEXT} A first look at the whole page found: ${found.join(", ")}.`;
}

export const LAYOUT_PROFILE: ExtractionProfile = {
  promptVersion: `scriba-layout-${TWO_PASS_VERSION}`,
  instructions: LAYOUT_PROMPT,
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  schemaName: LAYOUT_SCHEMA_NAME,
  jsonSchema: LAYOUT_JSON_SCHEMA,
};

export const BLOCK_PROFILE: ExtractionProfile = {
  promptVersion: `scriba-block-${TWO_PASS_VERSION}`,
  instructions: BLOCK_PROMPT,
  schemaVersion: SCHEMA_V3_VERSION,
  schemaName: SCHEMA_V3_NAME,
  jsonSchema: EXTRACTION_JSON_SCHEMA_V3,
};

/** SCRIBA_TWO_PASS=1 reads prompt 6 pages in two passes. Off by default until it measures better. */
export function twoPassSwitchOn(): boolean {
  return ["1", "true", "on"].includes(process.env.SCRIBA_TWO_PASS?.trim().toLowerCase() ?? "");
}

/** The profile a run records: prompt 6 with the two-pass suffix when the switch is on, else unchanged. */
export function withTwoPass(profile: ExtractionProfile): ExtractionProfile {
  if (!twoPassSwitchOn() || profile.promptVersion !== BLOCKS_PROMPT_VERSION) return profile;
  return { ...profile, promptVersion: `${profile.promptVersion}${TWO_PASS_SUFFIX}` };
}

/** Any version of the two-pass reading, including earlier ones. */
export function isTwoPassVersion(promptVersion: string): boolean {
  return /\+2pass-\d+$/.test(promptVersion);
}

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
  "scriba-prompt-6": {
    promptVersion: BLOCKS_PROMPT_VERSION,
    instructions: PROMPT_6,
    schemaVersion: SCHEMA_V3_VERSION,
    schemaName: SCHEMA_V3_NAME,
    jsonSchema: EXTRACTION_JSON_SCHEMA_V3,
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
 * measured with; prompt 6 with schema 3, until the check flow can show blocks). Both versions are part of the cache key and of every run row.
 */
export function getExtractionProfile(): ExtractionProfile {
  const version = process.env.SCRIBA_PROMPT_VERSION?.trim() || PROMPT_VERSION;
  const profile = PROFILES[version];
  if (!profile) throw new Error(`SCRIBA_PROMPT_VERSION must be one of ${PROMPT_VERSIONS.join(", ")}.`);
  return profile;
}
