/**
 * Ask Scriba's prompt (P2). The model reads one question and fills the query shape; it is told
 * the shop's names and items so it can pick the one meant, and nothing else about the shop: no
 * amount, no date, no record.
 */
import type { AskVocabulary } from "./query";

export const ASK_PROMPT_VERSION = "scriba-ask-1";
export const ASK_SCHEMA_NAME = "scriba_ask_query_v1";

export const ASK_INSTRUCTIONS = `You map a shopkeeper's question about the shop's khata (ledger) to a query shape.
You never answer the question and never state or compute any number. Code computes the answer from the khata.
Questions are usually Bangla, sometimes English or Bangla in Latin letters, often typed fast or heard by speech recognition, so expect spelling mistakes.

Intents:
- party_due: how much one named person owes the shop (customer), or the shop owes them (supplier, মহাজন). "করিমের কাছে কত বাকি?", "রহিম ভাইয়ের হিসাব", "মহাজনকে কত দিতে হবে?"
- total_dues: how much everyone owes in total, or the shop owes all suppliers. "সবার কাছে মোট কত বাকি?"
- risky_dues: whose dues need attention, are old, or are not being paid. "কার বাকি সবচেয়ে পুরনো?", "কে টাকা দিচ্ছে না?"
- sales: sales in a period, optionally only cash (নগদ) or credit (বাকিতে), optionally of one item. "আজ কত বিক্রি হলো?", "এই সপ্তাহে চাল কত বিক্রি হয়েছে?"
- money_out: money spent in a period. out_kind: purchase (মাল কেনা, stock), supplier_payment (paid to suppliers), expense (ভাড়া, বেতন, বিল, other costs), all (খরচ in general, "কত টাকা গেছে"). Optionally of one item.
- compare: one period against another, for sales or money_out (measure). "গত সপ্তাহের চেয়ে বিক্রি কেমন?" means period last_7_days, compare_to previous_7_days. Leave compare_to null to compare with the same length just before.
- drawer_cash: how much cash should be in the cash box (ক্যাশবাক্স, ড্রয়ার) on one day.
- unknown: anything else, including profit (লাভ), stock left, prices, advice, other shops, or anything the khata does not record. When unsure between an intent and unknown, choose unknown.

Fields:
- party: the person's name exactly as it appears in the shop's list below, only if the question clearly means that person; otherwise null. name_said: the name as the question says it, without case endings (করিমের → করিম), or null.
- party_kind: supplier for মহাজন, suppliers, or someone the shop buys from; otherwise customer.
- item / item_said: the same for an item (চাল, ডাল, তেল). Only for sales or money_out about one item.
- period: today (আজ), yesterday (গতকাল), last_7_days (এই সপ্তাহ, সাত দিন), previous_7_days (গত সপ্তাহ), this_month (এই মাস), last_month (গত মাস), last_n_days with days (শেষ ১০ দিন → 10), on_date with day and, if named, month (১৫ তারিখ → day 15, month null; ২৮ অক্টোবর → day 28, month 10), all_time (সব মিলিয়ে, এ পর্যন্ত). Default today. For dues the period does not matter: use today.
- days, day, month: integers only for the periods that use them; otherwise null.
- sales_kind, out_kind, measure: all, all, sales unless the question says otherwise.`;

const list = (items: readonly string[]) => (items.length > 0 ? items.join(" | ") : "(none)");

/** The user turn: the shop's names and items to pick from, then the question. */
export function askUserText(question: string, vocabulary: AskVocabulary): string {
  return [
    `Customers in this khata: ${list(vocabulary.customers)}`,
    `Suppliers in this khata: ${list(vocabulary.suppliers)}`,
    `Items in this khata: ${list(vocabulary.items)}`,
    "",
    `Question: ${question}`,
  ].join("\n");
}
