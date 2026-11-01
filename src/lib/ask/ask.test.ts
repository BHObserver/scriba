import { describe, expect, test } from "bun:test";
import { makeI18n } from "@/lib/i18n/format";
import { MESSAGES } from "@/lib/i18n/messages";
import { duesList } from "@/lib/insights/accounts";
import { prepareBook } from "@/lib/insights/book";
import { daySummary } from "@/lib/insights/day";
import { SAMPLE_TODAY, bookInput, makeParty, makeRecords, sampleShop } from "@/lib/insights/testing";
import { type Answer, answerQuery, answerRecordIds } from "./answer";
import { comparisonPeriod, resolvePeriod } from "./period";
import { ASK_INSTRUCTIONS, askUserText } from "./prompt";
import { type AskQuery, askJsonSchema, askQuery, askQuerySchema, askVocabulary, parseAskOutput, partiesNamed, toAskQuery } from "./query";
import { answerFigure, answerSentence, askSuggestions, periodRange } from "./text";

const bn = makeI18n("bn");
const en = makeI18n("en");
const ASOF = "2026-11-01";

/** A small shop: two customers (one a merged spelling), a supplier, a week of lines. */
function smallBook() {
  const records = makeRecords([
    { date: "2026-10-20", type: "credit_sale", taka: 500, party: "karim", item: "চাল", id: "k1" },
    { date: "2026-10-26", type: "cash_sale", taka: 300, item: "ডাল", id: "s1" },
    { date: "2026-10-28", type: "credit_sale", taka: 200, party: "karim2", item: "চাল", id: "k2" },
    { date: "2026-10-30", type: "repayment", taka: 100, party: "karim", id: "k3" },
    { date: "2026-10-31", type: "cash_sale", taka: 450, item: "তেল", id: "s2" },
    { date: "2026-11-01", type: "cash_sale", taka: 600, item: "চাল", id: "s3" },
    { date: "2026-11-01", type: "credit_sale", taka: 250, party: "rina", item: "চাল", id: "r1" },
    { date: "2026-11-01", type: "purchase", taka: 1000, party: "haque", item: "চাল", id: "p1" },
    { date: "2026-11-01", type: "expense", taka: 150, item: "ভাড়া", id: "e1" },
    { date: "2026-10-29", type: "credit_purchase", taka: 2000, party: "haque", item: "তেল", id: "p2" },
  ]);
  const parties = [
    makeParty("karim", "customer", "করিম মিয়া"),
    makeParty("karim2", "customer", "মোঃ করিম", "karim"),
    makeParty("rina", "customer", "রিনা আপা"),
    makeParty("haque", "supplier", "হক স্টোর"),
  ];
  return prepareBook(bookInput(records, { parties, usualOpeningCashPoisha: 50_000 }));
}

const ask = (fields: Partial<AskQuery> & Pick<AskQuery, "intent">) => askQuery(fields);

