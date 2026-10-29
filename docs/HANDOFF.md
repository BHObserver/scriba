# Handoff

For a fresh session: read this, then `docs/IMPLEMENTATION_PLAN.md`. Do **not** open or search for the author's private accounting application; Scriba is standalone.

## Update, 30 Oct 2026 (evening): model switched to Muse Wonder

The author's first UI run (S04 on `muse-spark-1.3`, prompt 2) got 4 of 6 amounts wrong: `৩ × ৬০ = ১৮০` → `৬ × ৬০ = ৩৬০`, `৩১০` → `৬২০`, `১০০` → `৯০০`, `১,০২০` → `২০২০`. So a comparison was run with a scratch script: each config on S01, S02, S03 (upright) and S04, scoring every handwritten qty, rate and amount against `private-test-data/ground-truth/` (40 numbers in all). There were 48 live calls, ≈ $1.67. The raw responses are in `private-test-data/responses/`.

| Config | Prompt | Image | Correct of 40 | S01–S03 | S04 | $ per 4 images |
|---|---|---|---|---|---|---|
| Spark 1.3, low | 2 | original | 32 | 28/30 | 4/10 | 0.04 |
| Spark 1.3, medium | 2 | original | 31 | 27/30 | 4/10 | 0.08 |
| Spark 1.3, high | 2 | original | 34 | 28/30 | 6/10 | 0.10 |
| Spark 1.3, low | 2 | upscaled | 34 | 30/30 | 4/10 | 0.06 |
| Spark 1.3, medium | 2 | upscaled | 33 | 30/30 | 3/10 | 0.08 |
| Wonder 1.0, low | 2 | original | 35 | 30/30 | 5/10 | 0.21 |
| Wonder 1.0, medium | 2 | original | 36 | 30/30 | 6/10 | 0.32 |
| Spark 1.3, low (two runs) | 3 | upscaled | 32 / 35 | 29/30, 29/30 | 3/10, 6/10 | 0.07 |
| Spark 1.3, high | 3 | upscaled | 35 | 30/30 | 5/10 | 0.18 |
| **Wonder 1.0, low** (two runs) | 3 | upscaled | **38 / 36** | **30/30, 30/30** | 8/10, 6/10 | 0.23 |

"Upscaled" means a long edge of 1,916 px; the final Wonder run used the app's own 3.3 MP preparation.

**Shipped:** `muse-wonder-1.0` at `effort: low` (code default, `.env.example`, `.env.local`), `scriba-prompt-3`, and upscaling of small photos in `prepareImageForModel`. Reasons are in `docs/IMPLEMENTATION_PLAN.md`. To go back to Spark, set `META_MODEL_ID=muse-spark-1.3`; the rest still helps it.

What the numbers say:

- **Spark's problem is reliability, not average accuracy.** At low effort, identical runs differ, and S01 lines it had read correctly came back wrong in later runs. Higher effort didn't fix this.
- **The worst failure is invented arithmetic.** Spark wrote `ডাল ২ কেজি × ১৪০ = ২৮০` for `১ × ১৪০ = ১৪০`. That line is internally consistent, so only the page-level checks can catch it.
- **S04 is hard for every model.** `৮০০` was read as `৪০০` in 8 of 12 runs; the writer's ৮ resembles ৪. `৩১০` (the deliberately wrong subtotal) often came back as `৩২০`, the correct sum. In the final Wonder run, S04's misreads still failed the subtotal and balance checks, so the page is flagged, not passed.
- With 4 samples from one writer, this is development evidence only. The held-out S05–S20 decide the claim.

## Update, 30 Oct 2026: Supabase is live

- **Migration applied** to the Scriba project (`faozgszucjoqcehrewab`, eu-west-1) through the Management API, using `SUPABASE_ACCESS_TOKEN` (set with `setx`, so read it from the user environment). It's recorded in `supabase_migrations.schema_migrations`. The CLI is linked, but `supabase db push` / `migration list` also need `SUPABASE_DB_PASSWORD`.
- **Auth:** the Site URL was already `http://localhost:3000`; `http://localhost:3000/auth/confirm` was added to the redirect allow-list. Sign-ups are still open so the author can create an account. Email uses Supabase's built-in mailer (2 emails per hour).
- **`bun run live:smoke` passed 22/22 live**, using two throwaway users that were deleted afterwards. It covered upload, server verification, analysis (S01 as uploaded; S03 turned 270°, read perfectly), request de-duplication, cache reuse, confirmation (4 records), cross-user isolation and deletion. Afterwards the database was empty again: 0 users, documents and objects.
- The project has Supabase's own `rls_auto_enable` event trigger (it turns on RLS for new public tables). It isn't from Scriba; leave it.

## State at the end of session 2 (29 Oct 2026, evening)

**Meta is live.** 7 calls through `bun run live:extract`, ≈ $0.08 in total. Raw responses are in `private-test-data/responses/` (git-ignored).

