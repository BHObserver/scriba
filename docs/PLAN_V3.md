# Scriba plan v3: scan and understand

Written 2 Nov 2026, after the user's first test on a real page. This file adds sessions to `docs/MASTER_PLAN.md`. That file's rules still apply: "How to use", the non-negotiables, the architecture decisions and the tracks. Progress lives in `docs/sessions/<ID>.md`, as before.

## What the user asked for (2 Nov)

> Even from unorganised, scattered writing, the Meta AI should extract and organise it properly. The interaction should be beautiful: a slider where Scriba asks whether something is right or what the user meant. If it's right, he confirms with one button; if not, he fixes it by voice or typing. Sleek and modern.

They also said: "Don't worry about the deadline, whatever we do we do it right." The hackathon date no longer cuts scope; quality does. Every session still leaves the app working.

## The test page (north star)

Part of a real page, written by the user. Company sales reps (Pran, Aarong, Fresh) come to collect money and deliver goods:

```
Praan (Selim)
Before - 2800
Given - 1500
Juice 1 Box
Buiscite 2 Box
Conacor - 1 Box
```

Meaning (the user confirmed it on 2 Nov): **Pran** is a supplier company and **Selim** its sales rep. *Before* is what the shop owed Pran before this visit. *Given* is what the shop paid Selim. The goods are new stock on credit, and **no prices are written**. So the due now is 2,800 − 1,500 + the price of the goods, and that price has to come from the shopkeeper or from the company's memo. Scriba must never guess it.

The two photos are in the demo account, uploaded 1 Nov 18:36 UTC from Scriba's own camera, at 2160×3840. The user agreed on 2 Nov that the page can be a test sample (in git-ignored `private-test-data/`).

## Why Scriba fails on it today (2 Nov findings)

1. **Distance.** In a portrait 9:16 frame, a page shot from a distance is a small part of the picture. Meta shrinks every image to about 3.3 MP (`MODEL_TARGET_PIXELS`), so the handwriting gets perhaps 1–1.5 MP. The camera wasn't low-resolution: these frames were 4K.
2. **Goods lines are dropped.** Prompt 4 makes an entry only from "a line that carries an amount or a balance". "Juice 1 Box" has no amount.
3. **Pran's 2800 goes to the wrong side.** `partyLinkFor` (`src/lib/ledger/parties.ts`) gives a page's balance lines one party kind. If the page has any customer lines, they go to a customer, so 2,800 would show as money a customer owes.
4. **The balance isn't checked.** `ruleBalanceEquation` only runs on `customer_credit` pages.
5. **Company and rep are one name.** "Praan (Selim)" becomes a single party.
6. Possible: prompt 4 says text is copied "in Bangla script". English words (Before, Given, Juice) may be transliterated. Unverified.

## Decisions (made 2 Nov)

