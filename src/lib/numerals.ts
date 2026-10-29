/**
 * Deterministic normalization of handwritten numbers.
 *
 * The source text is never modified; these helpers only derive a number from it.
 * Money is represented as integer poisha (1 taka = 100 poisha) and quantities as
 * integer thousandths ("milli-units"), so no floating-point value is ever used in
 * accounting arithmetic.
 */

export const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

export type ParseFailureReason =
  | "empty"
  | "no_digits"
  | "multiple_numbers"
  | "ambiguous"
  | "malformed"
  | "negative"
  | "too_many_decimals"
  | "too_large";

export type DigitStyle = "bangla" | "arabic" | "mixed";

export type ParsedNumber =
  | {
      ok: true;
      /** Scaled integer: poisha for money, thousandths for quantities. */
      value: number;
      /** ASCII-digit form of the numeric token that was read, e.g. "1,020.50". */
      token: string;
      /** Digit style of the token itself. "mixed" within one number deserves review. */
      digitStyle: DigitStyle;
    }
  | { ok: false; reason: ParseFailureReason };

const BANGLA_DIGIT_RE = /[০-৯]/g;
const ANY_DIGIT_RE = /[0-9০-৯]/;

/** Replace Bangla digits with ASCII digits. Every other character is kept as is. */
export function toAsciiDigits(text: string): string {
  return text.replace(BANGLA_DIGIT_RE, (d) => String(BANGLA_DIGITS.indexOf(d)));
}

/** Render ASCII digits as Bangla digits (for display only). */
export function toBanglaDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)] ?? d);
}

export function digitStyleOf(text: string): DigitStyle | null {
  const hasBangla = /[০-৯]/.test(text);
  const hasArabic = /[0-9]/.test(text);
  if (hasBangla && hasArabic) return "mixed";
  if (hasBangla) return "bangla";
  if (hasArabic) return "arabic";
  return null;
}

// Currency and decoration commonly written around amounts in Bangladeshi khatas.
// Longest alternatives first so "টাকা" is removed before "টা".
const CURRENCY_MARKERS = [
  "=/-",
  "/-",
  "৳",
  "টাকা",
  "টাঃ",
  "taka",
  "tk.",
  "tk",
  "rs.",
  "rs",
];

function stripCurrencyMarkers(text: string): string {
  let out = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const lower = out.toLowerCase();
    for (const marker of CURRENCY_MARKERS) {
      if (lower.endsWith(marker)) {
        out = out.slice(0, out.length - marker.length).trim();
        changed = true;
        break;
      }
      if (lower.startsWith(marker)) {
        out = out.slice(marker.length).trim();
        changed = true;
        break;
      }
    }
    // A leading "=" or ":" is how a result is often introduced: "= ১৮০".
    if (/^[=:]/.test(out)) {
      out = out.slice(1).trim();
      changed = true;
    }
  }
  return out;
}

// One numeric token: digits with optional grouping commas and an optional decimal part.
const NUMBER_TOKEN_RE = /[0-9০-৯][0-9০-৯,]*(?:\.[0-9০-৯]+)?/g;

/**
 * Validate digit grouping. Accepts plain digits, international grouping (1,000,000)
 * and South Asian grouping (1,00,000). Rejects stray or misplaced commas.
 */
function hasValidGrouping(integerPart: string): boolean {
  if (!integerPart.includes(",")) return /^[0-9]+$/.test(integerPart);
  const groups = integerPart.split(",");
  const [first, ...rest] = groups;
  if (!first || !/^[0-9]{1,3}$/.test(first)) return false;
  if (rest.length === 0) return false;
  const last = rest[rest.length - 1]!;
  if (!/^[0-9]{3}$/.test(last)) return false;
  const middle = rest.slice(0, -1);
  const allTwo = middle.every((g) => /^[0-9]{2}$/.test(g));
  const allThree = middle.every((g) => /^[0-9]{3}$/.test(g));
  return allTwo || allThree;
}

function parseScaled(token: string, scaleDigits: number): ParsedNumber {
  const ascii = toAsciiDigits(token);
  const [integerPart = "", fractionPart, ...extra] = ascii.split(".");
  if (extra.length > 0) return { ok: false, reason: "malformed" };
  if (!hasValidGrouping(integerPart)) return { ok: false, reason: "malformed" };
  if (fractionPart !== undefined) {
    if (fractionPart.length === 0) return { ok: false, reason: "malformed" };
    if (fractionPart.length > scaleDigits) return { ok: false, reason: "too_many_decimals" };
  }
  const digits = integerPart.replaceAll(",", "");
  const fraction = (fractionPart ?? "").padEnd(scaleDigits, "0");
  const scaled = Number(digits + fraction);
  if (!Number.isSafeInteger(scaled)) return { ok: false, reason: "too_large" };
  return { ok: true, value: scaled, token: ascii, digitStyle: digitStyleOf(token) ?? "arabic" };
}

function singleToken(core: string): { token: string } | { failure: ParseFailureReason } {
  if (core.length === 0) return { failure: "empty" };
  if (!ANY_DIGIT_RE.test(core)) return { failure: "no_digits" };
  const tokens = core.match(NUMBER_TOKEN_RE) ?? [];
  if (tokens.length > 1) return { failure: "multiple_numbers" };
  const token = tokens[0];
  if (!token) return { failure: "no_digits" };
  return { token };
}