describe("periods", () => {
  const p = (period: AskQuery["period"], extra: Partial<AskQuery> = {}) => resolvePeriod({ period, days: null, day: null, month: null, ...extra }, ASOF, "2026-09-15");

  test("named periods are business dates ending today", () => {
    expect(p("today")).toEqual({ key: "today", from: ASOF, to: ASOF, days: 1 });
    expect(p("yesterday")).toMatchObject({ from: "2026-10-31", to: "2026-10-31" });
    expect(p("last_7_days")).toMatchObject({ from: "2026-10-26", to: ASOF, days: 7 });
    expect(p("previous_7_days")).toMatchObject({ from: "2026-10-19", to: "2026-10-25", days: 7 });
    expect(p("this_month")).toMatchObject({ from: "2026-11-01", to: ASOF, days: 1 });
    expect(p("last_month")).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31 });
    expect(p("last_n_days", { days: 10 })).toMatchObject({ from: "2026-10-23", to: ASOF, days: 10 });
    expect(p("all_time")).toMatchObject({ from: "2026-09-15", to: ASOF });
  });

  test("a day of the month is the most recent one on or before today", () => {
    expect(p("on_date", { day: 1 })).toMatchObject({ from: "2026-11-01" });
    expect(p("on_date", { day: 15 })).toMatchObject({ from: "2026-10-15" });
    expect(p("on_date", { day: 31 })).toMatchObject({ from: "2026-10-31" });
    expect(p("on_date", { day: 28, month: 10 })).toMatchObject({ from: "2026-10-28" });
    expect(p("on_date", { day: 25, month: 12 })).toMatchObject({ from: "2025-12-25" });
    expect(resolvePeriod({ period: "on_date", day: 31, month: null, days: null }, "2026-03-15", null)).toMatchObject({ from: "2026-01-31" });
  });

  test("no real period gives null, never a guess", () => {
    expect(p("on_date", { day: 31, month: 11 })).toBeNull();
    expect(p("on_date", { day: 30, month: 2 })).toBeNull();
    expect(p("on_date", { day: null })).toBeNull();
    expect(p("on_date", { day: 0 })).toBeNull();
    expect(p("on_date", { day: 5, month: 13 })).toBeNull();
    expect(p("last_n_days", { days: 0 })).toBeNull();
    expect(p("last_n_days", { days: null })).toBeNull();
    expect(p("last_n_days", { days: 400 })).toBeNull();
  });

  test("an empty book's all time is today", () => {
    expect(resolvePeriod({ period: "all_time", days: null, day: null, month: null }, ASOF, null)).toMatchObject({ from: ASOF, to: ASOF });
  });

  test("comparisons default to the same length just before", () => {
    expect(comparisonPeriod(p("today")!, null, ASOF)).toMatchObject({ key: "yesterday" });
    expect(comparisonPeriod(p("last_7_days")!, null, ASOF)).toMatchObject({ key: "previous_7_days" });
    expect(comparisonPeriod(p("last_n_days", { days: 10 })!, null, ASOF)).toEqual({ key: "before", from: "2026-10-13", to: "2026-10-22", days: 10 });
    expect(comparisonPeriod(p("this_month")!, "last_month", ASOF)).toMatchObject({ key: "last_month", from: "2026-10-01" });
  });
});

