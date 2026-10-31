# B3a: check deck and the seal (1 Nov 2026)

**Status:** done; B3 is split (the brief allows it), and B3b remains (below). `bun run check` (272 tests, 25 new) and `bun run build` pass. No live Meta calls, $0 spent.

**Verified in Edge at 390×844** on `/kit/check?step=reveal` (S04, the stored prompt-4 reading, with the real photo). The full flow was clicked through: reveal, deck, fix ৪০০ → ৮০০ on the keyboard, every card accepted, summary, confirm, then the seal lands with "করিম (ক-০৬)র বাকি এখন ৳১,০২০". No console errors. **Not run:** the real save and confirm APIs on localhost, because there's no demo account until E3. The dev board uses an in-memory API.

## What's done

- **`ReviewSession`** (`check/review-session.tsx`) holds one page's review state and runs reveal → deck → summary → end. `CheckScreen` renders it, and the page loader now passes `runId`. A page whose lines are all confirmed opens on the end view, with no seal animation.
- **Deck** (`deck-view.tsx`):
  - Problem cards come first. The order is fixed when the deck opens, so cards never jump.
  - Progress segments, ghost cards, and a `motion` drag: plain cards fly off past 110 px; problem cards resist.
  - Card: strip, item and kind, equation (tap a number to fix it), the line's written balance if any, check sentences, hint panel, edit receipt.
  - Buttons by state: fix / "খাতায় এটাই লেখা"; fix / "ঠিক আছে ✓"; "ধরন বেছে নিন" for an unknown kind; "টাকা লিখুন" or remove for a missing amount; "কাটা না" / remove for crossed-out lines; restore for removed lines.
  - The `⋯` menu has: change kind, remove or restore, summary, details page.
- **Sheets** (`deck-sheets.tsx`): the fix sheet (strip, old reading, hint, Keypad, laptop keys 0–9 and Backspace, keep), the kind picker, and the line menu.
- **Summary and end** (`end-views.tsx`): the hero is the closing balance with its equation, or else the written total. Each line has its note. Unchecked lines open their card. The end view shows "পাতা N মিলেছে" with the seal, or "পাতা N তোলা হয়েছে" and what still fails.
- **Pure, tested:**
  - `deck-model.ts`: order, acceptance, statuses, next card, lines left, the confirm body, the page outcome, edit receipt, typed digits.
  - `sentences.ts`: one sentence per finding, numbers from code.
- **`review-api.ts`:** `httpReviewApi(runId)` uses the existing `PATCH /api/reviews/[id]` and `POST /api/runs/[id]/confirm`. `localReviewApi()` is for the dev board.
- `LineStrip` takes `turns`, so strips of pages read turned are cut from the upright frame.
- The dictionary has 91 new keys (bn and en): `chk.*`, `dk.*`, `fx.*`, `sm.*`, `sl.*`, plus the remaining `type.*` and `field.*`.

## Decisions

- **Acceptance is `approval.ts`, unchanged.** Accepting a line stores the fingerprints of the problems it shows. An edit anywhere that changes a problem puts the line back in front of him. Each fix is saved immediately (versioned), and confirm re-checks everything on the server.
- **Lines inside a failed sum say so.** Approval requires every line in a failed total or balance to acknowledge it, so those lines show an info sentence pointing to the card that holds the problem (`chk.tot.inFail`, `chk.bal.inFail`). Before this, they would have asked for a yes without saying why.
- **"খাতায় এটাই লেখা" on a number Scriba doubted** marks the field checked (`markChecked`) instead of acknowledging the doubt. The checks run again. If that reveals a problem he hasn't seen, the card stays.
- **The seal needs at least one passing arithmetic check.** A page where nothing could be checked is "in", never "মিলেছে" (`sl.noChecks`).
- **Plain lines** get a neutral mark and "nothing to check this against", not the prototype's green "no problem found". This matches B2's `plain`.
- **The balance hint** ("এখানে ৮০০ হওয়া দরকার") is code arithmetic on the failed equation, shown only on its two ends.
- **Keypad input** is written in Bangla digits, unless the reading used Latin digits.

## For B3b (next on Track A) and later

1. **Add a line, and page fields in a sheet:** written date and ledger type. Balance is only checked on `customer_credit` pages, so a wrong page type hides it. Adding and page edits use the existing `POST /api/runs/[id]/rows` and `PATCH /api/runs/[id]/page`.
2. **English at 390 px:** "That's what's written" needs `ButtonRow stack` (DESIGN_SPEC "English"). It isn't applied yet.
3. **The keypad has no decimal point**, so ১.৫ কেজি can only be fixed on the details page.
4. **Acceptances live in memory.** Leaving the page drops them; saved edits stay.
5. **After E3:** run the real path once (save, 409 conflict, 422 not ready, confirm). `markReviewStarted` fires when the deck opens.
6. Check the swipe feel on a real phone (F2). P1 adds the mic to `FixBody`.
