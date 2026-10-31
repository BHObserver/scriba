import { describe, expect, test } from "bun:test";
import { duesList, partyAccount, partyAccounts } from "./accounts";
import { prepareBook } from "./book";
import { addDays } from "./calendar";
import { bookInput, makeParty, makeRecords, type RecSpec, SAMPLE_TODAY, sampleShop } from "./testing";

const AS_OF = "2026-11-01";
const ago = (days: number) => addDays(AS_OF, -days);
const customer = makeParty("k", "customer", "করিম");

function account(specs: Array<Omit<RecSpec, "party">>, asOf = AS_OF) {
  const book = prepareBook(bookInput(makeRecords(specs.map((s) => ({ ...s, party: "k" }))), { parties: [customer] }));
  return partyAccount(book, "k", asOf)!;
}

describe("D3's sample shop", () => {
  const book = prepareBook(sampleShop());

  test("রহিম উদ্দিন: ৳৩,২৫০ owed, nothing paid for 45 days", () => {
    const rahim = partyAccount(book, "rahim", SAMPLE_TODAY)!;
    expect(rahim.balancePoisha).toBe(325_000);
    expect(rahim.lastPayment).toMatchObject({ amountPoisha: 50_000, daysAgo: 45 });
    expect(rahim.oldestUnpaid).toMatchObject({ leftPoisha: 95_000, daysAgo: 60 });
    expect(rahim.unpaidRecordIds).toHaveLength(5);
    expect(rahim.weeklyBalances).toEqual([307_000, 307_000, 325_000, 325_000]);
    expect(rahim.risks.map((r) => r.code)).toEqual(["no_payment"]);
    expect(rahim.risks[0]).toMatchObject({ days: 45 });
    expect(rahim.risks[0]!.recordIds).toEqual([rahim.lastPayment!.recordId, rahim.oldestUnpaid!.recordId]);
  });

  test("সুমাইয়া আপা: balance up three weeks running", () => {
    const sumaiya = partyAccount(book, "sumaiya", SAMPLE_TODAY)!;
    expect(sumaiya.weeklyBalances).toEqual([20_000, 56_000, 98_000, 163_000]);
    expect(sumaiya.risks.map((r) => r.code)).toEqual(["growing"]);
    expect(sumaiya.risks[0]!.recordIds).toHaveLength(3);
  });

  test("বাবুল: ৳১,৫০০ on credit at once, usually ৳৩০০", () => {
    const babul = partyAccount(book, "babul", SAMPLE_TODAY)!;
    expect(babul.balancePoisha).toBe(188_000);
    expect(babul.risks).toEqual([
      { code: "big_credit", rank: 1, amountPoisha: 150_000, usualPoisha: 30_000, recordIds: [expect.any(String)] },
    ]);
  });

  test("receivables: riskiest first, then by balance; total and flagged count", () => {
    const dues = duesList(book, "customer", SAMPLE_TODAY);
    expect(dues.parties.map((a) => a.partyId)).toEqual(["rahim", "sumaiya", "babul", "shahana", "karim", "minu", "jasim", "nasir"]);
    expect(dues.total.poisha).toBe(1_173_000);
    expect(dues.flagged).toBe(3);
    expect(new Set(dues.total.recordIds).size).toBe(dues.total.recordIds.length);
  });

  test("payables: রফিক ট্রেডার্স has been paid nothing for 24 days", () => {
    const dues = duesList(book, "supplier", SAMPLE_TODAY);
    expect(dues.parties.map((a) => [a.partyId, a.balancePoisha])).toEqual([
      ["rafiq", 320_000],
      ["alamin", 840_000],
      ["haque", 150_000],
    ]);
    expect(dues.parties[0]!.risks[0]).toMatchObject({ code: "no_payment", days: 24 });
    expect(dues.parties[1]!.lastPayment).toMatchObject({ amountPoisha: 60_000, daysAgo: 0 });
    expect(dues.total.poisha).toBe(1_310_000);
  });
});