- **The model organises; code computes.** (Non-negotiable, unchanged.) The model groups the writing into blocks, labels what each block and line is, and says what it is unsure of. Every number shown is computed in tested TypeScript. The user said "the AI will calculate"; this is deliberate. On 30 Oct, Spark wrote `২ × ১৪০ = ২৮০` for `১ × ১৪০ = ১৪০`: model arithmetic can be wrong and still look right.
- **A page is a list of blocks.** A block is a group of writing that belongs together wherever it sits on the page: a company visit, the day's sales, one customer's account, expenses, notes. Each line belongs to one block. Block kind decides the party kind and the checks, not the page.
- **Goods are recorded even without a price.** A goods line keeps item, qty and unit with no amount. It becomes money only when the shopkeeper gives the price (or a memo does).
- **Scriba asks; he answers.** The check flow becomes a conversation in the slider (the existing deck). One question per card, written as a plain sentence about what Scriba understood ("সেলিম (প্রাণ) কে ৳১,৫০০ দিয়েছেন — ঠিক?"). Answers: one Confirm button, a choice between options, voice (P1's pipeline) or typing. Questions come from two sources:
  - **Code**, from structure: missing price, unknown direction, a new party that may match an existing one, a block that doesn't balance, no date.
  - **The model**, as doubts with two or three candidate readings. Code checks that every option is a valid value for its field.

  Answers go through the existing review events and approval rules (`src/lib/review/approval.ts`). Nothing is confirmed without the human.
- **Scanning happens on the phone.** A small TypeScript detector runs on a downscaled frame. There's no OpenCV.js: about 8 MB is too heavy for a cheap phone on mobile data. The page is flattened (perspective-corrected) and cropped. He can drag the corners. The Scriba khata's four black corner squares give an exact lock. The flattened page is what gets read; how the camera original is kept is decided in C2.
- **Still photos, not video frames**, where the browser offers them (C1).
- **Two-pass reading only if measured better** (U3): first a cheap layout pass, then each block read up close. The single pass on a flattened page may be enough.
- **Prompt and schema changes are versioned** as before (`PROMPT_VERSION`, `SCHEMA_VERSION`), and prompt 4 stays selectable for comparison.
- **Hosted DB changes need the user's go-ahead in the session** that makes them, even when a brief lists a migration.

## Sessions

Same tracks as the master plan: A in `scriba/` on `scriba-mvp`, B in `../scriba-engine` on `track-engine`. Merge the other branch at the start of a session.

| ID | Track | Session | Needs |
|---|---|---|---|
| C1 | A | Full-resolution still photo from Scriba's camera | n/a |
| U1 | B | Blocks: schema 3, prompt 6, parser, storage, parties and checks per block, goods lines, model doubts | n/a |
| D5 | A | Design: scanner, block cards, "Scriba asks" cards, answering by button, voice and typing | U1 note (the data shape) |
| C2 | A | Page finder: detect corners, flatten, drag corners | C1, D5 |
| U2 | B | Questions engine and answer API | U1 |
| U2b | B | Question copy: D5's wording in the engine's keys, visit figures, the khata's last due, per-unit figures | U2, D5 |
| B7 | A | The new check flow: blocks and questions in the slider | D5, U2, U2b |
| U3 | B | Two-pass reading, measured against single pass | U1, C2 |
| U4 | B | Company memo (challan): read it, link it to the visit, fill prices | U2, B7 |
| F2 | with user | Testing and evaluation (MASTER_PLAN), plus the v3 test pages | all of the above |

Order if one account does everything: C1 → U1 → D5 → C2 → U2 → U2b → B7 → U3 → U4 → **T1 → T2 → T3 → T4 → T5 → T6 → V1** (see "Trust fixes" below) → F2 → F3 → F4.

---

### C1: full-resolution still photo (Track A)

- The shutter takes a real still with `ImageCapture.takePhoto()` (Chrome and Edge on Android, Samsung Internet). It's sharper than a video frame, focused for a still, and 3:4, which fits a page better than 9:16.
- Fall back to the video frame when there's no `ImageCapture`, when the still fails or takes too long, or when its orientation doesn't match the preview.
- Cap the size so it stays under the upload limit (8 MB by default) and the 60 MP inspection limit. Keep the camera's own JPEG when it already fits, so it isn't compressed twice.
- No live calls. Verify in Edge with a fake camera, through both the still path and the fallback.

### U1: blocks (Track B)

- **Schema 3** (strict JSON Schema plus zod, kept in agreement by the existing test):
  - `page`: `date_text`, `legibility`, `ledger_type` (kept for prompt 4 compatibility).
  - `blocks[]`: `id` ("b1", …), `kind` (`day_sales` | `customer_account` | `supplier_visit` | `supplier_account` | `expenses` | `other`), `title` as written, `party` (company or customer, as written), `person` (rep or contact, as written, or null), `date_text`, `box`.
  - `entries[]` gain `block` (a block id). An entry may carry goods with no amount.
  - `doubts[]`: `entry`, `field`, `options` (2–3 readings as written), `note`.
- **Prompt 6** must handle scattered writing:
  - Group by meaning, not position.
  - A heading or name written once applies to the lines beside or below it.
  - Arrows and margin notes.
  - Copy words in the script they were written in (English, Bangla, Banglish). Before/আগের, Given/দিলাম/জমা and the like are role words.
  - Never price goods.
  - Keep prompt 4's digit rules word for word.
- **Parser**: model output → blocks and entries. An entry whose block is missing goes to an `other` block, with a warning.
- **Storage**: blocks must reach review and confirmed records (party, kind, person). Choose between a migration (an `extracted_blocks` table plus `block_id` columns) and the run's JSON, and write the reason down. A migration needs the user's go-ahead before it touches the hosted project.
- **Parties**: the kind comes from the block (`supplier_visit` and `supplier_account` mean supplier). The company is the party and the person is a note on the records. "Praan (Selim)" therefore links to the party Pran.
- **Checks**:
  - The balance equation runs per block, signed by party kind. For a supplier: + `credit_purchase`, − `supplier_payment`.
  - It's unverifiable while goods have no price, with a reason U2 can turn into a question.
  - Existing page-level rules keep working for prompt 4 runs.
- **Goods without price**: decide how a priceless goods line is stored and later priced (per line, or one delivery total for the block). Approval rules must not confirm money that isn't there. Write the decision down.
- **Tests**: a hand-written model output of the Pran page (with day sales beside it) through parse → checks → parties. Pran must end up as a supplier owing 1,300 + goods, unverifiable.
- **Live**: ≤ $1. Download the two 1 Nov photos into `private-test-data/` (consented), draft ground truth from them for the user to verify, and read them with prompt 4 and prompt 6. Log the cost.

### D5: design (Track A, Claude Design)

- The project is `c10c8807-1a7d-4da4-84c8-c2ed1b2fc687`. Read `design/DIRECTION.md` first; this extends that direction, it doesn't replace it. The user wants it **sleek and modern**: fewer borders, more depth and motion, big type, one clear action per card.
- Screens:
  - **Scanner**: live page outline that tracks the paper; "hold still" auto-shutter as an option; corner drag with a magnifier loupe; the flattened result.
  - **Reading**: the page splitting into its blocks.
  - **Block overview**: "Scriba found 3 parts on this page".
  - **Company-visit card**: due before, paid, goods, due now, with the missing price shown as a gap, not a zero.
  - **Question cards**:
    - confirm with one button;
    - choose between two readings, each with its handwriting strip;
    - type on the keypad;
    - voice (listening, then the transcript placed in the field, never auto-saved).
  - The block's seal; then the existing page seal.
- Swipe and button must both work. Reduced motion respected.
- Copy in bn and en goes into `design/COPY.md`; screens into `design/DESIGN_SPEC.md`.

### C2: page finder (Track A, with engine help)

- **Detector** (pure TS, in a worker, about 10 fps on a 640 px frame): find the paper as the large bright region against the background, take its outline and fit the four corners. On a Scriba khata page, the four black squares give the corners exactly.
- **Live outline** in the viewfinder.
- **Corner screen** after the shot: drag the corners, with a loupe.
- **Flatten**: a homography from the four corners, the output sized by the page's own edge lengths. Do it in WebGL, or in a worker with bilinear sampling on `ImageData`; pick by measured speed on a mid-range phone. No upscaling on the phone (the server already does it).
- **The original**: decide whether the camera original is stored beside the flattened page (evidence, re-cropping) and how. That's a migration plus storage, so it needs the user's go-ahead.
- **Tests**: unit tests for the geometry (corner ordering, homography, quad fitting) on synthetic images. Test the detector on the 1 Nov photos and a few hard cases (dark table, page on a newspaper, glare).
- **Live**: ≤ $1. Read the 1 Nov photos flattened and compare with U1's unflattened readings.

### U2: questions (Track B)

- **Engine** (pure TS): takes the reading, the checks and the shop's parties, and returns the questions in order. Each question has a kind, its subject (block or entry, field), a sentence template (bn and en, through i18n), a proposed answer, options, and what each answer changes.
- **Kinds**: confirm block meaning, confirm direction (paid or received), missing price, doubtful digit (model options), possible same party ("Praan" = Pran?), unbalanced block, no date.
- **Answer API**: an answer becomes review events, so the audit trail stays complete. Voice answers use P1. Add yes and no words (হ্যাঁ, ঠিক আছে, না) to the deterministic parser. A number answer goes through the number-word parser.
- No live calls beyond P1's voice smoke (≤ 3 recordings).

### B7: the new check flow (Track A)

- Build D5 into `/check/[documentId]`: block overview, then question cards in the deck, then quick confirms of the rest of each block, the block seal, the page seal.
- The old line cards stay for prompt 4 readings.
- Approval rules unchanged. Verify in Edge at 390×844, bn and en.
- **Result (2 Nov):** done in two parts. The ask deck opens for every reading with blocks, checked in Edge in both languages and once live on the dev project ($0.084). Prompt 4 stays the default until the khata layout hint and personal notes work on prompt 6 (the user's call). See `docs/sessions/B7.md`.

### U3: two-pass reading (Track B)

- **Pass 1** (cheap): the layout only (blocks and boxes, no transcription).
- **Pass 2**: each block cut from the flattened page with padding, heading included, read with its kind as context. Then map the boxes back to the page grid.
- **Credit rules change** from "one call per run" to "one run = at most 1 + N calls, N ≤ 6, each logged and counted". Update `tests/credit-control.test.ts` first.
- **Measure** against single pass on the test pages, for accuracy and cost. Ship behind an env switch only if it's better.
- **Live**: ≤ $2, logged.
- **Result (2 Nov):** not better on flattened pages (fewer amounts right, 2.5× the cost), so `SCRIBA_TWO_PASS` stays off. Spent $0.836. See `docs/sessions/U3.md`.

### U4: company memo (Track B, small UI)

- Company reps leave a printed memo (challan) with items, quantities and prices.
- **Photograph it with the page**, read it, and match its items to the visit block's goods. It proposes the prices; he confirms them with U2's questions.
- **Live**: ≤ $1.
- **Engine half done (2 Nov)**, the UI half after B7 (the user's split): memo prompt and schema, one call under the page's credit rules, a `kind`/`memo_for` migration (applied to the hosted dev project on 2 Nov, UI half part 1), linking and line matching, memo-proposed prices on `delivery` and `price`, and questions for memo goods not on the page and figures that differ. Live $0.077 on two synthetic memos. See `docs/sessions/U4.md`.
- **UI half done (2 Nov)**, in three parts: the memo is added on the page's details screen and read once; in the ask deck the price slots start with the memo's prices (saved as the memo's answer), and a strip shows the memo's printed lines beside the question. Checked in Edge and once live with M01 on V01 ($0.116). **U4 is done.**

## Trust fixes after the five-page test (planned 2 Nov evening)

The user scanned five handwritten pages ("Page 1"–"Page 5", demo shop, prompt 6, uploaded 2 Nov 13:36 UTC) and checked them in the ask deck. Reading was mostly good. But Scriba approved things he never saw, and gave him no way to change them. He asked for these fixes before the voice feature (below, V1).

### What the test found (root causes, so no session has to look again)

Documents: P1 `b6a9cbba` (confirmed), P2 `157e7df4` (confirmed), P3 `b4aea1e6`, P4 `5ceb678e`, P5 `7449002b`. Each has one prompt-6 run.

1. **"Yes" approves every line.** On P1 the model put the lines after "করিম বাকি … মোট ২৬০" (আটা, লবণ, ডিম, মোট ২৫০) in Karim's block. They are really a separate sale: no dashed line, written just below. Each মোট matched its own lines (rule C, `src/lib/validation/engine.ts` ~342), so "হিসাব মিলেছে" showed. `meaningQuestion` (`src/lib/questions/engine.ts` 288–323) lists every row of the block in `entries`, and `acceptAnswered` (`src/components/check/ask-model.ts` 95–107) accepts them all. So "is this Karim's?" → yes approved all 7 lines, and they never came to the rest card where a line can be tapped and fixed. There's no way to move lines out of a block.
2. **The same on visits.** P3 "ফ্রেশের কামাল আগের ১৬০০" was read as ২৬০০ with no doubt. The meaning card shows "before ৳2,600, paid ৳1,000" with only yes or another kind, so there's no way to fix a figure.
3. **"Before" ignores the khata.** On P2, "করিম জমা দিল ২০০" asked "করিমের কী আগে বাকি ছিল?" although Karim was in the book from P1. `openingQuestion` (engine.ts 438–464) never reads the book. Dues are loaded only for "same party?" questions (`partiesToExplain`, engine.ts 370; `loadQuestionInput`, `src/lib/server/questions-data.ts`), and that question is skipped when the name matches exactly.
4. **The book drops a later "before" silently.** `entriesOf` (`src/lib/insights/accounts.ts` 67–87) counts `opening_balance` only as a party's first entry. The ৳260 he typed on P2 was ignored. Karim (party `19297dff`) shows ৳310 (510 − 200); he meant ৳60.
5. **A confirmed page can't be changed.** Confirming goes through `scriba_confirm_entries` (service role only, `supabase/migrations/20261031120000_scriba_shop_v2.sql` 96–190), and nothing undoes it.
6. **Digits in his hand:** ৩ read as ৬ (চিনি ১৩০ → ১৬০, on P1 and P2; he fixed both) and ১ read as ২ (১৬০০ → ২৬০০). The writer notes learned from his fixes (P3, `src/lib/learning/profile.ts`) ride only on prompt 5 (prompt 4 + notes). Prompt 6 doesn't get them (`getPersonalProfile`, `src/lib/extraction/prompt.ts`).

### Decisions (2 Nov)

- **A card approves only the lines whose figures it showed, with a way to change them.** "Yes, it's Karim's" confirms the name and the kind, never the lines.
- **Any line can start a new part.** Code also asks by itself when an account part has two written subtotals and the lines after the first name nobody.
- **The khata is Scriba's memory.**
  - For a party already in the book, the book's due is proposed as "before".
  - A "before" written on the page is compared with the book.
  - A figure he gives that differs from the book is never dropped: it reaches the book as a visible adjustment.
- **A confirmed page can be reopened.** Its records leave the khata, the audit trail keeps everything, and confirming again goes through the same approval rules.
- Non-negotiables unchanged. Hosted DB changes need the user's go-ahead in the session that makes them. No live calls except in T6 and V1.

### Sessions

| ID | Track | Session | Needs |
|---|---|---|---|
| T1 | A | "Yes" means only what was asked; fix a figure from any card | n/a |
| T2 | A (+ engine files) | Split a part | T1 |
| T3 | B | The khata's due as "before"; no figure dropped | n/a |
| T4 | B | Reopen a confirmed page: migration, function, API | n/a (best after T3) |
| T5 | A | Reopen in the app; fix Karim's account with the user | T2, T4 |
| T6 | B | Writer's digit notes and khata layout on prompt 6, measured | user's consent for the five pages |
| V1 | B | Voice reading, step 1: measure Bangla speech | T1–T6 |

- **One account:** T1 → T2 → T3 → T4 → T5 → T6 → V1.
- **Two accounts:** Track A runs T1 → T2 → T5 in `scriba/`, and Track B runs T3 → T4 → T6 in `../scriba-engine`. Track B merges `scriba-mvp` first; it's behind.
- T2 and T3 both edit `src/lib/questions/engine.ts`, in different functions. Whoever merges second resolves.
- Each session writes `docs/sessions/T<n>.md` and commits, as in MASTER_PLAN "How to use".

---

### T1: "yes" means only what was asked (Track A)

- **Read only:** this section; `ask-model.ts` (`coveredLines`, `deckItems`, `acceptAnswered`, `acceptRest`); `ask-session.tsx` where answers are applied (~180–230) and items are rendered (~440–510); `ask-cards.tsx` (`QuestionCard` options ~170–200, `RestCard` ~354); engine.ts `meaningQuestion` (288–323); the `local` option (engine.ts ~507, types.ts 74); DESIGN_SPEC D5's rest card only.
- **Which answers may accept lines:** one list in one place, tested. Per kind:
  - **Accept:** `doubt`, `price`/prices card, `delivery`, `direction`, `memo_differs`, `unbalanced` (only when he changed a figure). Also `block_kind`, but only if its card lists each line with its figure; check, and make it list them if not.
  - **Never:** `meaning`, `same_party`, `date`, `memo`. Also `opening`, except the line the answer added.
- The lines left after a part's questions come on the rest card. There each one can already be tapped to fix, and "সব ঠিক" accepts them.
- **The meaning card gets a local option** ("একটা লাইন ভুল" / "A line is wrong"). It opens the lines sheet for that part (`actions.lines`), so a visit's আগের/দিলাম can be fixed on the spot. After a fix, the questions are worked out again (existing).
- Strings in bn and en; update `design/COPY.md`.
- **Tests (ask-model):**
  - meaning → yes leaves the lines open, and they come as a rest item;
  - a P1-like fixture (Karim's part, 7 lines, two subtotals) puts all 7 on the rest card;
  - a doubt answer still accepts its line.
- **Verify** in Edge at 390×844, bn and en, on `/kit/check?step=asks`: meaning yes → rest card; fix আগের from the meaning card. No live calls.
- **Result (3 Nov):** done. `ANSWER_ACCEPTS` in `ask-model.ts` is the list. An option that changes nothing (later, one by one) accepts no line. `memo_extra` accepts none (not named above). Problems he kept as written go on the quick confirm rather than their own card. Checked in Edge in both languages, $0. See `docs/sessions/T1.md`.

### T2: split a part (Track A, with engine files)

- **Read only:** this section, T1's note, `src/lib/questions/answer.ts`, types.ts (`Change`, kinds), engine.ts `buildQuestions` (1108–1199), `src/lib/ledger/blocks.ts`, `src/app/api/runs/[id]/answers/route.ts`, `src/lib/review/values.ts` (page limits); UI: `RestCard`, `LinesSheet` (`ask-sheet.tsx`), `FixSheet` (`deck-sheets.tsx`).
- **Change `split`:** `{ op: "split"; block; from: entryId; values: { kind, party?, person?, title? } }`.
  - It creates the next free `bN` block and moves the block's lines from `from` to its end (page order) into it, by editing `values.block`.
  - The boxes become the union of each part's lines.
  - Splitting at a block's first line isn't a split; that's the meaning question's job.
- **Code question `split:<block>`** (new kind `split`):
  - **When:** a `customer_account` or `supplier_account` block has ≥ 2 written subtotals, and the lines after the first subtotal name no party.
  - **Wording:** "মোট ২৬০-এর পরের ৩টা লাইন (৳২৫০) কি করিমেরই?" Code works out the count and the sum.
  - **Options:** yes (nothing changes, not asked again); "না, আলাদা বিক্রি" (split → `day_sales`); "অন্য কারো বাকি" (text input → split → `customer_account` with that name).
  - It's asked right after the block's meaning question.
- **Manual split:** "এখান থেকে আলাদা হিসাব" in the fix sheet of any line except a block's first. A small sheet asks what the lines from here down are: দিনের বিক্রি / অন্য কারো বাকি (name) / খরচ / অন্য কিছু.
  - It goes through the answers route with the same `applyChanges`, as `split:<block>:<entry>`, so it lands in the audit trail like any answer.
  - The server checks that the entry is in the block and isn't its first line.
- After a split the deck works its items out again; the new part gets its own questions.
- **Tests:**
  - a hand-written P1-shaped fixture (no real data in tests): the question appears;
  - "আলাদা বিক্রি" → Karim's part has 3 lines (৳260 due), and the new `day_sales` part's subtotal checks;
  - manual split mid-block; refusal at a first line.
- **Verify** in Edge (dev-board fixture for the Karim case), bn and en. No live calls.
- **Result (3 Nov):** done. Moved lines take kinds that fit their new part: in day sales, a credit sale with no name becomes a cash sale (the card says so). A split can't start at or above the part's first *written* line, so a "before" an answer added on top doesn't count. A supplier's account gets "a separate purchase" (→ expenses). Dev board: `/kit/check?step=asks&photo=karim`. Checked in Edge in both languages, $0. See `docs/sessions/T2.md`.

### T3: the khata's due as "before" (Track B)

- **Read only:** this section; `src/lib/insights/accounts.ts` (`entriesOf`, credit and payment filters ~130–160); `questions-data.ts` (`loadQuestionInput`, `lastDues`); engine.ts `openingQuestion`, `samePartyQuestion`, `partiesToExplain`; validation `balance_equation` (~470–500); `src/components/money/party-screen.tsx` timeline (~175–190).
- **Book:** an `opening_balance` after a party's first entry is the page's statement of the due.
  - **Equal** to the running balance: nothing changes.
  - **Different:** an `adjust` entry with the signed difference, so the balance becomes the stated figure.
  - Decide and test how an adjust counts in last payment, oldest unpaid and risks. Suggested: a down-adjust clears the oldest credit like a payment but isn't a "payment"; an up-adjust is like a credit.
  - Timeline line: "খাতা ঠিক করা: পাতায় আগের ৳… লেখা" (party-screen.tsx: the smallest change, noted).
  - This turns today's Karim into ৳60 by an adjustment of −৳250. Say so in the note.
- **Load dues** for every block party already in the book (exact key or `merged_into` root), as of the page's day, not only for "same party?". Rename `partiesToExplain` to say so.
- **No "before" on the page, party has entries:** the opening question becomes "খাতায় করিমের বাকি ৳২৬০ — এই পাতার আগে এটাই ছিল?"
  - **yes** (proposed): adds the opening line with the book's figure;
  - **"অন্য টাকা"** (money): the card says the khata will be adjusted by the difference;
  - **later.**
  - A party with no entries is asked as today.
- **"Before" written, party known:**
  - **Equal:** a ticked `why` on the meaning card ("খাতার সাথে মিলেছে").
  - **Different:** question `book_differs:<row>`: "পাতায় আগের ৳২,৬০০, খাতায় ৳১,৬০০ — কোনটা ঠিক?" Options: পাতা (keep; becomes an adjustment), খাতা (edit the line to the book's figure), type. This catches a misread "before" (১৬০০ → ২৬০০) whenever the company is already in the book.
- Strings `q.book.*` bn and en (append only), and regenerate COPY.md Part 4.
- **Tests:** accounts (adjust up, down, equal; risk numbers); questions (the three cases, plus same-party yes → compared with the matched party). No live calls.
- **Result (3 Nov):** done, on `scriba-mvp` (run in `scriba/`, one track at a time). An adjustment is an `adjust` entry with the signed difference: down clears the oldest credit but isn't a payment, and up is owed like a credit but is never a "big credit". The due compared is the one just before the page (`dueBefore`), and the page's own records are left out. Merged spellings count as in the book. The answer route now loads the dues. Karim is ৳60 in the dev book (−৳250), checked read-only. Dev board: `/kit/check?step=asks&photo=karim2`. Checked in Edge in both languages, $0. See `docs/sessions/T3.md`.

### T4: reopen a confirmed page, engine half (Track B, migration)

- **Read only:** this section; core migration 136–185 (`entry_reviews`, `review_events` and its action check) and 286–360 (triggers); shop_v2 96–190 (`scriba_confirm_entries`); `src/app/api/runs/[id]/confirm/route.ts`; the pglite migration tests in `tests/` (grep `pglite`).
- **Migration** (additive; **ask the user before `bun run db:push`**):
  - `scriba_reopen_run(p_owner_id, p_run_id)`, security definer, service role only. It:
    - locks the run's confirmed rows;
    - deletes their `confirmed_records`;
    - sets the rows back to `draft`;
    - sets `ledger_documents.status` back to `extracted`;
    - writes a page-level event listing the removed records (ids, types, amounts, parties) so the audit trail shows what left the khata.
  - Add the `reopen` action to `review_events` (check constraint, and the audit trigger: confirmed → draft = `reopen`).
  - The confirmation's validation findings stay as history. Parties stay: with no records they don't show on dues.
  - A day already closed keeps its snapshot. The API reports `dayClosed: true` so the app can warn.
- **API:** `POST /api/runs/[id]/reopen`. The owner is checked through the user's client, then the service call, as confirm does. Only the document's latest succeeded run, rate-limited like confirm.
- **Tests (pglite):**
  - reopen → all rows draft, records gone, events written;
  - confirm again works and creates new records;
  - another owner's run and a draft run are refused;
  - other pages' records untouched.
- No live calls.
- **Result (3 Nov):** done, migration `20261103120000_scriba_reopen.sql`. The function is `scriba_reopen_page`. It takes out every record the page has, from whichever reading, so a page read again after confirming can be fixed from the reading shown. A preview function, also behind `GET /api/runs/[id]/reopen`, tells T5's sheet before he taps how many figures leave and which closed days hold the page. The reopen uses the same rule. The loop limit is 30 reopens an hour, kept in the database. Tested in pglite, $0. Applied to the hosted dev project on 3 Nov (the user's go-ahead). See `docs/sessions/T4.md`.

### T5: reopen in the app, and fix Karim's account (Track A)

- **Read only:** this section, T4's and T3's notes, `ask-session.tsx` (`alreadyIn`, the done stage), `end-views.tsx`, the page details screen (grep `partially_confirmed` in `src/app/(app)`).
- **"পাতাটা ঠিক করুন" / "Fix this page"** on a finished page (deck done view and page details).
  - A confirm sheet says the page's figures leave the khata until it is confirmed again, plus the closed-day warning when T4 reports one.
  - Then the deck opens with his answers kept: the lines come as rest cards, and session acceptances are cleared.
- Strings bn and en, COPY.md. Edge 390×844, bn and en.
- **With the user, on the dev project:**
  1. Reopen P1.
  2. Split Karim's part at আটা ("আলাদা বিক্রি").
  3. Confirm, and check that Karim's ledger shows ৳260 → ৳60 after P2 with no adjustment line, and that the ৳250 shows in that day's cash sales.
  - P2 needs no reopen: its "before" ৳260 now equals the book.
- **Result, the app half (3 Nov):** done. "Fix this page" is on both decks' last screen and on the page's details screen. Its sheet asks T4's preview first: how many lines leave, and the closed-day note. The reopen route now returns the review, so the ask deck opens at once on the cards, his answers kept. A dry run on P1, read only, asks only "are the 3 lines after মোট ২৬০ Karim's too?". Checked in Edge in both languages, $0. **The P1 fix waits for the user.** See `docs/sessions/T5.md`.

### T6: his digits on prompt 6 (Track B, live ≤ $1)

- **Before anything:** the user's consent to use the five 2 Nov pages as test samples (git-ignored `private-test-data/v3/`).
  - Draft ground truth for them: start from his confirmed values, and list the digits he must check.
  - Score against it only after he has checked it.
- **Read only:** this section, `docs/sessions/P3.md` and `U3.md` (the scorer); prompt.ts (`PROMPT_6`, `PROFILES`, `getPersonalProfile`, `withLayout`, `LAYOUT_BASES`); `pipeline.ts` ~180–200; `scripts/score-readings.ts`.
- **A personal variant of prompt 6** (new version id, schema 3): prompt 6 plus the writer notes and the reference strip. Add the khata layout for prompt 6 too, adapted to blocks. These two were what kept prompt 6 from being the default (B7).
- Find where the 2 Nov test got prompt 6 from: `.env.local` has no `SCRIBA_PROMPT_VERSION`, so check the Vercel env or the shell. Write it down.
- **Measure:** the five pages, prompt 6 against prompt 6 + notes. Report digits and amounts right, cost and time. The user decides the default.

### V1: voice reading, step 1: measure Bangla speech (Track B, live ≤ $0.10)

The user's idea (2 Nov): he reads the khata to Scriba one part at a time, Scriba makes the same cards, he confirms and goes on. Agreed shape: photo first (evidence and parts), then he can read any part aloud. Where his voice and the ink agree, nothing is asked; where they differ, one card shows both. A voice-only mode comes from the same pieces.

- **Measure first.** P1 only ever heard English text-to-speech, so Bangla speech is unproven.
  - The user records himself reading pages 1–3, one part per clip (≤ 15 s, the recorder's limit), once quiet and once with shop noise.
  - `scripts/live-voice.ts` takes a folder of WAVs.
  - Report per clip: transcript, the numbers `number-words.ts` finds, item and name words, and the misses.
- **Output:** go or no-go, and what the design needs: how he says a part's start and end, মোট, names, "আগের"/"দিলাম". The voice sessions (V2…) are planned from these numbers.

## Open questions for the user

- T6 needs his consent to use the five 2 Nov pages as test samples. V1 needs his recordings.
- The stored-original choice (C2) and the migrations (U1, C2) were settled in those sessions.
