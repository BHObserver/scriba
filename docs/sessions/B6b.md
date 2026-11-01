# B6b: details pages, laptop and accessibility passes (1 Nov 2026)

**Status:** done; Track A's build sessions are complete. `bun run check` (416 tests, 4 new) and `bun run build` pass. No Meta calls, $0 spent. `track-engine` had nothing new to merge.

**Verified in Edge as the demo shop**, with no console errors:
- Phone (390×844), bn and en: সব ছবি, মিলিয়ে নেওয়া লাইন, পড়া কতটা ঠিক হয়, S04's page record and a sample page's record.
- Laptop (1440×900): Today, Close the day, Dues, confirmed lines (a table from 900 px) and all photos.
- Round trip: History day → a waiting page → back lands on `/history/2026-11-01`. Close the day → a page → back lands on `/close`.
- Accessibility audit (a scratch Playwright script: targets under 44 px, controls with no name, `<html lang>`) over Today, Close, Dues, a party, History, a day, More, all four details pages, Capture, Check and two Welcome steps, in bn and en: nothing left.

## What's done

- **Details pages sit in the shell.** `DetailsTop` (`src/components/details/`) gives each one a top bar with a way back (to আরও, or to সব ছবি for one page), the sample badge, and one line saying what the page is. Titles, counts, statuses, empty states and notes are in the dictionary ("B6b" section, `dt.*`).
  - **`/documents`** is a list of photos only. It has thumbnails from the thumb route; sample pages show the drawn page with "নমুনা পাতা · ছবি নেই". Each row has a state chip and the business date. It also shows the `?orphan=1` note that the delete button already sent but nobody displayed.
  - **`/records`** is stacked on a phone and a 7-column table from 900 px. Each line shows how it was written, its type, item and name, qty × rate, the amount, how it was reviewed, the date, and "ছবি দেখুন".
  - **`/evaluation`**: see Decisions. The stat grid is two columns on a phone. Ground truth lists only pages with a photo.
  - **`/documents/[id]`**: top bar, compact metadata, delete. A sample page says "নমুনা পাতা" where the photo would be, instead of "could not be loaded".
- **The check flow goes back where it came from.** `?from=` on `/check` is allow-listed by `checkBackHref` to `/`, `/history`, `/history/<date>`, `/close` and `/parties`. It is kept on "next page" links and used by every back button in the flow. History, Close and Dues pass it through `checkHref`.
- **Laptop:** Close the day is a centred 480 px column with the cover as a rounded card, like Today. The others already held.
- **Accessibility:**
  - Legacy `Button` is at least 44 px tall. Selects and textareas on details pages are too.
  - The ground-truth links are 44 px.
  - The review workspace's confirm bar is no longer sticky; it hid under the tab bar and the camera button.
- Legacy `Card` now uses the kit card surface (radius 26, shadow), so the old pages match.
- Removed `upload-panel.tsx`. `/capture` picks files too, and the panel led into the old flow.

## Decisions

- **Seeded readings are not Meta requests.** Evaluation used to report "Requests sent: 83, $0.0000" for the demo shop, but none of those requests happened. Runs on seeded pages are now left out of usage, and a turmeric note says how many were left out and why.
  - This needs `isSeededPage` and `DEMO_PHOTO_DATASET` in `src/lib/shop/rows.ts` (a small Track B change). `seed-demo.ts` now uses the constant.
- **Audit internals stay in English:** run history, token counts, metric definitions, the review workspace and the ground-truth editor. Every details page says so in one line. They exist for judges and the author, not the shopkeeper.
- **Corrections get a neutral chip, not turmeric.** A correction isn't a problem. Accepted warnings stay turmeric.

## Open items

1. README and `docs/DEMO_SCRIPT.md` may still describe uploading on `/documents`. F4 rewrites both.
2. The audit covered each screen's first state, not every sheet or deck stage. B3a/B5 checked those by hand.
3. Re-seed before recording (`bun run seed:demo --yes --photos`).

## For the next sessions

Track A's B sessions are done. What's left on the critical path is **F1 (deploy)**. It needs the user to create the production Supabase project and give the go-ahead to apply both migrations, plus Vercel access: authorize the connector, or use the CLI. Then **F2** (testing on a real phone with the user) and **F4** (pitch). Track B's P1–P4 can run in parallel in `../scriba-engine`.
