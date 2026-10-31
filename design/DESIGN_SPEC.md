# Scriba design spec (for build sessions B1–B6)

Screen by screen: what to build, its states, interactions and motion, the kit components it uses, and the prototype to open. Read `design/DIRECTION.md` first (tokens, type, motion values) and take strings from `design/COPY.md`. Written in D4, 31 Oct 2026.

**Prototypes** (Claude Design project `c10c8807-1a7d-4da4-84c8-c2ed1b2fc687`, files under `proto/`). Each has a side panel, and `?step=<id>` opens a state directly:

| File | Covers | Steps |
|---|---|---|
| `Check Flow.html` (D2) | capture → reading → reveal → deck → fix → summary → seal | `capture`, `reading`, `reveal`, `deck`, `fix`, `voice`, `summary`, `seal`… (see its panel) |
| `Money Screens.html` (D3) | Today, drill-downs, Ask, Close the day, Dues, party ledger, reminder | `today drill expected closed ask listen answer unknown close count match gap dues payables party remind`, `&pending=1` |
| `Shop Screens.html` (D4) | onboarding, History, More, learning, empty and error states, English check, kit | `welcome how shop cash newToday history day search search-none history-empty more learn dues-empty nothing unreadable small sideways offline failed busy waiting file en-today en-card kit`, `&lang=en` |
| `Khata Page.html` (D4) | printable A5 Scriba khata page | n/a |

Open a prototype file with `read_file`, or screenshot one step, only for the screen you are building. Porting is mostly mechanical: the JSX uses plain React state and the class names in `kit.css`, `flow.css`, `money.css` and `more.css`.

## Kit → `src/components/` (B1)

| Prototype | App component | Notes |
|---|---|---|
| `Phone` (binding + status bar) | layout shell | 7 px `--red` binding band on every screen. `theme-color`: cloth red on Today, Close and Welcome, paper elsewhere |
| `TopBar` | `TopBar` | back 44 px, title 20/600, sub 14, optional `right` slot (sample badge) |
| `TabBar`/`TabBarT` | `TabBar` | tabs আজ, খাতা, camera, বাকি, আরও; camera 66 px raised 26 px; `pulse` ring when the shop has no pages yet |
| `Chip`, `Mark` (`ok`, `look`, `wait`) | `Chip`, `StatusMark` | a mark always sits next to words; lucide icons replace glyphs |
| `Taka`, `.hero-n`, `.tile-n`, `.num` | `Money` | uses `formatTaka` from `src/lib/numerals.ts`; lakh grouping; digits follow locale |
| `Strip` | `LineStrip` | the signed photo positioned by the line's 0–1000 box, scaled to fit the width, never clipped; neighbours faded; tag "ছবি থেকে" |
| `HandLine`, `RecLine` | `LineStrip` + `RecordRow` | "no photo · sample line" variant for E3 sample records |
| `Equation`/`EqT` | `Equation` | three cells (qty × rate = amount) or one (amount); numbers are buttons that open the fix sheet |
| `Seal` | `Seal` | land animation in DIRECTION.md; `vibrate(30)` |
| `Sheet` | `Sheet` | 360 ms up; scrim closes; focus trapped |
| `Keypad`/`KeypadT` | `Keypad` | 3×4, 60 px keys, delete and clear |
| `Cover` | `Cover` | red cloth header; Today, Close, Welcome only |
| `SampleBadge`/`Badge` | `SampleBadge` | on every screen of a sample shop (`shop_profiles.is_sample`); never on a real shop |
| `Split`, `WeekBars`, `Receipt`, `DrillSheet` | same names | hand-built SVG/CSS, no chart library |
| `Empty` | `EmptyState` | CSS-drawn ruled page / people / search icon, title, 1–2 sentences, at most one action |
| `.segs`, `.sw` | `Segmented`, `Switch` | 46 px segments; switch shows its state in words |

## Shell and global rules

- Routes (MASTER_PLAN): `/` Today · `/capture` · `/check/[documentId]` · `/close` · `/parties`, `/parties/[id]` · `/history` · `/settings` (the আরও tab) · **`/welcome`** onboarding (new in D4), shown once when the user has no `shop_profiles` row.
- Mobile 390 × 844 is the reference. Laptop: flows (capture, check, close, welcome) in a centred 480 px column; Today and History may use two columns from 1024 px (Today: cover + tiles left, note + bars + dues right).
- Scroll areas leave 112 px for the tab bar (170 px when a dock sits above it).
- **English:** Latin digits, same grouping. Names, items, units and khata text are never translated. Titles may wrap to two lines. **Button rows stack** (primary on top, full width) when either label needs two lines at 390 px; in English this happens for "That's what's written" and "Take the photo again". Checked in `Shop Screens.html` `en-today`, `en-card` and every D4 step with `&lang=en`.
- Problems are turmeric, never red. System errors: turmeric-soft panel, ink text, one clear action. Destructive buttons say exactly what happens.
- Every number a user sees is computed in code from confirmed lines and opens the lines behind it (drill-down). Unchecked pages never enter a figure, and screens that show figures say so when a page is waiting.