/**
 * Parse a written amount into integer poisha.
 * "১৮০" -> 18000, "1,020" -> 102000, "৳ ১২০.৫০" -> 12050, "১৮০/-" -> 18000.
 * Anything with residue that is not a known currency marker ("১৮০?", "১৮০ বাকি")
 * is ambiguous and must be resolved by a person.
 */
export function parseMoney(text: string | null | undefined): ParsedNumber {
  if (text == null) return { ok: false, reason: "empty" };
  const core = stripCurrencyMarkers(text);
  if (/^-/.test(core)) return { ok: false, reason: "negative" };
  const found = singleToken(core);
  if ("failure" in found) return { ok: false, reason: found.failure };
  if (core !== found.token) return { ok: false, reason: "ambiguous" };
  return parseScaled(found.token, 2);
}

/**
 * Parse a unit rate. Accepts a trailing per-unit expression such as "৬০/কেজি",
 * "৬০ টাকা কেজি" or "60 per kg", which describes the rate rather than changing it.
 */
export function parseRate(text: string | null | undefined): ParsedNumber {
  if (text == null) return { ok: false, reason: "empty" };
  const withoutPerUnit = text
    .trim()
    .replace(/\s*(?:\/|প্রতি|per)\s*[^\s0-9০-৯/]+\.?$/iu, "")
    .replace(/\s*(?:টাকা|৳|tk\.?)\s*[^\s0-9০-৯]+$/iu, "");
  return parseMoney(withoutPerUnit);
}

const SIMPLE_FRACTION_RE = /^([0-9০-৯]+)\s*\/\s*([0-9০-৯]+)$/;

/**
 * Parse a quantity into thousandths. "২" -> 2000, "1.5" -> 1500, "১/২" -> 500.
 * A trailing unit word written with the number ("২ কেজি", "৫টা") is tolerated.
 */
export function parseQuantity(text: string | null | undefined): ParsedNumber {
  if (text == null) return { ok: false, reason: "empty" };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (/^-/.test(trimmed)) return { ok: false, reason: "negative" };

  // Drop a trailing unit/classifier made only of letters, e.g. "কেজি", "টা", "pcs".
  const core = trimmed.replace(/\s*[^\s0-9০-৯.,/]+$/u, "").trim();
  if (core.length === 0) return { ok: false, reason: "no_digits" };

  const fraction = core.match(SIMPLE_FRACTION_RE);
  if (fraction) {
    const numerator = Number(toAsciiDigits(fraction[1]!));
    const denominator = Number(toAsciiDigits(fraction[2]!));
    if (denominator === 0) return { ok: false, reason: "malformed" };
    const scaled = (numerator * 1000) / denominator;
    if (!Number.isInteger(scaled)) return { ok: false, reason: "too_many_decimals" };
    return {
      ok: true,
      value: scaled,
      token: `${numerator}/${denominator}`,
      digitStyle: digitStyleOf(core) ?? "arabic",
    };
  }

  const found = singleToken(core);
  if ("failure" in found) return { ok: false, reason: found.failure };
  if (core !== found.token) return { ok: false, reason: "ambiguous" };
  return parseScaled(found.token, 3);
}

/**
 * Expected amount for quantity x rate, in poisha.
 * Returns the exact value when it is a whole number of poisha, otherwise the value
 * rounded half-up to the nearest poisha together with a flag.
 */
export function multiplyQuantityByRate(
  quantityMilli: number,
  ratePoisha: number,
): { poisha: number; exact: boolean } {
  const product = quantityMilli * ratePoisha;
  if (!Number.isSafeInteger(product)) throw new RangeError("quantity x rate overflow");
  const exact = product % 1000 === 0;
  return { poisha: exact ? product / 1000 : Math.floor((product + 500) / 1000), exact };
}

/** "৳1,020" or "৳120.50". Uses South Asian digit grouping. */
export function formatTaka(poisha: number | null | undefined, opts: { bangla?: boolean } = {}): string {
  if (poisha == null) return "—";
  const negative = poisha < 0;
  const abs = Math.abs(poisha);
  const taka = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = groupSouthAsian(String(taka));
  const body = rest === 0 ? grouped : `${grouped}.${String(rest).padStart(2, "0")}`;
  const text = `${negative ? "−" : ""}৳${body}`;
  return opts.bangla ? toBanglaDigits(text) : text;
}

export function formatQuantity(milli: number | null | undefined): string {
  if (milli == null) return "—";
  const whole = Math.trunc(milli / 1000);
  const frac = Math.abs(milli % 1000);
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(3, "0").replace(/0+$/, "")}`;
}

function groupSouthAsian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let head = digits.slice(0, -3);
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) parts.unshift(head);
  return `${parts.join(",")},${last3}`;
}

/**
 * Normalize a written date to ISO (YYYY-MM-DD) only when it is unambiguous:
 * day/month/four-digit-year, the convention used in Bangladesh. Two-digit years and
 * anything else return null so a person decides.
 */
export function normalizeDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const ascii = toAsciiDigits(text).trim();
  const m = ascii.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
