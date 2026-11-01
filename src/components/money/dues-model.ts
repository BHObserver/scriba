/**
 * What the dues list, a party's ledger and the reminder show, from the engine's accounts. Pure,
 * so it is tested without a browser. No figure is computed here: balances, the last payment and
 * the oldest unpaid credit come from the engine (`PartyAccount`), computed from confirmed lines.
 */
import type { I18n } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AccountEntry, Risk } from "@/lib/insights/accounts";
import { daysBetween } from "@/lib/insights/calendar";
import { bnPossessive } from "@/lib/insights/text";
import type { RecordType } from "@/lib/insights/types";
import { type PartyKind, normalizePartyName } from "@/lib/ledger/parties";
import { readingParts } from "./money-model";

/** One row of the dues list, as the client needs it. */
export type DuesRowView = {
  partyId: string;
  name: string;
  balancePoisha: number;
  /** The riskiest reason, or null: the row then says when he was last paid. */
  risk: Risk | null;
  lastPaymentDate: string | null;
};

/** One line of a party's ledger, newest first in the timeline. */
export type LedgerEntryView = {
  recordId: string;
  documentId: string;
  date: string;
  direction: AccountEntry["direction"];
  amountPoisha: number;
  balancePoisha: number;
  /** The page's number on its day (capture order), as Close the day numbers them. */
  page: number | null;
};

/** At most this many lines go into the reminder's picture (`/api/crops` takes up to 8). */
export const REMINDER_PHOTO_LINES = 8;

/** "আজ", "গতকাল" or "৩১ অক্টোবর". */
export function dateLabel(date: string, asOf: string, i18n: I18n): string {
  const days = daysBetween(date, asOf);
  if (days === 0) return i18n.t("du.today");
  if (days === 1) return i18n.t("du.yesterday");
  return i18n.dayMonth(date);
}

/** "১৯ অক্টোবর, ১৩ দিন আগে"; today and yesterday need no count. */
export function whenLabel(date: string, asOf: string, i18n: I18n): string {
  const days = daysBetween(date, asOf);
  return days <= 1 ? dateLabel(date, asOf, i18n) : i18n.t("du.when", i18n.dayMonth(date), days);
}

/** A dues row without a risk says when money last came (or went): "শেষ জমা ২৮ অক্টোবর, ৪ দিন আগে". */
export function quietText(kind: PartyKind, lastPaymentDate: string | null, asOf: string, i18n: I18n): string {
  return lastPaymentDate ? i18n.t(`du.last.${kind}`, whenLabel(lastPaymentDate, asOf, i18n)) : i18n.t(`du.never.${kind}`);
}

/** A name in the possessive where the sentence needs it: "রহিমের" in Bangla, unchanged in English. */
export function possessiveName(name: string, i18n: I18n): string {
  return i18n.locale === "bn" ? bnPossessive(name) : name;
}

/** A name as the object: "রফিককে" in Bangla, unchanged in English. */
export function objectiveName(name: string, i18n: I18n): string {
  return i18n.locale === "bn" ? bnObjective(name) : name;
}

/** The hero's label: "রহিমের কাছে পাবেন" / "আল-আমিনকে দিতে হবে", or what an overpaid balance means. */
export function balanceLabel(kind: PartyKind, name: string, balancePoisha: number, i18n: I18n): string {
  if (balancePoisha < 0) return i18n.t(`pl.ahead.${kind}`, name);
  return kind === "customer" ? i18n.t("pl.owes.customer", possessiveName(name, i18n)) : i18n.t("pl.owes.supplier", objectiveName(name, i18n));
}

/** The oldest unpaid credit and what is left of it: "১৯ অক্টোবরের ৳৮০০" / "৳800 from 19 Oct". */
export function oldestText(date: string, leftPoisha: number, asOf: string, i18n: I18n): string {
  const label = dateLabel(date, asOf, i18n);
  const when = i18n.locale !== "bn" ? label : daysBetween(date, asOf) === 0 ? i18n.t("pl.todays") : bnPossessive(label);
  return i18n.t("pl.oldestV", when, i18n.money(leftPoisha));
}

/** What a merge does, said before he confirms: "রহিমের সব লাইন রহিম উদ্দিনের খাতায় যাবে।" */
export function mergeWhat(source: string, target: string, i18n: I18n): string {
  return i18n.t("mg.what", possessiveName(source, i18n), possessiveName(target, i18n));
}

const VERB: Record<PartyKind, Record<AccountEntry["direction"], MessageKey>> = {
  customer: { start: "pl.start.customer", up: "pl.up.customer", down: "pl.down.customer" },
  supplier: { start: "pl.start.supplier", up: "pl.up.supplier", down: "pl.down.supplier" },
};

/**
 * A timeline line: "বাকিতে নিলেন · চাল · ২ কেজি × ৬০". The party's own name isn't repeated, and a
 * payment or an opening balance is just its verb: no goods change hands.
 */
