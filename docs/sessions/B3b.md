# B3b: add a line, page details, keypad point, English (1 Nov 2026)

**Status:** done. B3 is complete. `bun run check` (279 tests, 7 new) and `bun run build` pass. No live Meta calls, $0 spent.

**Verified in Edge at 390×844** on `/kit/check` (S04, the stored prompt-4 reading, real photo), in both languages, with no console errors:
- Menu → add a line (kind, name, item, 1.5 × 80 = 120) → its card. Adding a line inside S04's total correctly fails the total and the balance.
- Page details: the date note, save, and the new date in the top bar.
- Summary: the page row and "add a line".
- Empty page: add → accept → confirm → seal.
- Fix a quantity to ১.৫: ১.৫ × ৬০ = ৯০ is flagged against ১৮০.
- Accept, reload, start: kept acceptances come back.

**Not run:** the real APIs on localhost. There is still no demo account until E3.

## What's done

- **Add a line** (`page-sheets.tsx` `AddSheet`, `POST /api/runs/[id]/rows`):
  - Steps: kind first, then only the fields that kind has (`addFields`): name and item side by side, then qty, rate and amount on the keypad. The amount is required.
  - The new line's card comes next in the deck and is accepted like any other.
  - Opened from three places:
    - the deck menu "add a line after this one" (after the current line);
    - the summary's "add a line" (after the last line);
    - the empty page's "add a line yourself", which is now a sheet, not a link to the details page.
  - `NothingView` moved into `ReviewSession` as the `nothing` stage.
- **Page details** (`PageSheet`, `PATCH /api/runs/[id]/page`, versioned):
  - Page kind as four radios, each with one plain sentence on what gets checked.
  - "Whose account", shown only on `customer_credit` pages.
  - The written date, with "this page counts for 31 Oct" or "couldn't read that date, so the photo's day … is used". This comes from E1's `businessDateFor` and the document's `uploaded_at`, now passed as `capturedAt`.
  - Opened from the deck menu and from the summary's new "Page" row. The top-bar sub now follows the saved values.
- **Keypad point:** `Keypad decimal` swaps the clear key for ".". The fix sheet uses it for qty and rate, and so does the add sheet. Amounts and dues stay whole. `applyKey` allows one point and at most 3 decimals. `groupTyped` groups only the whole part. `typedText` drops a trailing point.
- **Acceptances survive a reload:** they are kept in `sessionStorage` (`scriba.accept.<runId>`) and restored when the deck starts, but only for draft lines still at the same version (`storedAcceptances`/`restoreAcceptances`, tested). The approval check then decides again. The key is cleared after confirm.
- **English:**
  - Two-button deck rows stack, primary on top (DESIGN_SPEC "English"). The exception is Fix / It's right, which fits side by side.
  - **Fixed `localDigits`:** English mode left a reading's Bangla digits as they were, so S04's ৪০০ showed as "৪০০", which an English reader takes for "800". Digits passed through `digits()` now become Latin. Names and other khata text are untouched, because components don't pass them through `digits()`.
- Strips: a line he added says "a line you added · not marked on the photo". A read line with no box says so. The default "sample line" label stays for missing photos.

## Decisions

- **Scriba computes nothing in an added line:** qty × rate is never filled in. The line holds what he typed and the checks judge it like any read line. The writing (`sourceText`) is assembled from his fields, because there is no reading to take it from.
- **Saving page details doesn't clear acceptances.** The approval fingerprints already drop any line whose problems changed (for example, the balance now running on a dues page).
- I designed both sheets from the kit, because D2–D4 have no prototype for them. Copy is in `ad.*`, `pg.*`, `dk.add`, `dk.page`, `sm.add`, `sm.page`, `strip.added`, `strip.noBox` and `key.point` (bn and en).

## Open items / for later sessions

1. **After E3, run the real path once:** add a line (201), a page save and its 409, a line save and its 409, confirm and its 422, then a reload with kept acceptances.
2. The add sheet has no unit field (কেজি). Units can still be fixed on the details page.
3. Added lines go after the current line or at the end. There is no "before line 1" except on an empty page.
4. **P3 (learning panel):** must show his Bangla glyphs raw in English. `digits()` now converts them to Latin.
5. F2: check on a real phone that the system keyboard doesn't hide the keypad when typing a name.
6. Next on Track A is B4, which needs E2 and E3 from Track B (neither has started: `track-engine` is still at E1).
