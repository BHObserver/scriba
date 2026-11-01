/** A question's sentence in the shopkeeper's language. Money and digits follow the locale. */
import type { I18n } from "@/lib/i18n/format";
import type { Sentence, SentenceArg } from "./types";

function argText(i18n: I18n, arg: SentenceArg): string {
  if ("text" in arg) return i18n.digits(arg.text);
  if ("money" in arg) return i18n.money(arg.money);
  if ("count" in arg) return i18n.count(arg.count);
  if ("day" in arg) return i18n.dayMonth(arg.day);
  return sentenceText(i18n, arg.say);
}

export function sentenceText(i18n: I18n, sentence: Sentence): string {
  return i18n.t(sentence.key, ...(sentence.args ?? []).map((a) => argText(i18n, a)));
}