## D2: capture and check (B2, B3) · `Check Flow.html`

- **Capture** `/capture`: live camera with guide frame and corner marks, shutter, tray of taken pages (thumbnail, page number, rotate), "done" sends all. Uses `photo-orientation` for the turn. Before sending, a sideways page shows the D4 `sideways` panel (he checks and turns; there is no auto-detection).
- **Reading**: three honest steps (sending, reading, checking) with the page photo and a scan line; the line "লেখা পড়ে AI, হিসাব মেলায় কোড, শেষ কথা আপনার।".
- **Reveal**: boxes draw onto the photo one by one (60 ms stagger), then settle green or turmeric (180 ms) as the client-side checks resolve; `mix-blend-mode: multiply`; "!" badge at a problem box's left edge; summary chips under the photo.
- **Deck**: problem cards first; progress segments (now / ok / look); ghost cards behind; card = strip, item + type, equation, check sentences (problem first), hint or note panel, edit receipt. Plain cards: "ঠিক আছে" or swipe right. Problem cards don't swipe: "খাতায় এটাই লেখা" (explicit acknowledgement) or fix. Editing clears that line's acceptance. Same state and confirm API as `src/lib/review/*`.
- **Fix sheet**: field, old value struck through, keypad, voice (listening → heard → value placed, never auto-saved), save.
- **Summary → confirm → seal**: stitched hero with the balance equation, every line with its note, confirm; the seal lands only when every line is accepted and the balance passes, straddling the page's bottom edge. Otherwise the end screen says what still fails.
- Check sentences per rule id: `data.js` `ruleCopy` and `check()` (in COPY.md part 2).

## D3: money screens (B4, B5) · `Money Screens.html`

