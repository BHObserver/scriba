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
| B7 | A | The new check flow: blocks and questions in the slider | D5, U2 |
| U3 | B | Two-pass reading, measured against single pass | U1, C2 |
| U4 | B | Company memo (challan): read it, link it to the visit, fill prices | U2, B7 |
| F2 | with user | Testing and evaluation (MASTER_PLAN), plus the v3 test pages | all of the above |

Order if one account does everything: C1 → U1 → D5 → C2 → U2 → B7 → U3 → U4 → F2 → F3 → F4.

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

### U3: two-pass reading (Track B)

- **Pass 1** (cheap): the layout only (blocks and boxes, no transcription).
- **Pass 2**: each block cut from the flattened page with padding, heading included, read with its kind as context. Then map the boxes back to the page grid.
- **Credit rules change** from "one call per run" to "one run = at most 1 + N calls, N ≤ 6, each logged and counted". Update `tests/credit-control.test.ts` first.
- **Measure** against single pass on the test pages, for accuracy and cost. Ship behind an env switch only if it's better.
- **Live**: ≤ $2, logged.

### U4: company memo (Track B, small UI)

- Company reps leave a printed memo (challan) with items, quantities and prices.
- **Photograph it with the page**, read it, and match its items to the visit block's goods. It proposes the prices; he confirms them with U2's questions.
- **Live**: ≤ $1.

## Open questions for the user

None blocking. The stored-original choice (C2) and the migrations (U1, C2) are asked about in those sessions.
