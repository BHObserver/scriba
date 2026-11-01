# U2b: question copy (2 Nov 2026)

**Status:** done. `bun run check` passes (679 tests, 6 new) and so does `bun run build` (the `private-test-data` junction was moved aside for the build and put back). `scriba-mvp` was merged in first (D5, 6244d70: design files only). Ran beside C2 (Track A, `scriba/`) and U3 (`scriba-u3`); neither was touched. **No hosted-DB change. No live calls.**

## What's done

- **D5's wording is in the engine's `q.*` keys** (`bn.ts`, `en.ts`). The kinds, ids, options and fingerprints are unchanged, so answers saved under U2 still count. D5's prototype keys (`q.visit`, `q.party`, `q.egg`, `q.cash` and the rest) are not in the app. COPY.md Part 4 maps each one to the key that replaced it.
- **`why` on every question** (`{ sentence, verified }` or null), shown under the question:
  - `same_party`: the khata's last due ("Your khata last showed ৳2,800 owed to them."). When the page's "before" is the same, the sentence says so and `verified` is true (show the tick). Only with one match and a due above zero.
  - `delivery` and `price`: "Check the company's memo if you have it. Scriba won't guess a price."
  - `block_kind` (sales): "The page doesn't say cash or credit."
- **Visit figures** in `meaning`: "Selim came from Praan. You owed ৳2,800 before, and paid ৳1,500 this time. Did I get that right?" The figures are what is written, and several payments are summed by code. When neither is written, the sentence names the company as before.
- **Per-unit figures** on doubtful amounts: each reading's `detail` is "6 at ৳15 each" against "6 at ৳1.67 each", or "২ কেজি, প্রতি কেজি ৳৭০" with a unit. Only when the quantity reads as a number above zero.
- **Same party by kind**: "Yes, the same company" / "No, a new supplier", or "the same person" / "a new customer".
- **Date**: "There's no date on this page. Shall I use the day the photo was taken?", with "Yes, the photo's day · 1 Nov", "The day before · 31 Oct" and `q.date.other` for the date input. With no photo day: `q.date.which`, nothing proposed.
- **Price and delivery** use "Later" (পরে দেব) for their later option. The card labels D5 designed are in `q.*` too: `q.prices` (heading of the grouped per-item card), `q.price.slot`, `q.price.save`, `q.date.other`.
- **Server**: `loadQuestionInput` fills `input.dues` from the book (`loadShop` → `partyAccount` as of the photo's day), only for the parties `partiesToExplain` names. The answer route passes `{ dues: false }` for the answer check.
- COPY.md: D5's question rows are gone from Part 3. Part 4 has the mapping and every `q.*` string, generated from the code.

## Decisions (reasons in IMPLEMENTATION_PLAN)

- **The photo's day, not "today".** A page can be photographed days later, so D5's "Shall I use today's?" became the photo's day.
- **"এবার" / "this time", not "আজ" / "today"**, in the visit sentence, for the same reason.
- **No "reads two ways"** in doubt questions. The model may give three readings, so the sentence stays "which amount is written?" with the line quoted. The per-unit `detail` does the work D5 wanted.
- **The due is read only when it is needed** (a full book read). A due of zero or below says nothing.
- **Quotes**: engine sentences keep “…” (D5 used ‘…’ in two strings) so that every card quotes the same way.

## For B7

- Render `sentenceText(i18n, q.sentence)`, then `q.why?.sentence` in the smaller line, with a tick when `q.why.verified`. Render each option's `label`, and its `detail` under it when there is one.
- **The price card**: a `delivery` question shows its `entries` as dashed price gaps, one total field (`input`), "I'll price each one" and "Later". After "each", the engine asks `price:<row>` one per item. Group consecutive `price` questions of one block into one card, headed by `q.prices` with `{ count }`. Each item gets a slot (`q.price.slot`), and "Save the prices" (`q.price.save`) posts one answer per filled slot in order. A single `price` question is its own card with `q.price`.
- Everything else in "For B7" in `U2.md` still holds.
- **Merges**: B7 starts in `scriba/` with `git merge track-engine`. It merges cleanly into `scriba-mvp` at C2 (c1e30d2), checked with `git merge-tree`. `track-u3` also merges cleanly into `track-engine`.

## Open

- The Bangla in the new strings was written here from D5's. It wasn't reviewed by a Bangla reader beyond D5's own copy. F2 should read the cards aloud on a phone.
- `meaning` for account blocks (`supplier_account`, `customer_account`) has no figures. D5 designed figures only for the visit.