describe("the shop's words", () => {
  test("names by last activity, merged spellings once, items by use", () => {
    const v = askVocabulary(smallBook());
    expect(v.customers).toEqual(["রিনা আপা", "করিম মিয়া"]);
    expect(v.suppliers).toEqual(["হক স্টোর"]);
    expect(v.items[0]).toBe("চাল");
    expect(v.items).toContain("ভাড়া");
    expect(askVocabulary(smallBook(), { parties: 1, items: 2 })).toEqual({ customers: ["রিনা আপা"], suppliers: ["হক স্টোর"], items: ["চাল", "তেল"] });
  });

  test("the schema only offers this shop's names and items, and holds no amount", () => {
    const schema = askJsonSchema(askVocabulary(smallBook()));
    expect(schema.required).toEqual(Object.keys(askQuerySchema.shape));
    expect(Object.keys(schema.properties)).toEqual(schema.required);
    expect(schema.properties.party).toEqual({ anyOf: [{ type: "string", enum: ["রিনা আপা", "করিম মিয়া", "হক স্টোর"] }, { type: "null" }] });
    expect(JSON.stringify(schema)).not.toMatch(/amount|poisha|taka/i);
    // An empty shop leaves nothing to pick.
    expect(askJsonSchema({ customers: [], suppliers: [], items: [] }).properties.item).toEqual({ type: "null" });
  });

  test("the prompt carries names and the question, never a figure", () => {
    const text = askUserText("করিমের কাছে কত বাকি?", askVocabulary(smallBook()));
    expect(text).toContain("Customers in this khata: রিনা আপা | করিম মিয়া");
    expect(text).toContain("Question: করিমের কাছে কত বাকি?");
    expect(text).not.toMatch(/[০-৯0-9]/);
    expect(ASK_INSTRUCTIONS).toContain("never state or compute any number");
  });

  test("model output: names outside the list are dropped, broken output is no shape", () => {
    const v = askVocabulary(smallBook());
    const out = { ...ask({ intent: "party_due" }), party: "জামাল", name_said: "  জামাল  " };
    expect(parseAskOutput(JSON.stringify(out), v)).toMatchObject({ party: null, name_said: "জামাল" });
    expect(parseAskOutput(JSON.stringify({ ...out, party: "করিম মিয়া" }), v)?.party).toBe("করিম মিয়া");
    expect(parseAskOutput(JSON.stringify({ ...ask({ intent: "sales" }), item: "সাবান" }), v)?.item).toBeNull();
    expect(parseAskOutput("{not json", v)).toBeNull();
    expect(parseAskOutput(null, v)).toBeNull();
    expect(parseAskOutput(JSON.stringify({ intent: "sales" }), v)).toBeNull();
    expect(toAskQuery({ ...ask({ intent: "sales" }), intent: "profit" }, v)).toBeNull();
    expect(toAskQuery({ ...ask({ intent: "sales" }), name_said: "ক".repeat(100) }, v)?.name_said).toHaveLength(60);
  });

  test("a spoken name finds its party: case endings, titles, merged spellings, part of a name", () => {
    const book = smallBook();
    const ids = (name: string, kind: "customer" | "supplier" | null = null) => partiesNamed(book, name, kind).map((p) => p.id);
    expect(ids("করিম মিয়া")).toEqual(["karim"]);
    expect(ids("করিমের")).toEqual(["karim"]);
    expect(ids("মোঃ করিমকে")).toEqual(["karim"]);
    expect(ids("রিনা আপার")).toEqual(["rina"]);
    expect(ids("রিনার")).toEqual(["rina"]);
    expect(ids("হক")).toEqual(["haque"]);
    expect(ids("জামাল")).toEqual([]);
    expect(ids("")).toEqual([]);
  });

  test("two people with one name are both returned; the kind asked for wins", () => {
    const book = prepareBook(
      bookInput([], { parties: [makeParty("a", "customer", "জসিম"), makeParty("b", "customer", "জসিম উদ্দিন"), makeParty("c", "supplier", "জসিম")] }),
    );
    expect(partiesNamed(book, "জসিম", "supplier").map((p) => p.id)).toEqual(["c"]);
    expect(partiesNamed(book, "জসিম", "customer").map((p) => p.id)).toEqual(["a"]);
    expect(partiesNamed(book, "জসিম উদ্দিনের", "customer").map((p) => p.id)).toEqual(["b"]);
  });
});