describe("running balance and FIFO", () => {
  test("payments clear the oldest credit first", () => {
    const a = account([
      { date: ago(20), type: "credit_sale", taka: 300, id: "c1" },
      { date: ago(15), type: "credit_sale", taka: 200, id: "c2" },
      { date: ago(10), type: "repayment", taka: 350, id: "p1" },
      { date: ago(5), type: "credit_sale", taka: 100, id: "c3" },
    ]);
    expect(a.entries.map((e) => [e.direction, e.balancePoisha])).toEqual([
      ["up", 30_000],
      ["up", 50_000],
      ["down", 15_000],
      ["up", 25_000],
    ]);
    expect(a.oldestUnpaid).toEqual({ recordId: "c2", date: ago(15), leftPoisha: 15_000, daysAgo: 15 });
    expect(a.unpaidRecordIds).toEqual(["c2", "c3"]);
  });

  test("fully paid: no oldest unpaid credit", () => {
    const a = account([
      { date: ago(20), type: "credit_sale", taka: 300 },
      { date: ago(10), type: "repayment", taka: 300 },
    ]);
    expect(a.balancePoisha).toBe(0);
    expect(a.oldestUnpaid).toBeNull();
    expect(a.unpaidRecordIds).toEqual([]);
  });

  test("an opening balance is the starting point; later ones repeat the balance and are ignored", () => {
    const a = account([
      { date: ago(30), type: "opening_balance", taka: 900, doc: "pg1", id: "open" },
      { date: ago(30), type: "credit_sale", taka: 300, doc: "pg1" },
      { date: ago(30), type: "closing_balance", taka: 1200, doc: "pg1" },
      { date: ago(20), type: "opening_balance", taka: 1200, doc: "pg2" },
      { date: ago(20), type: "repayment", taka: 500, doc: "pg2" },
      { date: ago(20), type: "credit_sale", taka: 100, doc: "pg2" },
    ]);
    expect(a.entries.map((e) => e.direction)).toEqual(["start", "up", "down", "up"]);
    expect(a.balancePoisha).toBe(80_000);
    expect(a.oldestUnpaid).toMatchObject({ recordId: "open", leftPoisha: 40_000 });
  });

  test("an opening balance after a credit is not added", () => {
    const a = account([
      { date: ago(10), type: "credit_sale", taka: 300 },
      { date: ago(5), type: "opening_balance", taka: 300 },
    ]);
    expect(a.balancePoisha).toBe(30_000);
  });

  test("lines after the as-of date are left out", () => {
    const a = account(
      [
        { date: ago(3), type: "credit_sale", taka: 300 },
        { date: ago(1), type: "credit_sale", taka: 200 },
      ],
      ago(2),
    );
    expect(a.balancePoisha).toBe(30_000);
  });

  test("a supplier's balance is credit purchases minus payments; cash purchases don't count", () => {
    const supplier = makeParty("s", "supplier", "রফিক ট্রেডার্স");
    const records = makeRecords([
      { date: ago(10), type: "credit_purchase", taka: 5000, party: "s" },
      { date: ago(8), type: "purchase", taka: 900, party: "s" },
      { date: ago(5), type: "supplier_payment", taka: 2000, party: "s" },
    ]);
    const a = partyAccount(prepareBook(bookInput(records, { parties: [supplier] })), "s", AS_OF)!;
    expect(a.balancePoisha).toBe(300_000);
    expect(a.entries).toHaveLength(2);
  });
});

