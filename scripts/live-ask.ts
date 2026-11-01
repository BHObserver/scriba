/**
 * Explicit live check of Ask Scriba (P2): send questions to Muse, one request each, and print
 * the query shape it picked and the answer code computed on the demo shop's book (built offline,
 * no database). Never run by tests or builds. Each question costs a fraction of a cent.
 *
 *   bun run live:ask                         # the built-in questions below (10)
 *   bun run live:ask "করিমের কাছে কত বাকি?"   # your own, one or more
 *   bun run live:ask --dry-run               # print the first request, send nothing
 *
 * Reads META_MODEL_API_KEY from .env.local (Bun loads it automatically).
 */
import { answerQuery, answerRecordIds } from "@/lib/ask/answer";
import { askVocabulary, parseAskOutput } from "@/lib/ask/query";
import { answerSentence } from "@/lib/ask/text";
import { getAskConfig, getMetaConfig } from "@/lib/config";
import { makeI18n } from "@/lib/i18n/format";
import { prepareBook } from "@/lib/insights/book";
import { dhakaDate } from "@/lib/ledger/dates";
import { buildAskRequest, createAskCaller } from "@/lib/meta/ask";
import { estimateCostUsd } from "@/lib/pricing";
import { demoBookInput } from "@/lib/shop/demo";

const MAX_QUESTIONS = 10;

const QUESTIONS = [
  "করিমের কাছে কত বাকি?",
  "রহিম ভাই কত টাকা দেবে",
  "আজ কত বিক্রি হলো?",
  "এই সপ্তাহে চাল কত বিক্রি হয়েছে?",
  "গত সপ্তাহের চেয়ে বিক্রি কেমন?",
  "কার বাকি সবচেয়ে পুরনো?",
  "মহাজনকে মোট কত দিতে হবে?",
  "আজ ক্যাশবাক্সে কত থাকার কথা",
  "how much did we spend on rent this month",
  "এই মাসে লাভ কত হলো?",
];

const args = process.argv.slice(2);
const own = args.filter((a) => !a.startsWith("--"));
const questions = (own.length > 0 ? own : QUESTIONS).slice(0, MAX_QUESTIONS);

const now = new Date();
const asOf = dhakaDate(now);
const book = prepareBook(demoBookInput(now));
const vocabulary = askVocabulary(book);
const config = getAskConfig();
console.log(`Demo shop, ${book.records.length} lines, as of ${asOf}. Model ${config.modelId}, effort ${config.reasoningEffort}.`);
console.log(`Names: ${vocabulary.customers.length} customers, ${vocabulary.suppliers.length} suppliers, ${vocabulary.items.length} items.`);

if (args.includes("--dry-run")) {
  console.log(JSON.stringify(buildAskRequest(config, questions[0]!, vocabulary), null, 2));
  process.exit(0);
}

const bn = makeI18n("bn");
const caller = createAskCaller(getMetaConfig(), config);
let spent = 0;
for (const question of questions) {
  const result = await caller(question, vocabulary);
  console.log(`\nQ: ${question}`);
  if (!result.ok) {
    console.log(`  failed (${result.category}, HTTP ${result.httpStatus ?? "none"}): ${result.message}`);
    continue;
  }
  const usd = estimateCostUsd(config.modelId, result.usage) ?? 0;
  spent += usd;
  const query = parseAskOutput(result.summary.status === "completed" ? result.summary.outputText : null, vocabulary);
  if (!query) {
    console.log(`  no shape (status ${result.summary.status}): ${result.summary.outputText?.slice(0, 300) ?? result.summary.refusal ?? "empty"}`);
    continue;
  }
  const shown = Object.fromEntries(Object.entries(query).filter(([k, v]) => v !== null && !(k in { sales_kind: 1, out_kind: 1, measure: 1 } && v === (k === "measure" ? "sales" : "all"))));
  const answer = answerQuery(book, query, asOf);
  console.log(`  shape: ${JSON.stringify(shown)}`);
  console.log(`  answer: ${answerSentence(answer, bn)}  [${answerRecordIds(answer, book).length} lines]`);
  console.log(`  tokens in ${result.usage?.inputTokens ?? "?"} / out ${result.usage?.outputTokens ?? "?"} (reasoning ${result.usage?.reasoningTokens ?? "?"}) · $${usd.toFixed(5)} · ${result.elapsedMs} ms`);
}
console.log(`\n${questions.length} questions, about $${spent.toFixed(4)} in all.`);