describe("answers are computed by code", () => {
  const book = smallBook();
  const run = (q: Partial<AskQuery> & Pick<AskQuery, "intent">) => answerQuery(book, ask(q), ASOF);

  test("a party's due follows merges and keeps its lines", () => {
    const a = run({ intent: "party_due", name_said: "করিম" });
    expect(a).toMatchObject({ kind: "due", partyId: "karim", name: "করিম মিয়া", balance: { poisha: 60_000 } });
    expect(answerRecordIds(a, book)).toEqual(["k3", "k2", "k1"]);
    expect(run({ intent: "party_due", party: "হক স্টোর", party_kind: "supplier" })).toMatchObject({ kind: "due", partyKind: "supplier", balance: { poisha: 200_000 } });
  });

  test("an unknown name or no name is said, not guessed", () => {
    expect(run({ intent: "party_due", name_said: "জামাল" })).toEqual({ kind: "not_found", what: "party", said: "জামাল" });
    expect(run({ intent: "party_due" })).toEqual({ kind: "unknown" });
  });

  test("two people with the name ask which one", () => {
    const twins = prepareBook(bookInput([], { parties: [makeParty("a", "customer", "জসিম"), makeParty("b", "customer", "জসিম")] }));
    expect(answerQuery(twins, ask({ intent: "party_due", name_said: "জসিম" }), ASOF)).toMatchObject({ kind: "pick", options: [{ partyId: "a" }, { partyId: "b" }] });
  });

  test("dues totals and risky dues match the dues screen", () => {
    const dues = duesList(book, "customer", ASOF);
    expect(run({ intent: "total_dues" })).toMatchObject({ kind: "dues_total", total: { poisha: dues.total.poisha }, people: dues.parties.length });
    const shop = prepareBook(sampleShop());
    const risky = answerQuery(shop, ask({ intent: "risky_dues" }), SAMPLE_TODAY);
    const flagged = duesList(shop, "customer", SAMPLE_TODAY).parties.filter((p) => p.risks.length > 0);
    expect(risky.kind === "risky" && risky.parties.map((p) => p.partyId)).toEqual(flagged.map((p) => p.partyId));
    expect(risky.kind === "risky" && risky.total.poisha).toBe(flagged.reduce((s, p) => s + p.balancePoisha, 0));
  });

  test("sales in a period, by kind and by item", () => {
    expect(run({ intent: "sales", period: "today" })).toMatchObject({ kind: "sales", total: { poisha: 85_000 }, lines: 2, parts: [{ type: "cash_sale", figure: { poisha: 60_000 } }, { type: "credit_sale", figure: { poisha: 25_000 } }] });
    expect(run({ intent: "sales", period: "last_7_days", sales_kind: "cash" })).toMatchObject({ total: { poisha: 135_000 }, lines: 3 });
    expect(run({ intent: "sales", period: "all_time", item: "চাল" })).toMatchObject({ item: "চাল", total: { poisha: 155_000 }, lines: 4 });
    expect(run({ intent: "sales", period: "all_time", item_said: "সাবান" })).toEqual({ kind: "not_found", what: "item", said: "সাবান" });
    expect(run({ intent: "sales", period: "on_date", day: 31, month: 11 })).toEqual({ kind: "unknown" });
  });

  test("money out is cash out like Today; stock bought includes credit", () => {
    const day = daySummary(book, ASOF);
    expect(run({ intent: "money_out" })).toMatchObject({ kind: "out", total: { poisha: day.moneyOut.poisha } });
    expect(run({ intent: "money_out", period: "last_7_days", out_kind: "purchase" })).toMatchObject({ total: { poisha: 300_000 }, lines: 2 });
    expect(run({ intent: "money_out", period: "last_7_days", item: "তেল" })).toMatchObject({ item: "তেল", total: { poisha: 200_000 } });
    expect(run({ intent: "money_out", out_kind: "supplier_payment", item: "চাল" })).toEqual({ kind: "unknown" });
  });

  test("comparisons and the drawer", () => {
    expect(run({ intent: "compare", period: "today" })).toMatchObject({ kind: "compare", a: { figure: { poisha: 85_000 } }, b: { period: { key: "yesterday" }, figure: { poisha: 45_000 } } });
    expect(run({ intent: "compare", period: "today", compare_to: "today" })).toEqual({ kind: "unknown" });
    const day = daySummary(book, ASOF);
    expect(run({ intent: "drawer_cash" })).toMatchObject({ kind: "drawer", expected: { poisha: day.expectedCash.poisha } });
    expect(run({ intent: "drawer_cash", period: "last_7_days" })).toEqual({ kind: "unknown" });
  });

  test("an empty shop answers with zero, never an error", () => {
    const empty = prepareBook(bookInput([]));
    expect(answerQuery(empty, ask({ intent: "sales", period: "all_time" }), ASOF)).toMatchObject({ total: { poisha: 0 }, lines: 0 });
    expect(answerQuery(empty, ask({ intent: "total_dues" }), ASOF)).toMatchObject({ people: 0 });
    expect(answerRecordIds({ kind: "unknown" }, empty)).toEqual([]);
  });
});

