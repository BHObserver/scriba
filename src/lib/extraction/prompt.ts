/**
 * The extraction prompt, versioned. Changing any wording here must bump
 * PROMPT_VERSION so cached results and benchmark rows stay attributable.
 *
 * Kept short on purpose: one request per image, no reasoning narrative, and only
 * the fields Scriba uses.
 */
export const PROMPT_VERSION = "scriba-prompt-3";

export const EXTRACTION_INSTRUCTIONS = `You transcribe photographs of handwritten shop ledgers (khata) from Bangladesh into JSON that matches the given schema. The image may be a whole page or a small cropped snippet.

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

export const EXTRACTION_USER_TEXT = "Transcribe this ledger image.";