describe("risk rules", () => {
  test("never paid: days since the oldest unpaid credit", () => {
    const a = account([{ date: ago(40), type: "credit_sale", taka: 500 }]);
    expect(a.risks).toMatchObject([{ code: "no_payment", days: 40 }]);
  });

  test("not flagged below the threshold", () => {
    expect(account([{ date: ago(29), type: "credit_sale", taka: 500 }]).risks).toEqual([]);
  });

  test("paid everything off long ago and took new credit recently: not flagged", () => {
    const a = account([
      { date: ago(60), type: "credit_sale", taka: 500 },
      { date: ago(50), type: "repayment", taka: 500 },
      { date: ago(3), type: "credit_sale", taka: 400 },
    ]);
    expect(a.lastPayment?.daysAgo).toBe(50);
    expect(a.risks).toEqual([]);
  });

  test("nothing owed, nothing flagged", () => {
    const a = account([
      { date: ago(90), type: "credit_sale", taka: 500 },
      { date: ago(80), type: "repayment", taka: 700 },
    ]);
    expect(a.balancePoisha).toBe(-20_000);
    expect(a.risks).toEqual([]);
  });

  test("an unusual credit needs three older credits to know what is usual", () => {
    const two = [
      { date: ago(25), type: "credit_sale" as const, taka: 300 },
      { date: ago(20), type: "credit_sale" as const, taka: 300 },
    ];
    const recent = { date: ago(1), type: "credit_sale" as const, taka: 2000 };
    expect(account([...two, recent]).risks).toEqual([]);
    expect(account([...two, { date: ago(10), type: "credit_sale", taka: 300 }, recent]).risks.map((r) => r.code)).toContain("big_credit");
  });

  test("an unusual credit must also be at least ৳১,০০০", () => {
    const a = account([
      { date: ago(30), type: "credit_sale", taka: 100 },
      { date: ago(20), type: "credit_sale", taka: 100 },
      { date: ago(10), type: "credit_sale", taka: 100 },
      { date: ago(1), type: "credit_sale", taka: 900 },
    ]);
    expect(a.risks.map((r) => r.code)).not.toContain("big_credit");
  });

  test("several risks: highest rank first", () => {
    const a = account([
      { date: ago(60), type: "credit_sale", taka: 100 },
      { date: ago(50), type: "credit_sale", taka: 100 },
      { date: ago(40), type: "credit_sale", taka: 100 },
      { date: ago(16), type: "credit_sale", taka: 100 },
      { date: ago(9), type: "credit_sale", taka: 100 },
      { date: ago(2), type: "credit_sale", taka: 1500 },
    ]);
    expect(a.risks.map((r) => r.code)).toEqual(["no_payment", "growing", "big_credit"]);
  });
});

describe("merged parties", () => {
  const parties = [makeParty("a", "customer", "করিম"), makeParty("b", "customer", "করীম ভাই", "a")];
  const records = makeRecords([
    { date: ago(10), type: "credit_sale", taka: 300, party: "b" },
    { date: ago(5), type: "credit_sale", taka: 200, party: "a" },
    { date: ago(2), type: "repayment", taka: 100, party: "b" },
  ]);
  const book = prepareBook(bookInput(records, { parties }));

  test("one account under the party they were merged into", () => {
    const accounts = partyAccounts(book, AS_OF);
    expect(accounts.map((a) => [a.partyId, a.name, a.balancePoisha])).toEqual([["a", "করিম", 40_000]]);
  });

  test("opening the merged party opens the account it was merged into", () => {
    expect(partyAccount(book, "b", AS_OF)?.partyId).toBe("a");
    expect(partyAccount(book, "missing", AS_OF)).toBeNull();
  });
});

describe("duesList", () => {
  test("an empty book has no dues", () => {
    const dues = duesList(prepareBook(bookInput([])), "customer", AS_OF);
    expect(dues).toEqual({ kind: "customer", parties: [], total: { poisha: 0, recordIds: [] }, flagged: 0 });
  });

  test("a single day of credit", () => {
    const records = makeRecords([{ date: AS_OF, type: "credit_sale", taka: 250, party: "k" }]);
    const dues = duesList(prepareBook(bookInput(records, { parties: [customer] })), "customer", AS_OF);
    expect(dues.parties.map((a) => a.balancePoisha)).toEqual([25_000]);
    expect(dues.flagged).toBe(0);
  });
});
