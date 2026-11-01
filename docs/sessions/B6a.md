# B6a: History, More, welcome (1 Nov 2026)

**Status:** done. B6 is split like B3: B6a is the new screens; **B6b** is the details pages, the laptop and accessibility passes and polish. `bun run check` (412 tests, 11 new) and `bun run build` pass. No Meta calls, $0 spent. `track-engine` had nothing new to merge.

**Verified in Edge as the demo shop** at 390×844 in bn and en, and History at 1440×900, with no console errors or failed requests:
- History: today ৳৬,২৯০ with 5 pages (3 sample ticks, S01/S04 as real thumbnails waiting), "দেখা বাকি · ২টি পাতা"; 28 Oct "দিন বন্ধ, ৳৫০ কম ছিল"; sections এই সপ্তাহ → অক্টোবর ২০২৬ → সেপ্টেম্বর ২০২৬; "আরও আগের দিন দেখুন".
- Day view: page cards, the waiting note, "দিনের হিসাব মেলান" and "দিনের হিসাব দেখুন". A checked page opens a sheet of its 9 lines.
- Search "রহিম" → 6 lines and one "রহিম উদ্দিনের খাতা দেখুন" link; "zzzz" → the none state.
- More: name মায়ের দোয়া স্টোর, morning cash ৳১,৫০০ ("রোজ যত টাকা দিয়ে দিন শুরু করেন"), the cash sheet, language, details, sample note.
- Welcome: all four steps through `/kit/welcome?step=…`.

## What's done

- **`/history`** (`HistoryScreen`): title + badge, pill search (`?q=` kept in the URL, 300 ms debounce, `GET /api/lines?q=`), day cards in sections, 30 days at a time (`?days=`). Two columns of days from 1024 px.
- **`/history/[date]`** (`DayScreen` + `DayPages`): top bar (date, sales, badge), page cards (waiting → the deck with the day's other waiting pages; checked → a sheet of its lines, plus a link to `/documents/<id>`), the waiting note, the close status and the close/see button, and for today a link to Today.
- **Thumbnails:** `GET /api/documents/[id]/thumb?w=96|320` (Track B file, small). It reads through the user's client, turns the page like its latest reading, and returns a JPEG without metadata (`private, max-age=86400`). Sample pages show a drawn ruled page and "নমুনা পাতা, ছবি নেই", never fake handwriting.
- **`/settings`** (`MoreScreen`): shop card (name sheet, morning-cash sheet on the keypad), language, details links, sample sentence, sign out. The system/configuration cards stay below for auditors.
- **`/welcome`** (`WelcomeFlow`): cover + language → how it works → shop name → morning cash → `PUT /api/shop` → Today. The `(app)` layout sends a signed-in user with no `shop_profiles` row here, and `/welcome` sends a user who has one to `/`.
- Tab bar: খাতা → `/history`; `/documents` now lights আরও.
- `history-model.ts`, `more-model.ts` (pure, tested); `formatMonthYear` in i18n; a "B6" dictionary section (bn + en).

## Decisions

- **A checked page opens its lines, not `/check`.** The check flow's end screen ("পাতা ১ মিলেছে") has no lines on it. The full record is one tap further.
- **The search placeholder says "নাম বা জিনিস"**, not "নাম বা পাতা": pages have no titles to search.
- **Learning (P3) and print (P4) cards are hidden** until those features exist (as B4 did with the Ask pill).
- **Morning cash shows what today starts from.** The sheet edits the *usual* amount. When today starts from yesterday's count, the sheet says that editing won't change today.
- **No "sealed" page state yet** (B4's decision stands), so checked pages get a tick.

## Gotcha

An apostrophe inside a CSS comment in `globals.css` made the build silently drop the rules after it. Keep apostrophes out of CSS comments there.

## Open items

1. **Not tested end to end:** a real new account through `/welcome` → `PUT /api/shop` → Today (needs a fresh user; F2). The user's own dev account has no profile, so it will now go through `/welcome` first.
2. Thumbnails take 1–1.5 s on the dev server (storage download dominates); the browser caches them for a day. If F2 finds History slow on a phone, store a thumbnail at upload.
3. English search for a Bangla name ("Rahim") finds nothing: names are as written in the khata. A transliteration match is roadmap.
4. Re-seed before recording (`bun run seed:demo --yes --photos`).

## For B6b

Details pages (`/documents`, `/records`, `/evaluation`) restyled to sit in the shell; laptop pass (Today, Close, Dues at 1440); accessibility pass (44 px targets, focus, labels in both languages, `lang`); the `nothing` empty state if the deck lacks it; `/check` back link from History.
