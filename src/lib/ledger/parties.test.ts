import { describe, expect, test } from "bun:test";
import { normalizePartyName, partyLinkFor } from "./parties";
import type { EntryValues, PageValues, TransactionType } from "./types";

describe("normalizePartyName", () => {
  test("common spellings of one name share a key", () => {
    for (const name of ["করিম", "মোঃ করিম ভাই", "মো. করীম", "মোহাম্মদ করিম সাহেব", "  করিম  "]) {
      expect(normalizePartyName(name)).toBe("করিম");
    }
    expect(normalizePartyName("শফিক")).toBe(normalizePartyName("সফিক"));
    expect(normalizePartyName("গণেশ দা")).toBe(normalizePartyName("গনেশ"));
    expect(normalizePartyName("রহমান মহাজন")).toBe("রহমান");
  });

  test("different people stay different", () => {
    expect(normalizePartyName("করিম")).not.toBe(normalizePartyName("রহিম"));
    expect(normalizePartyName("রহিম ২")).toBe("রহিম 2");
    expect(normalizePartyName("রহিম ২")).not.toBe(normalizePartyName("রহিম"));
  });

  test("a title alone is kept as the name; blanks give null", () => {
    expect(normalizePartyName("ভাই")).toBe("ভাই");
    expect(normalizePartyName("  ")).toBeNull();
    expect(normalizePartyName(null)).toBeNull();
  });
});

const line = (type: TransactionType, customer: string | null = null): EntryValues => ({
  sourceText: "",
  type,
  customer,
  item: null,
  quantityText: null,
  unit: null,
  rateText: null,
  amountText: "১০০",
  balanceText: null,
  crossedOut: false,
});
const page = (ledgerType: PageValues["ledgerType"], accountName: string | null = null): PageValues => ({ dateText: null, ledgerType, accountName });

describe("partyLinkFor", () => {
  test("a customer credit page names its customer once, at the top", () => {
    const types: TransactionType[] = ["opening_balance", "credit_sale", "repayment", "closing_balance"];
    for (const t of types) {
      expect(partyLinkFor(line(t), page("customer_credit", "মোঃ করিম"), types)).toEqual({ kind: "customer", key: "করিম", name: "মোঃ করিম" });
    }
  });

  test("a name written on the line wins over the page's account", () => {
    expect(partyLinkFor(line("credit_sale", "রহিম"), page("customer_credit", "করিম"), ["credit_sale"])?.key).toBe("রহিম");
  });

  test("unnamed cash sales, expenses and totals have no party", () => {
    const types: TransactionType[] = ["cash_sale", "expense", "subtotal"];
    for (const t of types) expect(partyLinkFor(line(t), page("cash_sales", "নগদ বিক্রি"), types)).toBeNull();
    expect(partyLinkFor(line("expense", "বিদ্যুৎ অফিস"), page("mixed"), ["expense"])).toBeNull();
  });

  test("purchases and supplier payments belong to a supplier", () => {
    const types: TransactionType[] = ["cash_sale", "purchase", "supplier_payment"];
    expect(partyLinkFor(line("purchase", "হাসান ট্রেডার্স"), page("mixed"), types)).toEqual({ kind: "supplier", key: "হাসান ট্রেডার্স", name: "হাসান ট্রেডার্স" });
    expect(partyLinkFor(line("supplier_payment"), page("mixed", "দোকান"), types)).toBeNull();
  });

  test("balances on a supplier's page belong to that supplier", () => {
    const types: TransactionType[] = ["opening_balance", "credit_purchase", "supplier_payment", "closing_balance"];
    const p = page("mixed", "রহমান মহাজন");
    expect(partyLinkFor(line("opening_balance"), p, types)).toEqual({ kind: "supplier", key: "রহমান", name: "রহমান মহাজন" });
    expect(partyLinkFor(line("credit_purchase"), p, types)?.kind).toBe("supplier");
  });
});