- The strict JSON Schema (`type: ["string","null"]`) is accepted. No schema change needed.
- **Token budget:** at 1,800, reasoning used 1,798 tokens and the call ended `incomplete`. Raised to 8,000. Snippets now use 1,255–2,752 output tokens, 675–1,898 of them reasoning, at $0.007–0.015 each and 6–16 s.
- **Prompt 2:** header lines are no longer entries, and opening/closing balances land in `amount`, so the balance check runs. The parser also moves a balance-only figure on those lines (`src/lib/extraction/parse.ts`).
- **Orientation control added.** Sideways S03 was misread in a self-consistent way (line 2 and the total), so every check passed on wrong data. Upright, it was read perfectly. Users can now turn the photo before analysis. See "Orientation" in `docs/IMPLEMENTATION_PLAN.md`.

Readings with prompt 2, compared with the S01–S04 template values (still to be verified by the author):

| Sample | Misreads | Caught by checks? |
|---|---|---|
| S01 | Soap qty `১` → `২` (an earlier run instead misread the closing `৯৭০` → `১৭০`) | Yes: quantity × rate |
| S02 | Opening `৪৫০` → `৪২০`; unit came back garbled (`কেজ7`) | Yes: opening → closing balance. The unit isn't checked |
| S03 sideways | Line 2 `রুটি ৮ × ১৫ = ১২০` → `চিনি ২ × ৯৫ = ১৯০`, total `৪২৪` → `৪৯৪` | **No.** Everything is consistent, so all checks pass |
| S03 upright | None | n/a |
| S04 | `৩ × ৬০ = ১৮০` → `৬ × ৬০ = ৩৬০` (consistent within the line), `৩১০` → `৬২০`, `১০০` → `৯০০` | Partly: the total and balance checks fail, but quantity × rate passes on line 2 |

Main pattern: this writer's `১/৯`, `৩/৬` and `২/৫` get confused. A line misread can be internally consistent (S04 line 2), so the page-level checks are what catch it. Worth testing `META_REASONING_EFFORT=medium` on development samples during the 1 Nov prompt iteration.

**Still not done (needs the author):**

- ~~The migration isn't applied~~ Applied 30 Oct (see above).
- Create the author's account, then the first end-to-end UI run (plan steps 3 and 5).
- Ground truth: verify the S01–S04 templates against the photos.

**Verified by running:** `bun run test` (175 pass), `bun run typecheck`, `bun run lint`, `bun run build`.

## State at the end of session 1 (29 Oct 2026)

**Verified by running:**

- `bun run test`: 166 tests pass. They cover numerals, validation rules A–E, approval rules, parsing, image inspection, credit control, metrics and ground truth, plus 15 database security tests on PGlite.
- `bun run typecheck`, `bun run lint` and `bun run build`: all pass, without any env vars set.
- `bun run live:extract <png> --dry-run` builds the Responses request correctly.

**Not verified yet (blocked on credentials, not on code):**

- No live Meta call has been made. Unknowns:
  - Does Meta accept `type: ["string","null"]` in strict mode?
  - What does real usage look like?
  - Does 1,800 output tokens leave headroom once reasoning tokens are counted?
- The migration has not been applied to the hosted Supabase project.
- The UI has not been clicked through end to end.

## Where things are

| Concern | File |
|---|---|
| Meta request, response parsing, error mapping | `src/lib/meta/transport.ts` |
| Orientation (modes, server-side rotation, display) | `src/lib/images/orientation.ts`, `src/lib/images/rotate.ts`, `src/components/photo-orientation.tsx` |
| Prompt (bump `PROMPT_VERSION` on any change) | `src/lib/extraction/prompt.ts` |
| Schema (bump `SCHEMA_VERSION`) | `src/lib/extraction/schema.ts` |
| Credit rules | `src/lib/extraction/pipeline.ts`, tested in `tests/credit-control.test.ts` |
| Checks | `src/lib/validation/engine.ts` |
| Approval safety rules | `src/lib/review/approval.ts` |
| DB, RLS, storage | `supabase/migrations/20261029120000_scriba_core.sql`, tested in `tests/db/rls.test.ts` |
| Review UI | `src/components/review-workspace.tsx` |
| Metrics | `src/lib/evaluation/metrics.ts` |
| Private data (git-ignored) | `private-test-data/` (photos, ground-truth templates S01–S20, raw responses) |

## If the first live call fails

- **HTTP 400 mentioning the schema:** switch the nullable fields in `EXTRACTION_JSON_SCHEMA` to `anyOf: [{type:"string"},{type:"null"}]`, or set `strict: false`, and bump `SCHEMA_VERSION`. The local zod validation stays the safety net either way.
- **`status: incomplete`, `max_output_tokens`:** raise `SCRIBA_MAX_OUTPUT_TOKENS`. Never truncate entries silently.
- **400 on `reasoning.effort`:** try `minimal` or omit it (config in `getMetaConfig`).
- **The model computes or "fixes" totals:** tighten the prompt and bump `PROMPT_VERSION`. Keep the old runs.

## Next concrete action

The author signs up at http://localhost:3000 (confirm by email), then: sign-ups off, set `SCRIBA_EXTRACTION_ALLOWED_EMAILS`. Click through the UI with S01 and the sideways S03 (turn it upright first). Then work through "Remaining build work".
