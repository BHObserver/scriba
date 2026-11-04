/**
 * The words for Scriba's note and the dues reasons, in the user's language. Templates live in
 * the i18n dictionary ("note.*", "risk.*"); this file only picks the template and inserts
 * numbers computed by code. Names are the user's words and are never translated.
 */
import type { I18n } from "@/lib/i18n/format";
import type { PartyKind } from "@/lib/ledger/parties";
import type { Risk } from "./accounts";
import type { NoteSentence } from "./note";

const VOWEL_SIGN = /[া-ৌৗ]$/;
const INDEPENDENT_VOWEL = /[অ-ঔ]$/;
const CONSONANT = /[ংক-হ়্ড়-য়]$/;

/**
 * Bangla possessive (ষষ্ঠী বিভক্তি) of a name: a vowel sign takes র (দিদির), an independent
 * vowel takes য়ের (ভাইয়ের), a consonant takes ের (করিমের), ৎ becomes তের. Anything else, such
 * as a Latin name or a digit, takes -এর (Rahim-এর).
 */
export function bnPossessive(name: string): string {
  const word = name.trim();
  const core = word.replace(/ঁ+$/, ""); // a chandrabindu sits on the letter before it
  if (core.endsWith("ৎ")) return `${core.slice(0, -1)}তের`;
  if (VOWEL_SIGN.test(core)) return `${word}র`;
  if (INDEPENDENT_VOWEL.test(core)) return `${word}য়ের`;
  if (CONSONANT.test(core)) return `${word}ের`;
  return `${word}-এর`;
}

/** A dues reason line: "৪৫ দিন কোনো জমা নেই" / "No payment in 45 days". */
export function riskText(risk: Risk, kind: PartyKind, i18n: I18n): string {
  switch (risk.code) {
    case "no_payment":
      return i18n.t(`risk.no_payment.${kind}`, risk.days);
    case "growing":
      return i18n.t(`risk.growing.${kind}`, risk.weeks);
    case "big_credit":
      return i18n.t(`risk.big_credit.${kind}`, i18n.money(risk.amountPoisha), i18n.money(risk.usualPoisha));
  }
}

/** `on` names the day when the note is about a day other than today ("গতকাল", "৩ নভেম্বর"). */
export function noteText(sentence: NoteSentence, i18n: I18n, on: string | null = null): string {
  switch (sentence.kind) {
    case "pending_pages":
      return sentence.pageNumbers.length === 1
        ? i18n.t(on ? "note.pending.one.day" : "note.pending.one", sentence.pageNumbers[0]!)
        : i18n.t(on ? "note.pending.many.day" : "note.pending.many", sentence.pageNumbers.length);
    case "sales":
      if (on) {
        return sentence.credit.poisha > 0
          ? i18n.t("note.sales.on", on, i18n.money(sentence.sales.poisha), i18n.money(sentence.credit.poisha))
          : i18n.t("note.sales.cash.on", on, i18n.money(sentence.sales.poisha));
      }
      return sentence.credit.poisha > 0
        ? i18n.t("note.sales", i18n.money(sentence.sales.poisha), i18n.money(sentence.credit.poisha))
        : i18n.t("note.sales.cash", i18n.money(sentence.sales.poisha));
    case "no_sales":
      return i18n.t(on ? "note.sales.none.day" : "note.sales.none");
    case "due_risk":
      return i18n.t(
        "note.due",
        i18n.locale === "bn" ? bnPossessive(sentence.name) : sentence.name,
        i18n.money(sentence.balancePoisha),
        riskText(sentence.risk, sentence.partyKind, i18n),
      );
    case "week_trend":
      if (sentence.diffPoisha === 0) return i18n.t("note.week.same");
      return i18n.t(sentence.diffPoisha > 0 ? "note.week.up" : "note.week.down", i18n.money(Math.abs(sentence.diffPoisha)));
  }
}