- **Today** `/`: cover (shop, "আজ, <date>", hero = expected drawer cash, the equation under it) → tiles বিক্রি (cash/credit split bar) and টাকা গেছে (stock, suppliers, costs) → দিনের কথা (≤ 3 sentences: unchecked page, sales split, top dues risk, week trend) with the Ask pill → "দিনের হিসাব মেলান" (or the closed row with seal) → seven-day bars (today solid `--blue`, earlier `--blue-2`, average hairline, tap for a value, sr-only table) → dues link → hint. Every number opens `DrillSheet`; the hero opens the receipt, whose rows drill further with a back link.
- **New shop Today** (D4 `newToday`): cover with the morning cash only and "এখনো শুধু সকালের টাকা"; one empty card; a dashed red pointer down to the camera button, which pulses (static ring under reduced motion). No tiles, note or bars until the first page is confirmed.
- **Close the day** `/close`: pages with seal / tick / "not checked yet"; expected cash with breakdown; count sheet on the keypad; match = card with seal, then "দিন বন্ধ করুন" (counted cash becomes tomorrow's opening cash); gap = turmeric card with the amount, three likely reasons, and a red button that names the gap ("৳৫০ কম লিখে দিন বন্ধ করুন").
- **Dues** `/parties`: title + badge, segments পাওনা / দেনা, total, list sorted by risk rank → days → balance, each with its reason line (or "শেষ জমা …"). Empty: D4 `dues-empty`.
- **Party ledger** `/parties/[id]`: stitched hero (balance, reasons, last payment, oldest unpaid credit by FIFO), actions (remind, merge), timeline newest first: date, strip, verb + reading, ± amount, running balance.
- **Reminder sheet**: message from the template (how he addresses them, shop name, last payment date), attachment = unpaid lines with photos as one image, buttons কপি করুন and পাঠান (Web Share); says nothing is sent until he picks an app.
- **Ask sheet**: text field + mic, suggestions; listening; answer card (number, one sentence, proving lines, "আরও"), footer "হিসাব করেছে কোড … AI শুধু প্রশ্নটা বুঝেছে।"; unknown = says it won't guess, offers suggestions.

## D4: shop screens (B6) · `Shop Screens.html`

- **Welcome** `/welcome` (`welcome`): the red cover opens the new halkhata: kicker "নতুন হালখাতা", "Scriba" in Noto Serif Bengali 56, title in serif 26. Body sentence, language choice as two 64 px radio buttons (the chosen one gets an ink ring and a tick), note that it can change later, "পরের ধাপ". Language choice sets the locale cookie immediately; the whole flow re-renders in it.
- **How it works** (`how`): step dots 1/3; three numbered rows (photo; AI reads, code does the sums; you decide); a demo card with a real strip above its equation and the caption "উপরে আপনার লেখা, নিচে Scriba যা পড়েছে".
- **Shop name** (`shop`): dots 2/3, title question, 60 px input with ink ring, hint; next disabled until non-empty. Writes `shop_profiles.name`.
- **Morning cash** (`cash`): dots 3/3, question, hero figure with caret, hint ("leave 0 if unsure"), keypad, "খাতা খুলুন". Writes the opening cash, then goes to the new-shop Today.
- **History** `/history` (`history`, `day`, `search`, `search-none`, `history-empty`): title + badge, pill search field (names via the party normalized key, page titles), "এই সপ্তাহ", one card per day: date, weekday · page count, sales (blue, right), page thumbnails with a mark each (tick = checked or sealed, dot = waiting, dimmed), close status (matched / ৳x short / not closed). Day view: top bar with date and sales, two-column page cards (thumbnail, seal on sealed pages, title, state · lines), the "unchecked pages aren't counted" panel when one waits, close status, and for today a link to Today. Tapping a page opens `/check/[documentId]` (deck if unchecked, summary if confirmed). Search results: lines with handwriting, "name · reading", amount, "type · date", newest first; nothing found suggests a spelling variant.
- **More** `/settings` (`more`): title + badge; card দোকান (shop name, morning cash with "counted when you closed yesterday", both editable); card ভাষা (segmented বাংলা / English); learning card with the top confusion as a mini glyph pair (his ৮ → read ৪); print card (opens the khata PDF, P4); details card (all photos `/documents`, confirmed lines `/records`, accuracy `/evaluation`, for the audit trail); the sample-shop sentence on a sample shop; sign out (outline button).
- **Learning panel** (`learn`, P3 data): lead sentence; card "digits it mixes up most": rows of handwritten glyph (Atma in the mock; a crop of the confirmed line in the app) → turmeric read glyph, with "আপনার ৮ কে ৪ পড়েছিল · ৪ বার"; the latest example's strip; "you corrected N numbers on the last 20 pages". Card of 4 reference strips from confirmed lines. Switch "use this when reading new pages", **off by default** until F2 measures it, with "still being tested… every line is still checked". Closing panel: the aim is fewer misreads, never a promised accuracy. His digits stay Bangla in English mode, with the value in brackets ("Read your ৮ (8) as ৪ (4)"). Empty: `learn.empty`.
- **Nothing to check** (`nothing`): reading returned no lines. Page thumbnail, empty card, "nothing was added" with a dot mark, stacked actions: retake (red), add a line yourself (outline, opens the add-line sheet).
- **Error states** (one `ProblemScreen`, top bar "পাতা ১", optional photo, turmeric-soft panel with title + body, optional tips, one primary action):

| Step | Trigger in the app | Photo | "Your photo is kept" line | Action |
|---|---|---|---|---|
| `unreadable` | analyze 422 `unusable_output` (no blur detector exists; the copy names likely causes) | blurred | yes | retake; tips: light, fill the frame, hold still |
| `small` | upload 415 `too_small` | tiny | no (rejected) | retake |
| `file` | upload 415 `heic`, `unsupported_type`, `corrupt`, `empty`; 413 too large | none | no | retake |
| `sideways` | before sending: he checks orientation | rotated, turn button | n/a | turn / "it's upright, send" |
| `offline` | `navigator.onLine` false or fetch fails | tray, waiting marks | no; note "closing this screen discards the photos" (no offline queue yet) | try again |
| `failed` | analyze 502 `model_failed`, 500 `persistence_error` | plain | yes | try again |
| `busy` | analyze 429 `rate_limited` | plain | yes | try again |
| `waiting` | analyze 409 `previous_uncertain` / `in_progress` | plain | yes | check again (never silently re-run) |

- **Kit board** (`kit`): every primitive on one screen in the current language, for B1's visual comparison.

## Printable khata page (P4) · `Khata Page.html`

A5 portrait, prints as exactly one page at 100%. Four corner markers (6 mm ink squares with a white centre) for finding the page; header "Scriba খাতা" (serif, red) with a one-line promise, দোকান ____, পাতা নং box; columns তারিখ 13% | নাম 22% | জিনিস 19% | পরিমাণ 11% | দর 10% | টাকা 15% | বাকি/জমা 10%, red header rules and a red margin rule after তারিখ; a carried-balance row ("আগের পাতা থেকে জের"), 17 writing rows (each বাকি/জমা cell prints a faint "বা জ" to circle), a total row ("মোট · পরের পাতায় জের"); footer tips. The carry rows feed the `cross_record_continuity` check. P4 renders this as a PDF and tells the prompt the column order so position decides qty vs rate vs amount.

## Accessibility (all screens)

44 px minimum targets; ≥ 4.5:1 text contrast (turmeric is a fill, never text); visible focus ring (3 px `--blue`); every icon has a text label; figures have `aria-label`s that read the number and what tapping does; charts carry an sr-only table; `lang` attribute follows the locale; reduced motion = fades only.