export function entryText(
  kind: PartyKind,
  direction: AccountEntry["direction"],
  line: { item: string | null; quantityText: string | null; unit: string | null; rateText: string | null; type: RecordType } | null,
  i18n: I18n,
): string {
  const verb = i18n.t(VERB[kind][direction]);
  const parts = line && direction === "up" ? readingParts({ ...line, name: null }, i18n) : [];
  return [verb, ...parts].join(" · ");
}

/** What the balance is after a line: "এরপর বাকি ৳১,২৪০", "এরপর কোনো বাকি নেই". */
export function afterText(kind: PartyKind, balancePoisha: number, i18n: I18n): string {
  if (balancePoisha === 0) return i18n.t(`pl.clear.${kind}`);
  if (balancePoisha < 0) return i18n.t(`pl.afterAhead.${kind}`, i18n.money(-balancePoisha));
  return i18n.t(`pl.after.${kind}`, i18n.money(balancePoisha));
}

const VOWEL_AA = /\u09BE$/; // া
const VOWEL_SIGN = /[\u09BF-\u09CC\u09D7]$/; // ি … ৌ, ৗ
const INDEPENDENT_VOWEL = /[\u0985-\u0994]$/; // অ … ঔ
const CONSONANT = /[\u0982\u0995-\u09B9\u09BC\u09CD\u09DC-\u09DF]$/; // ং, ক … হ, ়, ্, ড় … য়

/**
 * Bangla locative (অধিকরণ) of a place name: a consonant takes ে (স্টোরে), আ-কার takes য়
 * (দোয়ায়), another vowel takes তে (বাড়িতে), ৎ becomes তে. Anything else, such as a Latin name,
 * takes -এ (Rahman Store-এ).
 */
export function bnLocative(name: string): string {
  const word = name.trim();
  const core = word.replace(/ঁ+$/, "");
  if (core.endsWith("ৎ")) return `${core.slice(0, -1)}তে`;
  if (VOWEL_AA.test(core)) return `${word}য়`;
  if (VOWEL_SIGN.test(core) || INDEPENDENT_VOWEL.test(core)) return `${word}তে`;
  if (CONSONANT.test(core)) return `${word}ে`;
  return `${word}-এ`;
}

/** Bangla objective (কর্ম) of a name: কে after a Bangla letter (রফিককে), -কে after anything else. */
export function bnObjective(name: string): string {
  const word = name.trim();
  return /[ঀ-৿]$/.test(word) ? `${word}কে` : `${word}-কে`;
}

/**
 * The reminder, one paragraph per entry: greeting, what is due at which shop and the last
 * payment, the polite ask, and the shop's name as the signature. He can still edit it.
 */
export function reminderLines(
  r: { name: string; shopName: string | null; balancePoisha: number; lastPaymentDate: string | null; withPhoto: boolean },
  i18n: I18n,
): string[] {
  const shop = r.shopName?.trim() || null;
  const amount = i18n.money(r.balancePoisha);
  let due = shop ? i18n.t("rm.due", i18n.locale === "bn" ? bnLocative(shop) : shop, amount) : i18n.t("rm.dueNoShop", amount);
  if (r.lastPaymentDate) due += ` ${i18n.t("rm.last", i18n.dayMonth(r.lastPaymentDate))}`;
  const lines = [i18n.t("rm.hello", r.name.trim()), due, i18n.t(r.withPhoto ? "rm.ask.photo" : "rm.ask")];
  if (shop) lines.push(`— ${shop}`);
  return lines;
}

/** The unpaid lines that have a photo, newest last, as many as fit in the reminder's picture. */
export function reminderPhotoIds(unpaidRecordIds: readonly string[], withPhoto: ReadonlySet<string>): string[] {
  return unpaidRecordIds.filter((id) => withPhoto.has(id)).slice(-REMINDER_PHOTO_LINES);
}

const firstName = (name: string) => (normalizePartyName(name) ?? "").split(" ")[0] ?? "";

/**
 * Merge choices with the same first name first (রহিম ভাই → মোঃ রহিম, রহিম উদ্দিন), the rest as
 * given. Only the first name: endings like উদ্দিন or বেগম are shared by unrelated people.
 */
export function mergeOrder<T extends { name: string }>(name: string, targets: readonly T[]): T[] {
  const first = firstName(name);
  const similar = (t: T) => first !== "" && firstName(t.name) === first;
  return [...targets.filter(similar), ...targets.filter((t) => !similar(t))];
}

/** Whether a name matches what he typed, across spelling variants (করীম finds করিম ভাই). */
export function nameMatches(query: string, name: string): boolean {
  const q = normalizePartyName(query);
  return q === null || (normalizePartyName(name) ?? "").includes(q);
}

/** Where the dues list opens: the payables tab only when asked for. */
export function duesTab(param: string | string[] | undefined): PartyKind {
  return param === "supplier" ? "supplier" : "customer";
}

export function duesHref(kind: PartyKind): string {
  return kind === "supplier" ? "/parties?tab=supplier" : "/parties";
}
