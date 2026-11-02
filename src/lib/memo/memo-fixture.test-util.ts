/** Hand-written memo readings for the memo and question tests: Pran's challan for the north-star visit. */

import { type NormalizedMemo, parseMemoResponse } from "./parse";
import type { MEMO_TOTAL_FIELDS } from "./schema";

export type FixtureLine = {
  id: string;
  text: string;
  item: string | null;
  qty: string | null;
  unit: string | null;
  rate: string | null;
  amount: string | null;
  crossed_out?: boolean;
  review?: string[];
};

export const memoLine = (
  id: string,
  item: string,
  qty: string | null,
  unit: string | null,
  rate: string | null,
  amount: string | null,
  o: Partial<FixtureLine> = {},
): FixtureLine => ({ id, text: [item, qty, unit, rate, amount].filter(Boolean).join(" "), item, qty, unit, rate, amount, ...o });

/** Juice 1 Box, Buiscite 2 Box, Conacor 1 Box on the page; on the memo, ৳480 + ৳720 + ৳500 = ৳1,700. */
export const PRAN_MEMO_LINES = [
  memoLine("m1", "Mango Juice 250ml", "1", "Ctn", "480", "480"),
  memoLine("m2", "Potato Biscuit 40g", "2", "Ctn", "360", "720"),
  memoLine("m3", "Chanachur 300g", "1", "Ctn", "500", "500"),
];

export function memoOf(
  o: {
    lines?: FixtureLine[];
    totals?: Partial<Record<(typeof MEMO_TOTAL_FIELDS)[number], string | null>>;
    company?: string | null;
    person?: string | null;
  } = {},
): NormalizedMemo {
  const output = {
    memo: {
      company: o.company === undefined ? "PRAN Agro Ltd." : o.company,
      person: o.person === undefined ? "Selim" : o.person,
      number: "CH-2041",
      date_text: "01/11/2026",
      legibility: "clear",
    },
    lines: (o.lines ?? PRAN_MEMO_LINES).map((l) => ({ crossed_out: false, review: [], box: null, ...l })),
    totals: { subtotal: null, discount: null, total: "1,700.00", previous_due: null, paid: null, due: null, ...o.totals },
    warnings: [],
  };
  const r = parseMemoResponse({ status: "completed", incompleteReason: null, outputText: JSON.stringify(output), refusal: null });
  if (!r.ok) throw new Error(`${r.kind}: ${r.detail}`);
  return r.memo;
}
