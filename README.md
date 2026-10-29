# Scriba

**Turning handwritten shop ledgers into checked digital accounts.** Built in Cox's Bazar, Bangladesh, for the Meta Global AI Developer Hackathon (track: *Build for Your World*).

Many small shops in Bangladesh keep their accounts in handwritten *khatas*: Bangla script, Bangla digits, credit sales, repayments and running balances. Scriba takes a photograph of a page or a small snippet, has a Meta multimodal model transcribe it into structured candidate entries, checks the arithmetic in its own code, and lets the shopkeeper correct and explicitly confirm each line.

> **AI proposes. Code verifies. A human decides.** Only lines a person approves become Scriba records. Consistent arithmetic is evidence of consistency, not proof that the handwriting was read correctly.

## What it does

1. **Upload** a photo. The exact bytes go to a private bucket; Scriba records the SHA-256, type and dimensions, and warns if the photo carries GPS metadata.
2. **Analyze handwriting**, explicitly. One request to **Meta Muse Wonder 1.0** (Responses API, strict JSON Schema). The model returns every line as written (Bangla text, items, quantities, rates, amounts, balances), plus which fields it was unsure about and **where each line is on the photo** (Meta's perception grounding, in the same call).
3. **Verify** in TypeScript, not with another model call:
   - Bangla and mixed digits are normalized to exact integer poisha.
   - Quantity × rate, written totals, opening → closing balance and running balances are checked.
   - Anything that can't be checked is marked *not checkable*, never *passed*.
4. **Review & correct** beside the original photo. Every edit recalculates the checks instantly, shows what changed, and never calls the model. Each correction is recorded in an audit trail the database writes itself.
5. **Confirm**. Problems must be acknowledged one by one; the server re-runs every check before writing records. Each record traces back to its photo, the model's reading, and the human corrections.
6. **Evaluate**. Private ground truth, versioned benchmark runs, and metrics such as the *wrong-amount escape rate*, always shown with numerator and denominator. API requests, tokens, cache hits and estimated cost are visible.

## How Meta's models are used

| Capability | How Scriba uses it |
|---|---|
| Muse Wonder 1.0 image understanding | Reads handwritten Bangla ledgers, from small snippets to full pages, in one request per photo |
| Structured output (`text.format` JSON Schema, strict) | Typed entries with a controlled transaction-type vocabulary and explicit nulls |
| Perception grounding (0–1000 boxes) | Highlights each line on the original photo; validated and labelled as an estimate |
| Reasoning effort `low`, bounded `max_output_tokens`, `store: false` | Cost and privacy control |

Standard mode only (`muse-wonder-1.0`; it read handwritten Bangla digits far more reliably than `muse-spark-1.3`, see `docs/HANDOFF.md`): submitted content is not used for training. The model is never asked to do arithmetic or to judge its own answer.

## Credit discipline

- One explicit request per new photo.
- Results are cached by owner, image hash, model, prompt version, schema version and mode.
- Double-clicks and parallel tabs are de-duplicated, both in the server and with database unique indexes.
- No automatic retries. Timeouts are recorded as *uncertain*.
- Per-user rate limits and an optional allow-list apply.
- A test fails the build if anything other than the analyze path imports the Meta client.

## Architecture

Next.js 16 (App Router, TypeScript strict, Tailwind 4) · Supabase Auth, Postgres (RLS on every table) and private Storage · Meta Model API via the OpenAI-compatible SDK · Bun for packages, scripts and tests. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATA_AND_SCHEMA.md](docs/DATA_AND_SCHEMA.md).

## Run it yourself

Requires Bun ≥ 1.4, Node ≥ 20, a **new Supabase project** dedicated to Scriba, and a Meta Model API key.

```bash
bun install
cp .env.example .env.local        # fill in Supabase URL + keys and META_MODEL_API_KEY
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                  # tables, RLS, functions, private bucket and policies
bun run dev                       # http://localhost:3000
```

In Supabase → Authentication → URL configuration, set the Site URL and add `<site>/auth/confirm` as a redirect URL. After creating your account, disable new sign-ups and set `SCRIBA_EXTRACTION_ALLOWED_EMAILS` before any public deployment.

**Deploy to Vercel:** import the repository, add the same environment variables, and add the deployment URL to Supabase's redirect URLs. The analyze route allows up to 300 s.

## Tests

```bash
bun run test        # unit, credit-control and database security tests; never calls Meta
bun run typecheck
bun run lint
bun run build
bun run live:extract <photo> [--dry-run]   # explicit live check: one paid request
bun run secrets:scan                       # before committing: no secrets or private images staged
```

The database tests execute the real migration in PGlite (Postgres in WebAssembly), with stand-ins for Supabase's `auth` and `storage` schemas. They verify owner isolation, anonymous denial, forged-write prevention, immutable candidates, audited edits, atomic version-checked confirmation, and storage folder policies.

## Privacy

Photos, ground truth and raw model responses never enter this public repository (`private-test-data/` is git-ignored). Originals are private to their owner and are sent to Meta only on an explicit click. Sample ledgers are synthetic transactions handwritten by the author, not real shop data. See [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md), including the checklist for retiring the temporary Supabase project.

## Evaluation

Methodology and metric definitions: [docs/EVALUATION.md](docs/EVALUATION.md). **No results are reported yet.** Numbers will be added only from real evaluation runs, labelled exploratory: they come from the author's own handwriting and say nothing yet about other writers.

## Limitations (current)

- Verified live against the Meta API and the hosted Supabase project: `bun run live:smoke` covers upload, analysis, caching, confirmation, deletion and cross-user isolation. The browser UI hasn't been clicked through end to end yet.
- Sideways photos must be turned upright before analysis (the app offers this). In testing, a sideways photo produced a self-consistent misreading that every arithmetic check passed; the same photo upright was read correctly.
- Lines are aligned to ground truth by reading order; a split or merged line is scored as errors.
- Line boxes come from the model and can be off, especially for rotated photos.
- Cross-page balance continuity (Rule E) is implemented but not exposed: pages are never linked automatically.
- A confirmation is a reviewed Scriba record, not a double-entry posting, and nothing is sent to other systems.

## Built during the hackathon

Everything in this repository was written during the building period (27 Oct – 4 Nov 2026). The Git history begins on 29 Oct 2026. A Gemini-based HTML prototype was used privately only to confirm feasibility; none of its code is in Scriba.