describe("words", () => {
  const book = smallBook();
  const say = (a: Answer, i18n = bn) => answerSentence(a, i18n);
  const run = (q: Partial<AskQuery> & Pick<AskQuery, "intent">) => answerQuery(book, ask(q), ASOF);

  test("Bangla answers read as one sentence with code's numbers", () => {
    expect(say(run({ intent: "party_due", name_said: "করিম" }))).toBe("করিম মিয়ার কাছে বাকি ৳৬০০।");
    expect(say(run({ intent: "party_due", party: "হক স্টোর", party_kind: "supplier" }))).toBe("হক স্টোরের কাছে আপনার দেনা ৳২,০০০।");
    expect(say(run({ intent: "sales", period: "today" }))).toBe("আজ বিক্রি ৳৮৫০, এর মধ্যে ৳২৫০ বাকিতে।");
    expect(say(run({ intent: "sales", period: "yesterday" }))).toBe("গতকাল বিক্রি ৳৪৫০, সবটাই নগদে।");
    expect(say(run({ intent: "sales", period: "last_7_days", item: "চাল" }))).toBe("শেষ সাত দিনে চাল বিক্রি হয়েছে ৳১,০৫০, ৩টি লাইনে।");
    expect(say(run({ intent: "compare", period: "today" }))).toBe("আজ বিক্রি ৳৮৫০, গতকালের চেয়ে ৳৪০০ বেশি।");
    expect(say(run({ intent: "money_out", period: "on_date", day: 1 }))).toBe("১ নভেম্বর তারিখে টাকা গেছে ৳১,১৫০।");
    expect(say({ kind: "not_found", what: "party", said: "জামাল" })).toBe("খাতায় “জামাল” নামে কাউকে পাইনি, তাই Scriba আন্দাজে কিছু বলবে না।");
  });

  test("English answers", () => {
    expect(say(run({ intent: "party_due", name_said: "করিম" }), en)).toBe("করিম মিয়া owes you ৳600.");
    expect(say(run({ intent: "compare", period: "last_7_days" }), en)).toMatch(/^In the last 7 days, sales were ৳1,800, ৳1,300 more than the 7 days before\.$/);
    expect(say({ kind: "unknown" }, en)).toBe("The khata doesn't answer this, so Scriba won't guess.");
  });

  test("zero and advance balances", () => {
    const records = makeRecords([
      { date: "2026-10-30", type: "credit_sale", taka: 100, party: "a" },
      { date: "2026-10-31", type: "repayment", taka: 100, party: "a" },
      { date: "2026-10-31", type: "repayment", taka: 50, party: "b" },
    ]);
    const b = prepareBook(bookInput(records, { parties: [makeParty("a", "customer", "রিনা"), makeParty("b", "customer", "সাথী")] }));
    expect(say(answerQuery(b, ask({ intent: "party_due", name_said: "রিনা" }), ASOF))).toBe("রিনার কাছে এখন কোনো বাকি নেই।");
    const advance = answerQuery(b, ask({ intent: "party_due", name_said: "সাথী" }), ASOF);
    expect(say(advance)).toBe("সাথী ৳৫০ আগাম দিয়ে রেখেছেন।");
    expect(answerFigure(advance)).toBe(5_000);
  });

  test("ranges, the big number, and suggestions that need no model", () => {
    expect(periodRange(resolvePeriod({ period: "last_7_days", days: null, day: null, month: null }, ASOF, null)!, bn)).toBe("২৬ অক্টোবর থেকে ১ নভেম্বর");
    expect(answerFigure({ kind: "unknown" })).toBeNull();
    const sugs = askSuggestions("করিম মিয়া", bn);
    expect(sugs[0]!.text).toBe("করিম মিয়ার কাছে কত বাকি?");
    for (const s of sugs) expect(toAskQuery(s.query, askVocabulary(book))).toEqual(s.query);
    expect(askSuggestions(null, en).map((s) => s.query.intent)).not.toContain("party_due");
  });

  test("every answer kind has words in both languages", () => {
    const keys = Object.keys(MESSAGES.bn).filter((k) => k.startsWith("ask."));
    expect(keys.length).toBeGreaterThan(90);
    for (const k of keys) expect(MESSAGES.en[k as keyof typeof MESSAGES.en]).toBeTruthy();
  });
});
