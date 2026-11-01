/**
 * Ask Scriba's words: the period phrases, the one-sentence answer, and the suggested questions.
 * Templates live in the i18n dictionary ("ask.*"); this file picks the template and inserts
 * numbers computed by code. Names and items are the shopkeeper's words and are never translated.
 */
import type { I18n } from "@/lib/i18n/format";
import { bnPossessive, riskText } from "@/lib/insights/text";
import type { Answer } from "./answer";
import type { Period } from "./period";
import { type AskQuery, askQuery } from "./query";

const possessive = (name: string, i18n: I18n) => (i18n.locale === "bn" ? bnPossessive(name) : name);

function periodArg(p: Period, i18n: I18n): string | number {
  if (p.key === "on_date") return i18n.dayMonth(p.from);
  return p.days;
}

/** How a sentence opens: "আজ", "শেষ সাত দিনে" / "Today", "In the last 7 days". */
export function periodWhen(p: Period, i18n: I18n): string {
  return i18n.t(`ask.p.${p.key}`, periodArg(p, i18n));
}

/** The period as compared with: "আগের সাত দিনের" (চেয়ে follows) / "the 7 days before". */
export function periodOf(p: Period, i18n: I18n): string {
  return i18n.t(`ask.pv.${p.key}`, periodArg(p, i18n));
}

/** The dates a figure covers: "২৬ অক্টো – ১ নভে", or one day. */
export function periodRange(p: Period, i18n: I18n): string {
  return p.from === p.to ? i18n.dayMonth(p.from) : i18n.t("ask.range", i18n.dayMonth(p.from), i18n.dayMonth(p.to));
}

/** The big number on the answer card, or null when the answer has none. */
export function answerFigure(a: Answer): number | null {
  switch (a.kind) {
    case "due":
      return Math.abs(a.balance.poisha);
    case "dues_total":
    case "risky":
    case "sales":
    case "out":
      return a.total.poisha;
    case "compare":
      return a.a.figure.poisha;
    case "drawer":
      return a.expected.poisha;
    default:
      return null;
  }
}

export function answerSentence(a: Answer, i18n: I18n): string {
  const { t, money } = i18n;
  switch (a.kind) {
    case "due": {
      const k = a.partyKind;
      if (a.balance.poisha === 0) return t(`ask.s.due.${k}.zero`, possessive(a.name, i18n));
      if (a.balance.poisha < 0) return t(`ask.s.due.${k}.advance`, k === "supplier" ? possessive(a.name, i18n) : a.name, money(-a.balance.poisha));
      return a.risk
        ? t(`ask.s.due.${k}.risk`, possessive(a.name, i18n), money(a.balance.poisha), riskText(a.risk, k, i18n))
        : t(`ask.s.due.${k}`, possessive(a.name, i18n), money(a.balance.poisha));
    }
    case "dues_total":
      return a.people === 0 ? t(`ask.s.dues.${a.partyKind}.none`) : t(`ask.s.dues.${a.partyKind}`, a.people, money(a.total.poisha));
    case "risky":
      return a.parties.length === 0 ? t(`ask.s.risky.${a.partyKind}.none`) : t(`ask.s.risky.${a.partyKind}`, a.parties.length, money(a.total.poisha));
    case "sales": {
      const when = periodWhen(a.period, i18n);
      const lines = a.lines;
      if (a.item) return lines === 0 ? t("ask.s.item.none", when, a.item) : t("ask.s.item", when, a.item, money(a.total.poisha), lines);
      if (lines === 0) return t("ask.s.sales.none", when);
      if (a.salesKind !== "all") return t(`ask.s.sales.${a.salesKind}`, when, money(a.total.poisha));
      const credit = a.parts.find((p) => p.type === "credit_sale")!.figure.poisha;
      return credit > 0 ? t("ask.s.sales.split", when, money(a.total.poisha), money(credit)) : t("ask.s.sales", when, money(a.total.poisha));
    }
    case "out": {
      const when = periodWhen(a.period, i18n);
      const lines = a.lines;
      if (lines === 0) return t("ask.s.out.none", when);
      if (a.item) return t("ask.s.out.item", when, a.item, money(a.total.poisha), lines);
      return a.outKind === "all" ? t("ask.s.out", when, money(a.total.poisha)) : t(`ask.s.out.${a.outKind}`, when, money(a.total.poisha));
    }
    case "compare": {
      const diff = a.a.figure.poisha - a.b.figure.poisha;
      const m = a.measure === "sales" ? "sales" : "out";
      const args = [periodWhen(a.a.period, i18n), money(a.a.figure.poisha), periodOf(a.b.period, i18n)] as const;
      if (diff === 0) return t(`ask.s.cmp.${m}.same`, ...args);
      return t(`ask.s.cmp.${m}.${diff > 0 ? "up" : "down"}`, ...args, money(Math.abs(diff)));
    }
    case "drawer":
      return t("ask.s.drawer", periodWhen(a.period, i18n), money(a.expected.poisha));
    case "pick":
      return t("ask.s.pick");
    case "not_found":
      return t(`ask.s.notFound.${a.what}`, a.said);
    case "unknown":
      return t("ask.s.unknown");
  }
}

export type Suggestion = { text: string; query: AskQuery };

/**
 * Questions he can tap: each carries its shape, so a tap is answered by code alone, with no
 * model call. `name` is someone whose dues need a look (or the largest due), when there is one.
 */
export function askSuggestions(name: string | null, i18n: I18n): Suggestion[] {
  const { t } = i18n;
  return [
    ...(name ? [{ text: t("ask.sg.due", possessive(name, i18n)), query: askQuery({ intent: "party_due", party: name }) }] : []),
    { text: t("ask.sg.week"), query: askQuery({ intent: "sales", period: "last_7_days" }) },
    { text: t("ask.sg.risky"), query: askQuery({ intent: "risky_dues" }) },
    { text: t("ask.sg.compare"), query: askQuery({ intent: "compare", period: "last_7_days" }) },
    { text: t("ask.sg.out"), query: askQuery({ intent: "money_out", period: "last_7_days" }) },
    { text: t("ask.sg.drawer"), query: askQuery({ intent: "drawer_cash" }) },
  ];
}
