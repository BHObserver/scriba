/**
 * A spoken answer to one of Scriba's questions (U2): what Muse Voice Transcribe heard, turned
 * into a proposed answer by code. Nothing is saved here: the screen shows what was understood
 * and he confirms it with a tap, as with P1's fix sheet.
 */
import { parseMoney } from "@/lib/numerals";
import { readYesNo } from "@/lib/voice/answer-words";
import { parseSpokenNumber } from "@/lib/voice/number-words";
import type { Question } from "./types";

export type SpokenAnswer =
  /** One option: "yes" to what Scriba proposed, or a reading said aloud. */
  | { kind: "option"; option: string }
  /** A value for the question's field. */
  | { kind: "value"; value: string }
  /** More than one number was heard: he picks one. */
  | { kind: "values"; values: string[] }
  /** "No": show him the other options. */
  | { kind: "no" }
  /** Nothing usable was heard. Say so; never guess. */
  | { kind: "none" };

function sameNumber(a: string, b: string): boolean {
  const x = parseMoney(a);
  const y = parseMoney(b);
  return x.ok && y.ok && x.value === y.value;
}

export function spokenAnswer(q: Question, transcript: string): SpokenAnswer {
  const numeric = q.input?.kind === "money" || q.input?.kind === "quantity";
  const number = parseSpokenNumber(transcript);
  if (number.kind === "one") {
    const reading = q.options.find((o) => o.value != null && sameNumber(o.value, number.value));
    if (reading) return { kind: "option", option: reading.id };
    if (numeric) return { kind: "value", value: number.value };
  }
  if (number.kind === "many" && numeric) return { kind: "values", values: number.values };

  const yesNo = readYesNo(transcript);
  if (yesNo === "yes" && q.proposed) return { kind: "option", option: q.proposed };
  if (yesNo === "no") return { kind: "no" };

  const said = transcript.normalize("NFC").replace(/\s+/g, " ").trim();
  if (said && (q.input?.kind === "text" || q.input?.kind === "date")) return { kind: "value", value: said };
  return { kind: "none" };
}
