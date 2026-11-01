# Scriba master plan (v2: the shopkeeper product)

> **Since 2 Nov 2026, new work follows `docs/PLAN_V3.md`** (scan and understand: page detection, blocks, "Scriba asks"). This file's rules, non-negotiables, architecture decisions and tracks still apply.

Written 31 Oct 2026. This is the plan for turning the working MVP (photo → Muse Wonder reading → code checks → review → confirmed records) into the product in the story: a shopkeeper photographs his khata, checks it on his phone in a minute, and Scriba shows him his day, his cash, and who owes him, in Bangla he can read.

## How to use this file (every session)

1. Read **this file's top sections** (to "Sessions") and **your session's brief only**. Then read the latest notes in `docs/sessions/` for sessions your brief depends on. Read `docs/HANDOFF.md` only if your brief says so.
2. Context budget: hard limit 150k. At ~120k, stop starting new work: finish the current unit, run the checks, write your session note. Never read a whole large file when a range or a grep will do.
3. This is Next.js 16.4 with breaking changes. Before writing routing, data-fetching, metadata or config code, read the relevant guide in `node_modules/next/dist/docs/`.
4. End of session, in this order: `bun run check` and `bun run build` pass → write `docs/sessions/<ID>.md` (status, what's done, decisions, open items, what the next session must know, ≤ 60 lines) → commit on your track's branch (see "Tracks"). Never edit another session's note. Don't edit the session table below; progress lives in `docs/sessions/`.
5. If you finish early, do not start the next session's brief. Polish within your scope.

## The story → the product

| Story beat | Product moment | Session |
|---|---|---|
| Every night he fights the khata with a calculator | **Close the day** (দিনের হিসাব): photograph today's pages; Scriba checks them and tells him how much cash should be in the drawer. He counts, enters it, and sees whether it matches | B4 |
| He takes a picture | Camera-first capture, several pages in a row, guide frame | B2 |
| He checks it properly | **The check deck**: one card per line, the handwriting strip cut from the photo directly above the typed reading, swipe to accept, tap a number to fix it on a big Bangla keypad (or by voice), problem lines first, each problem explained in one plain sentence | B3, P1 |
| The rest is calculated by Scriba | The existing checks engine plus the reveal: lines light up on the photo and settle green/amber/red as the code checks run | B2 |
| Cash flow, revenue, risks, where money goes | **আজ (Today)** home: sales, cash vs credit, money out, expected drawer cash, Scriba's note in 1–3 plain sentences; every number taps open into the lines that make it up | E2, B4 |
| He understands his business | **বাকি (Dues)**: who owes how much and for how long, risk flags with a reason ("৪৫ দিন কোনো জমা নেই"), each entry backed by the original handwriting; send a polite reminder with the handwritten line attached | E3, B5 |
| Nothing scattered | **খাতা (History)**: every day and page, searchable; **Ask Scriba** by voice in Bangla ("করিমের কাছে কত বাকি?") | B6, P2 |

### Signature moments (what should make a judge sit up)

1. **The reveal**: after reading, the line boxes draw onto the photo one by one, then each turns green, amber or red as the checks finish.
2. **Handwriting above reading** on every card. No zooming, no hunting.
3. **The seal**: when every line is checked and the page balances, a "হিসাব মিলেছে" stamp lands on the page.
4. **The drawer number**: "ক্যাশবাক্সে থাকা উচিত ৳৪,৩২০". He counts; Scriba says it matches, or shows the gap.
5. **Proof-backed reminders**: a dues reminder carrying the crop of the original handwritten line.
6. **Ask by voice**, answered with the lines that prove the answer.
7. **"Scriba is learning your handwriting"**: corrections make the next reading better, shown honestly.

## Non-negotiables (carried over from the MVP)

- **AI proposes, code verifies, a human decides.** The model transcribes and, in P2, picks a query shape. It never computes a number shown to the user. Every total, due, drawer figure and insight is computed in tested TypeScript from confirmed records, and can be drilled into.
- Only human-confirmed lines feed the money screens. Existing approval safety rules (`src/lib/review/approval.ts`) are reused, never bypassed by the new UI.
- **Sample data is always labeled.** The demo shop (E3) shows a visible "নমুনা দোকান / Sample shop" badge on every screen. The video never presents sample data as a real shop's history, and never shows a screen that doesn't exist in the app.
- Meta credits are limited ($150 total, ≈ $3 spent by 31 Oct). No live calls in tests. A session may make **live smoke calls only if its brief allows it, at most $1 per session**, logged in its session note. Full evaluation happens in F2.
- Bangla first, English toggle (judges may not read Bangla). All user-facing strings go through the i18n dictionary; no hard-coded copy in components.
- Mobile first (390×844 is the reference frame), still good on a laptop (judges).
- Never touch or search for the author's private accounting app.

## Architecture decisions (made; change only with a reason written in your session note)

- **Routes (new IA)**, bottom tab bar `আজ | খাতা | (camera button) | বাকি | আরও`:
  `/` today (signed in) · `/capture` · `/check/[documentId]` reveal + deck · `/close` close the day · `/parties`, `/parties/[id]` dues and ledger · `/history` · `/settings`. Ask Scriba is a sheet available from Today and History. The existing `/documents`, `/records`, `/evaluation` stay as "details" pages reachable from Settings (audit trail for judges); the old desktop review workspace stays as the "details" view of a page until the deck covers everything it does.
- **i18n**: small in-house dictionary in `src/lib/i18n/` (bn default, en), locale in a cookie, Bangla digits in bn mode via the existing `src/lib/numerals.ts`. No i18n library.
- **Animation**: `motion` (the Framer Motion successor) is the one animation dependency allowed (swipe, springs, layout transitions, the seal). Everything else is CSS. Respect `prefers-reduced-motion`.
- **Charts**: hand-built SVG/CSS (a few bars and sparklines). No chart library. Load the `dataviz` skill before building any.
- **Line crops**: display crops are pure CSS (the signed photo positioned and scaled so the line's box fills the card, from the 0–1000 box grid). Real image crops (reminders, adaptive reference examples) come from a `sharp` route that reads the photo through the user's own Supabase client.
- **Data model v2** (E1, additive migration only):
  - Transaction types add money-out and payables: `purchase` (cash stock buying), `credit_purchase`, `supplier_payment`, `expense`. Money in = `cash_sale` + `repayment`. Receivable = `credit_sale` − `repayment`. Payable = `credit_purchase` − `supplier_payment`.
  - `parties` table (customer or supplier; display name, normalized key for Bangla spelling variants, `merged_into`); `confirmed_records.party_id`.
  - `documents.business_date` (from the page's written date when it parses, else capture date; user can change it).
  - `shop_profiles` (shop name, language, opening cash) and `day_closes` (date, expected cash snapshot, counted cash, note).
- **Prompt changes** bump `PROMPT_VERSION`/`SCHEMA_VERSION` as before, and the previous prompt stays selectable by env var so F2 can compare and fall back.
- **Visual verification**: `playwright-core` (dev dependency) driving the installed Microsoft Edge (`channel: "msedge"`; no Chrome on this machine), via `scripts/shot.ts <url> [--w 390 --h 844] [--login]`. Design sessions screenshot Claude Design previews; build sessions screenshot `localhost:3000` signed in as the demo shop. Screenshots go to the session's scratchpad, never the repo.
- **Design → code handoff**: the Claude Design project holds the prototypes; the repo holds what build sessions need in compact form: `design/DIRECTION.md` (tokens, type, motion rules), `design/DESIGN_SPEC.md` (screen by screen: layout, states, interactions, which component), `design/COPY.md` (every string, bn + en). Build sessions read these first and open a prototype file with `read_file` or a screenshot only for the screen they're building.

## Tracks (two accounts can run in parallel)

| Track | Owns | Working folder and branch |
|---|---|---|
| **A: design → UI** | Claude Design project, `design/`, `src/components/`, `src/app/(app)/` pages, `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/i18n/`, `scripts/shot.ts`, UI dependencies | `scriba/` on `scriba-mvp` |
| **B: engine → power** | `src/lib/**` except i18n, `src/app/api/**`, `supabase/**`, `scripts/` (except shot.ts) | git worktree `../scriba-engine` on `track-engine` |

- Track B's first session creates the worktree: `git worktree add ../scriba-engine -b track-engine scriba-mvp`, copies `.env.local` into it, runs `bun install`, and links or copies `private-test-data/` if its brief needs it.
- **Start of every session**: merge the other track's branch (`git merge track-engine` on A, `git merge scriba-mvp` on B), resolve conflicts, `bun run check`.
- Never run two sessions in the same folder at once.
- A session that needs a file the other track owns makes the smallest change it can and says so in its note.

## Sessions

Order within a track is fixed. "Needs" lists notes to read first. Every session leaves the app working, so the build can stop after any session and still be shown.

| ID | Track | Session | Needs |
|---|---|---|---|
| D1 | A | Design direction, Claude Design project, verify tooling | n/a |
| D2 | A | Prototype 1: capture, reveal, check deck, seal | D1 |
| D3 | A | Prototype 2: Today, close the day, dues, party ledger, Ask sheet | D2 |
| D4 | A | Prototype 3: onboarding, history, settings, edge states, learning panel, printable khata; write DESIGN_SPEC + COPY | D3 |
| E1 | B | Data model v2, migration, prompt 4 | n/a |
| E2 | B | Insights engine | E1 |
| E3 | B | Server APIs, crops, demo shop | E2 |
| B1 | A | App shell, tokens, i18n, primitives | D4 (D2 enough to start), E1 |
| B2 | A | Capture and the reveal | B1 |
| B3 | A | Check deck and the seal (may split into B3a/B3b) | B2 |
| B4 | A | Today and close the day | B3, E3 |
| B5 | A | Dues, party ledger, reminders | B4 |
| B6 | A | History, settings, onboarding, details pages, polish | B5 |
| P1 | B | Voice correction | E3, then B3 merged |
| P2 | B | Ask Scriba | P1, B4 merged |
| P3 | B | Adaptive handwriting | E3 |
| P4 | B | Scriba khata template | D4, E1 |
| F1 | either | Deploy to Vercel | B4 |
| F2 | with user | End-to-end testing and evaluation | all build sessions |
| F3 | either | Fixes from F2 (repeat as needed) | F2 |
| F4 | A | Pitch deck, video storyboard, README and evaluation docs | F2 |

Critical path if time runs short: D1 → D2 → E1 → E2 → E3 → B1 → B2 → B3 → D3 → B4 → B5 → F1 → F2 → F4. Power features in impact order: P1 → P2 → P3 → P4.

---

### D1: design direction (Track A, Claude Design)

- Call `get_claude_design_prompt`, then `read_design_skill` for both `frontend-design` and `hifi-design`. No design system exists in the account; this project defines one.
- **Ask the user first** (the design prompt requires it): vibe, colors, type, mood, any references. Offer these three directions as starting points, recommending the first:
  1. **হালখাতা (Halkhata)**: warm ledger-paper ground, khata-red cloth, ink-blue numerals, stamp and seal motifs, a Bangla serif for display (e.g. Tiro Bangla or Noto Serif Bengali) with a clean Bangla sans for UI (e.g. Hind Siliguri or Anek Bangla). The khata becomes beautiful; strongest fit for the story.
  2. **Clear**: calm, high-contrast utility; huge numerals; one accent; icon-led for low literacy.
  3. **Bazaar**: bold color blocks from shop signboards and rickshaw paint; energetic and playful.
- `create_project` "Scriba". Offer the user the live preview (`?embed=1`).
- Add `playwright-core` as a dev dependency and write `scripts/shot.ts` (Edge, viewport flags, optional login with `SCRIBA_DEMO_EMAIL`/`SCRIBA_DEMO_PASSWORD` from `.env.local`, which E3 will create). Use it for the verify loop on `render_preview` serve URLs; never write a serve URL to any file or message.
- Build a canvas file with the three directions applied to the **same two mobile frames**: one check-deck card (S04's line `৩ × ৬০ = ১৮০` with a failed check) and the Today screen. Real Bangla content, not lorem.
- After the user picks: write `design/DIRECTION.md`: tokens as CSS custom properties (oklch), type scale for Bangla and Latin, spacing, radii, elevation, motion rules (durations, springs, reduced motion), iconography rule, and the Claude Design project id and URL.
- Done when: the user has chosen, DIRECTION.md exists, `bun run shot` works.

### D2: prototype 1, the check flow (Track A, Claude Design)

- Read `design/DIRECTION.md`. Build a small UI kit file first (buttons, Bangla numeral display, status chips, card, bottom sheet, Bangla number keypad, tab bar) at 390 px.
- Interactive prototype of: capture (guide frame, multi-page tray) → reading (honest progress steps: sending, reading, checking) → the reveal on the photo → check deck (problem cards first; card anatomy: handwriting strip, typed reading as an equation `২ × ১৪০ = ২৮০`, check result in one sentence, accept / fix; swipe; progress) → fix a number with the keypad → voice state (mic, listening, transcript placed in the field, never auto-saved) → summary card → confirm → the seal.
- Problem-card copy uses the real check kinds from `src/lib/validation/engine.ts` (grep for the rule ids; don't read the whole file).
- Split prototype code into files under 1,000 lines.
- Done when: the flow clicks through end to end in the preview, verified by screenshots.

### D3: prototype 2, the money screens (Track A, Claude Design)

- Today: date, Scriba's note (1–3 sentences), sales with cash/credit split, money out, expected drawer cash, 7-day sales bars, "tap any number to see its lines". Load the `dataviz` skill first.
- Close the day: pages photographed today and their check state → expected drawer cash with its breakdown → count entry on the keypad → match or gap, with the seal on a match.
- Dues list (sorted by risk, reason line per party), party ledger (timeline of credit and repayments, each with its handwriting strip, running balance), reminder sheet (message preview with the crop attached, share).
- Ask Scriba sheet: voice and text input, an answer card with the number, one sentence, and the lines that prove it.
- Payables (suppliers) as a tab inside Dues, not a separate screen.

### D4: prototype 3 and the spec (Track A, Claude Design)

- Onboarding (language, shop name, opening cash, one-screen explanation of "Scriba reads, you check"), History (days, pages, search), Settings (language, details pages, sign out), empty states, errors (blurry photo, sideways photo, offline, reading failed, nothing to confirm), the sample-shop badge, the "learning your handwriting" panel, and the **printable Scriba khata page** (A5 print document: columns তারিখ | নাম | জিনিস | পরিমাণ | দর | টাকা | বাকি/জমা, corner markers, page number).
- Check the English variant of two screens for overflow.
- Write `design/DESIGN_SPEC.md` (screen by screen: layout, states, interactions, motion, component names, the prototype file to open) and `design/COPY.md` (every string, bn + en, in plain words a shopkeeper with little schooling understands). These two files are what build sessions read; keep them compact and exact.

### E1: data model v2 (Track B)

- Create the worktree (see Tracks). Read `docs/HANDOFF.md` "Where things are".
- Additive migration per "Data model v2" above, with RLS matching the existing tables; extend `tests/db/rls.test.ts`. Apply it to the hosted project the way HANDOFF describes (Management API, `SUPABASE_ACCESS_TOKEN` from the user environment).
- Extend `TRANSACTION_TYPES`, schema, parser, validation rules (money-out lines take part in qty × rate and subtotal checks; balances are unchanged), and the confirm path (fill `party_id` by normalized name; create the party if new).
- Prompt 4: teach the new types and Bangla cue words (খরচ, মাল কেনা, মহাজন, জমা, বাকি, ভাড়া, বেতন). Keep prompt 3 selectable via env. Bangla date parsing for `business_date` (formats like ৩১/১০/২৬, ৩১ অক্টো, ১৪ কার্তিক as text only if unparsable), with tests.
- Live smoke allowed: S01 and S04 once on prompt 4 (≈ $0.50) to confirm nothing regressed. Log results.

### E2: insights engine (Track B)

- Pure functions in `src/lib/insights/` over confirmed records + parties + day closes, all money in integer poisha:
  - day summary (sales cash/credit, money in, money out by type, expected drawer cash = opening cash + cash in − cash out, with breakdown);
  - receivables and payables per party (balance, oldest unpaid credit age by FIFO, last payment, trend);
  - risk rules, each with a reason code (no payment in N days, balance growing three periods running, unusually large credit for this party);
  - trends (7 days vs previous 7, top items by amount, day-of-week pattern only with ≥ 4 weeks of data);
  - "Scriba's note": up to 3 sentences chosen by priority rules from templates, bn and en, numbers inserted by code.
- Every result carries the record ids it was computed from (drill-down).
- Thorough tests, including empty data, a single day, corrected records and merged parties.

### E3: server APIs, crops, demo shop (Track B)

- Server data functions/routes for the new screens: today, close the day (read and save), dues list, party ledger, party merge, history list, shop profile.
- `sharp` crop route for one line of one page (auth through the user's client, private cache headers).
- **Demo shop**: a deterministic seed script that creates a demo user (`SCRIBA_DEMO_EMAIL`/`PASSWORD` into `.env.local`) with a shop profile and ~45 days of synthetic confirmed records across 12–15 parties. Its records link to the author's development photos where possible so proof strips render; the rest show "no photo (sample)". A `shop_profiles.is_sample` flag drives the badge. Re-runnable (wipe and reseed that user only).

### B1: app shell (Track A)

- Merge `track-engine`. Read `design/DIRECTION.md`, `design/DESIGN_SPEC.md` (shell sections) and `design/COPY.md`.
- Tokens into `globals.css` / Tailwind theme; fonts via `next/font`; i18n dictionary and locale cookie; `motion` dependency; app layout with bottom tab bar and camera button; page transitions; PWA manifest (`app/manifest.ts`) and icons; primitives from the UI kit as React components.
- Restyle the login page. Keep existing pages working inside the new shell.
- Verify with `bun run shot` at 390×844 and 1440×900.

### B2: capture and the reveal (Track A)

- `/capture`: camera input, multi-page tray, orientation turn (reuse `photo-orientation`), upload through the existing documents API, then analyze.
- `/check/[documentId]` part 1: honest progress steps, then the reveal on the photo using the returned boxes and the client-side check results.

### B3: check deck and the seal (Track A)

- Read `src/lib/review/state.ts`, `values.ts`, `approval.ts` and the parts of `review-workspace.tsx` that call them; the deck must use the same state and the same confirm API.
- Deck: CSS line crops, equation display, check explanations from COPY.md mapped by rule id, swipe (motion), Bangla keypad editing, problem-first order, summary, confirm, seal. Add/reject line and page-level fields (date, ledger type) via a sheet.
- If context runs short, stop after the deck and confirm work (B3a) and leave keypad/explanations polish to B3b.

### B4: Today and close the day (Track A)

- Merge `track-engine` (E2, E3). Build `/` Today and `/close` from the spec, with drill-down sheets listing the records behind each number. Sample-shop badge.

### B5: dues, party ledger, reminders (Track A)

- `/parties` (receivables / payables tabs, risk order and reasons), `/parties/[id]` with handwriting strips and running balance, merge parties, reminder sheet: message from COPY.md template + crop image via the Web Share API, with a copy-text fallback.

### B6: history, settings, onboarding, polish (Track A)

- `/history`, `/settings` (language, details pages, sign out), onboarding for a new shop, empty and error states, details pages restyled enough to sit in the shell, laptop layout pass, accessibility pass (44 px targets, contrast, focus, screen-reader labels in both languages).

### P1: voice correction (Track B, then a small UI change)

- See "Voice correction" in `docs/IMPLEMENTATION_PLAN.md`: browser recording → 16 kHz mono WAV → server route → Muse Voice Transcribe (`languageBias: ["Bengali"]`) → **deterministic Bangla number-word parser** (একশো আশি → 180, দেড়শো, আড়াই, সাড়ে, mixed digits and words), fully tested → value placed in the field, never auto-saved.
- Wire the mic into the deck's fix sheet (touches a Track A file: keep the change small).
- Live smoke allowed: up to 3 short recordings.

### P2: Ask Scriba (Track B + sheet UI)

- Question (text or P1 voice) → Muse with a strict JSON schema that only selects a query shape (intent: party due, sales in a period, item sales, expenses, compare periods, list risky dues; plus filters) → code runs it on the insights engine → answer card from templates with the proving records. If the model can't map the question, say so; never guess a number.
- Live smoke allowed: ≤ 10 text questions (≈ $0.30).

### P3: adaptive handwriting (Track B)

- Writer profile from the audit trail: character-level confusions between model readings and confirmed values (e.g. ৮ read as ৪), plus up to 4 reference crops of confirmed lines tiled into one image with their confirmed text.
- Prompt 5 "personalized" adds the profile and the reference image; off by default until F2 measures it on pages the profile didn't learn from. Learning panel data for the UI.
- Honest framing everywhere: the goal is fewer misreads and every misread still caught by checks or review, not a promised accuracy percentage.

### P4: Scriba khata template (Track B)

- Printable A5 PDF of the D4 design (`/khata.pdf` or a download in Settings).
- Capture option "this is a Scriba khata page": prompt receives the column layout, so position decides qty vs rate vs amount.

### F1: deploy

- See `docs/IMPLEMENTATION_PLAN.md` deploy item. The Vercel connector needs the user to authorize it (`/mcp`), or deploy with the Vercel CLI. Add the production `/auth/confirm` URL to Supabase redirects, run `SCRIBA_APP_URL=<url> bun run live:smoke`, then close sign-ups and set the email allow-list.

### F2: testing and evaluation (with the user)

- The user tests on a real phone; the session logs every issue in `docs/sessions/F2.md` as a numbered fix list. Run the 20-snippet evaluation (prompt 4, and prompt 5 if P3 shipped) and write the numbers into `docs/EVALUATION.md` honestly.

### F4: pitch (Track A, Claude Design)

- Pitch deck in Claude Design (deck-stage, 1920×1080) using the product's design direction: problem, the khata, demo flow, how it stays truthful (AI proposes, code verifies, human decides), evaluation numbers from F2, roadmap (adaptive learning, khata template, offline capture).
- Video storyboard as a canvas: the seven story beats, each with its shot list and the app screen it shows (real screens only), plus subtitles in English.
- Update `README.md` and `docs/DEMO_SCRIPT.md` to the new flow.
