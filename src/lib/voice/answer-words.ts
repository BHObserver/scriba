/**
 * Spoken yes and no, deterministically (U2, beside P1's number words).
 *
 * "হ্যাঁ", "ঠিক আছে", "জি" are yes; "না", "ভুল" are no; "ঠিক না" and "not right" are no. Bangla
 * negates after the word, so না, নয় or নেই right after a yes word turns it into a no. Elsewhere
 * না usually negates a verb ("জানি না", I don't know) and is ignored, unless it opens the answer.
 * Anything mixed ("না, ঠিক আছে") or empty is null: the screen asks him to tap instead.
 */
export type SpokenYesNo = "yes" | "no" | null;

// NFC like the words they are compared with (it splits য় into য and nukta).
const wordSet = (list: string[]) => new Set(list.map((w) => w.normalize("NFC")));

// Without chandrabindu: transcripts drop it as often as they keep it.
const YES = wordSet([
  "হ্যা", "হা", "হু", "হুম", "জি", "জ্বি", "জী", "জ্বী", "ঠিক", "ঠিকাছে", "সঠিক", "আচ্ছা", "ওকে", "অবশ্যই",
  "yes", "yeah", "yep", "ok", "okay", "right", "correct", "sure", "haan", "han", "ha", "ji", "thik", "theek", "thikache",
]);
/** No wherever it is said. */
const NO = wordSet(["ভুল", "no", "nope", "wrong", "nah"]);
/** No when it opens the answer; after a yes word, it negates it. */
const NOT = wordSet(["না", "নাহ", "নয়", "নেই", "na"]);

function words(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\u0981/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function readYesNo(text: string): SpokenYesNo {
  const w = words(text);
  const heard: Array<"yes" | "no"> = [];
  for (let i = 0; i < w.length; i++) {
    const word = w[i]!;
    if (YES.has(word)) {
      const negated = NOT.has(w[i + 1] ?? "") || w[i - 1] === "not";
      heard.push(negated ? "no" : "yes");
      if (NOT.has(w[i + 1] ?? "")) i++;
    } else if (NO.has(word) || (i === 0 && NOT.has(word))) {
      heard.push("no");
    }
  }
  if (heard.length === 0) return null;
  return heard.every((h) => h === heard[0]) ? heard[0]! : null;
}
