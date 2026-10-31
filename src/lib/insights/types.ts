/**
 * Inputs and shared shapes of the insights engine. Everything here is computed by code from
 * human-confirmed records; the model never produces a number the money screens show.
 * Money is integer poisha; dates are business dates "YYYY-MM-DD" (Asia/Dhaka).
 */
import type { PartyKind } from "@/lib/ledger/parties";
import type { TransactionType } from "@/lib/ledger/types";

/** A transaction type a confirmed record can hold (the database refuses "unknown"). */
export type RecordType = Exclude<TransactionType, "unknown">;

/** One confirmed line, joined with its page's business date and capture time. */
export type InsightRecord = {
  id: string;
  documentId: string;
  runId: string;
  /** The page's business date. */
  businessDate: string;
  /** When the page was photographed (ISO); orders the pages of one day. */
  capturedAt: string;
  lineOrder: number;
  type: RecordType;
  /** As stored; the engine follows merges itself. */
  partyId: string | null;
  itemName: string | null;
  amountPoisha: number;
  wasCorrected: boolean;
  confirmedAt: string;
};

export type InsightParty = {
  id: string;
  kind: PartyKind;
  displayName: string;
  mergedInto: string | null;
};

export type InsightDayClose = {
  businessDate: string;
  openingCashPoisha: number;
  expectedCashPoisha: number;
  countedCashPoisha: number;
};

export type BookInput = {
  records: readonly InsightRecord[];
  parties: readonly InsightParty[];
  closes: readonly InsightDayClose[];
  /** The shop profile's usual cash in the drawer at the start of a day. */
  usualOpeningCashPoisha: number;
};

/** A number shown to the user and the confirmed records it was computed from (drill-down). */
export type Figure = { poisha: number; recordIds: string[] };
