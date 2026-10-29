# Scriba implementation plan

Living plan for the hackathon build. Status is updated as work lands; only items
that were actually run are marked done.

- **Submission deadline:** Wed 4 Nov 2026, 9:00 PM EST (= Thu 5 Nov, 08:00 Bangladesh time). US daylight saving ends on 1 Nov, so the deadline is in EST (UTC−5).
- **Building period:** 27 Oct – 4 Nov 2026. All code in this repository was written in that period. The Git history starts on 29 Oct.

## Decisions taken

| Topic | Decision | Why |
|---|---|---|
| Bun vs Node ("the Bun split") | **Bun** is the package manager, script runner and test runner (`bun install`, `bun run`, `bun test`). **Next.js runs on Node.js** for `dev`, `build` and Vercel. One app, no workspaces. | Bun is fast for installs and tests. Next.js and Vercel officially target Node, and Cache Components requires the Node runtime. Splitting into packages would add ceremony with no benefit for one app. |
| Gemini sample | Reference only. Scriba is written from scratch. The sample is git-ignored so judges never see non-Meta code. | It proved that "image + JSON prompt → Bangla transcription" works. Its client-side resizing, automatic retries and fake fallback results are the opposite of what Scriba needs. |
| Meta endpoint | `POST https://api.meta.ai/v1/responses` through the official OpenAI-compatible SDK. Strict JSON Schema in `text.format`, `reasoning.effort: low`, `max_output_tokens: 8000`, `store: false`, SDK retries disabled. | Documented in dev.meta.ai docs (image understanding, structured output, reasoning). `store: false` keeps responses from being retained. The strict schema with `type: ["string","null"]` was accepted live. |
| Model | **`muse-wonder-1.0`** at `effort: low` (standard mode), since 30 Oct. Before that `muse-spark-1.3`. Contributor mode is never selected automatically. | Live comparison on S01–S04, 30 Oct (table in `docs/HANDOFF.md`): Wonder read S01–S03 perfectly in all four of its runs and got 36–38 of 40 numbers right with prompt 3. Spark at low effort scored 32–35, varied between identical runs, and invented self-consistent lines (`২ × ১৪০ = ২৮০` for `১ × ১৪০ = ১৪০`) that pass every check. Medium or high effort on Spark didn't close the gap. Wonder costs ≈ $0.06 per image against ≈ $0.017. Muse Wonder is on the hackathon's list of eligible models. Standard-mode content is not used for training. |
| Image preparation | Photos under 3.3 megapixels are upscaled (lanczos3) to about 3.3 MP before sending; larger ones go as uploaded. The cache key version was bumped to `scriba-cache-2`. | Meta resizes images itself. Measured with `/v1/responses/input_tokens`: a 958×1280 WhatsApp photo reaches the model as 1,777 tokens, and the count rises to a cap of 4,263 at about 3.3 MP. Upscaling took Spark from 28 to 30 of 30 on S01–S03. It adds about $0.01 per image on Wonder. |
| Prompt `scriba-prompt-3` | Adds a "Reading digits" section. Read each digit from the ink and never use arithmetic to choose a digit. Bangla ৪ and ৭ look like Latin 8 and 9, so on a Bangla page those shapes are read as ৪ and ৭ and written as Bangla digits. ১/২/৯ and ৩/৬ are easily confused, so unsure fields go in `review`. | Prompt 2 told the model to keep the digit style. Writers mix scripts, and `8` meaning ৪ was misread as eight. The model also "fixed" misread lines by calculating, for example `৬ × ৬০ = ৩৬০` when the ink says `৩ × ৬০ = ১৮০`. Wonder on S04 went from 5–6 to 6–8 of 10. |
| Numbers | The model copies numbers **as written**. TypeScript normalizes Bangla and Arabic digits to integer poisha. | The model reads; it does not compute. Deterministic code does the arithmetic, which keeps "AI proposes, code verifies" true. |
| Line positions | Requested in the same single call (bounding boxes on Meta's 0–1000 grid), validated, and shown only as "the model's estimate". | Meta's perception grounding comes at no extra request cost. It's an honest use of a distinctive capability. |
| Upload path | Browser → private Supabase bucket under the user's own folder (Storage RLS). The server then re-downloads, inspects and checksums the bytes before recording anything. | Vercel functions cap request bodies at 4.5 MB, and the upload limit is 8 MB. The original is never proxied or re-encoded. |
| Trust model | Users read their own rows; they can write only what they author (review edits, ground truth). Extraction results, usage, confirmations and evaluations are written by the server with the secret key, after verifying the user. | Prevents a user from forging "successful" runs or confirmations through the Data API. |
| Output budget | `SCRIBA_MAX_OUTPUT_TOKENS=8000` (was 1,800). | Live, 29 Oct: at `effort: low` the first call spent 1,798 of 1,800 tokens on reasoning and returned nothing (`incomplete`). Snippets then used 1,255–2,752 output tokens, 675–1,898 of them reasoning. Reasoning can't be switched off on `muse-spark-1.3` (`none` returns 400), and only tokens used are billed, so a high ceiling costs nothing extra. Worst case ≈ $0.04 per image. |
| Prompt `scriba-prompt-2` | Header lines (date, customer, "Sample-0X" labels) are page fields, not entries. Opening and closing balance figures go in `amount`. `মোট বাকিতে` / `আজকের বাকি` are subtotals. | Prompt 1 made the header lines `unknown` entries and put the balance figures under `balance`, so the opening → closing check couldn't run. The parser also moves a balance-only figure into `amount` on opening and closing lines, as a deterministic safety net. |
| Orientation | The user can turn the photo before analysis. Modes `rotate_90/180/270` send a server-rotated copy (sharp, after the checksum check); the stored original never changes. The review shows the photo in the same orientation, so the line boxes line up. | Live, 29 Oct: sideways S03 came back with line 2 misread and the total misread to match it, so **every check passed on wrong data**. The same photo upright was read perfectly, with a third of the reasoning tokens. Asking the model to detect orientation would cost a call; a manual turn is deterministic. |
| Voice correction (Muse Voice Transcribe) | **Not in the core build.** Decide on **Mon 2 Nov** once the core and the 20-snippet evaluation are done. See the section below. | It helps the "use of Meta tooling" score, but it isn't needed for the core claim, and the core must be solid first. |

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 Foundation | Next.js 16 + TS strict + Tailwind 4, Bun, `.gitignore` for private data, `.env.example` | **Done**: typecheck, lint, tests and build pass |
| 1 Supabase | Migration: tables, RLS, grants, audit triggers, atomic server functions, private bucket and policies | **Applied live (30 Oct)** through the Management API with `SUPABASE_ACCESS_TOKEN`, recorded in `supabase_migrations.schema_migrations`. Tested offline (PGlite) and live (`bun run live:smoke`) |
| 2 Meta PoC | `scripts/live-extract.ts` (explicit, one request; `--turn=90|180|270`) | **Done live (29 Oct)**: 7 calls, ≈ $0.08 in total. Findings in `docs/HANDOFF.md` |
| 3 Upload | Direct-to-bucket upload with progress, server-side magic-byte, dimension, truncation and GPS checks, SHA-256 before and after storage | **Built**; covered by unit tests. Not yet exercised against the live bucket |
| 4 Extraction pipeline | Cache key, idempotent request ids, one pending run per key, rate limits, integrity check, single call, parse, validate, atomic persist | **Built**; 15 credit-control tests with a counting mock |
| 5 Validation | Rules A–E plus number-format, model-uncertainty and classification checks | **Done**: unit tests include all five samples and the deliberate ৳310 subtotal |
| 6 Review & confirm | Side-by-side review, instant local recalculation with "changed by your edit", audited saves, add or reject lines, per-problem acknowledgement, server-side re-validation on confirm | **Built**; approval rules unit-tested. UI not yet exercised end to end |
| 7 Evaluation | Ground-truth format, metrics with numerators and denominators, versioned evaluation runs, usage dashboard | **Built**; metric tests pass. Needs real ground truth |
| 8 Hardening & demo | Live end-to-end run, deploy, demo script, backup video | **Next** |

## What you need to do next (in order)

1. ~~**Fill `.env.local`**~~ Done 29 Oct.
2. ~~**Apply the database migration**~~ Done 30 Oct (Management API). For later migrations, `supabase db push` needs `SUPABASE_DB_PASSWORD` as well as the access token; the repo is already linked. For reference: to your Scriba project:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   (Or paste `supabase/migrations/20261029120000_scriba_core.sql` into the SQL editor.)
3. **Auth settings** (Dashboard → Authentication). Site URL and the local redirect URL were set on 30 Oct; what's left is turning off sign-ups after you create your account:
   - URL configuration: Site URL `http://localhost:3000`. Add redirect URL `http://localhost:3000/auth/confirm`, and later your Vercel URL.
   - Create your account in the app, then **turn off "Allow new users to sign up"** and set `SCRIBA_EXTRACTION_ALLOWED_EMAILS=<your email>` before deploying publicly.
4. ~~**One live proof-of-concept call**~~ Done 29 Oct, see `docs/HANDOFF.md`. For reference:
   ```bash
   bun run live:extract private-test-data/ledger-snippets/S01.jpg
   ```
   Check three things: (a) the strict JSON Schema is accepted (an HTTP 400 here means we change the nullable style); (b) `status` is `completed`, not `incomplete`; (c) `out=` tokens leave headroom under 1,800, since reasoning counts toward the budget. Share the console output (not the photo) and I'll tune from it.
5. **Run the app** (`bun run dev`), upload the same photo, click **Analyze handwriting**, review and confirm one line.
6. **Ground truth for the snippets.** Templates are in `private-test-data/ground-truth/` (git-ignored). Fill them from the photos, not from model output, then paste each into Evaluation → Add ground truth.

## Remaining build work (after your steps 1–5)

- [x] Fix anything the first live call reveals: token budget raised to 8,000, prompt 2, orientation control (29 Oct).
- [ ] End-to-end check of the UI against the live project: upload, analyze, edit, reject, add line, confirm, records, delete. (The server path for upload, analyze, turned analysis, cache, confirm and delete passed live on 30 Oct with `bun run live:smoke`; clicking through the UI is still to do.)
- [x] Live RLS spot-check with two accounts (30 Oct, `bun run live:smoke`): B can't list A's rows, sign, download or upload into A's photos, open A's page (404) or analyze A's document; nobody can write runs directly.
- [ ] Deploy to Vercel (`maxDuration` 300 s on the analyze route). Set the env vars and add `<vercel-url>/auth/confirm` to the auth redirect allow-list. Then run `SCRIBA_APP_URL=<vercel-url> bun run live:smoke` before setting the email allow-list.
- [ ] Evaluate the 20 snippets; write up actual numbers in `docs/EVALUATION.md`.
- [ ] Demo script rehearsal and a backup video recording (`docs/DEMO_SCRIPT.md`).
- [ ] Optional stretch, decided on 2 Nov: voice correction (below).

## Suggested timeline

| Day (Bangladesh time) | Goal |
|---|---|
| Thu 29 Oct | Foundation, schema, core logic, UI (done today) |
| Fri 30 Oct | Your steps 1–5; fix live-call findings; end-to-end UI pass |
| Sat 31 Oct | Upload all 20 snippets; ground truth; first evaluation |
| Sun 1 Nov | Prompt iteration on **development** samples only (new prompt version each time); deploy to Vercel |
| Mon 2 Nov | Voice decision; polish; README numbers |
| Tue 3 Nov | Demo rehearsal, video recording, final docs (last day for organiser troubleshooting) |
| Wed 4 Nov | Buffer; submit well before 08:00 on Thu 5 Nov Bangladesh time |

## About the 20 snippets

- The five designed samples (S01–S05) are the core development set. Their intended values are pre-filled in the private templates. **Verify every value against your actual photo before saving.**
- Label the other snippets honestly in each ground truth's `split`:
  - `development` if you wrote them, or if they'll be used to tune the prompt.
  - `held_out` if someone else wrote them and you won't look at their results until the final evaluation. Don't change the prompt after looking at held-out results.
- Name photos `S01.jpg … S20.jpg` in `private-test-data/ledger-snippets/` and give each document the matching sample label. S01–S04 are already there (copied from `1.jpeg`, `4.jpeg`, `2.jpeg`, `3.jpeg`). S03 was photographed sideways: turn it upright in the app (or `--turn=270` in the script).

## Voice correction: recommendation

Muse Voice Transcribe supports Bengali, and file transcription costs $0.18 per audio hour, so cost is not the issue. The work is:

1. Record in the browser and convert to 16 kHz mono 16-bit WAV (the endpoint accepts only WAV).
2. Add a server route that forwards the audio to `POST /v1/asr/transcribe` with `languageBias: ["Bengali"]`.
3. Put the transcript **into the field as text** for the user to save. It's never auto-applied and never sent to another model.
4. **The hard part:** people say numbers as words ("একশো আশি"). The deterministic number parser would need a Bangla number-word reader. It's testable, but it's new logic.

Estimate: one focused day. Build it only if the core flow, deployment and evaluation are finished by 2 Nov. If not, mention it as future work in the README.
