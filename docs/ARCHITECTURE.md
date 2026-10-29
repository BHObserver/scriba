# Architecture

**AI proposes. Code verifies. A human decides.**

```
Browser                         Next.js (Node, Vercel)                      Supabase (dedicated project)       Meta Model API
───────                         ──────────────────────                      ────────────────────────────       ──────────────
pick photo ─ inspect bytes,
             SHA-256 locally
upload exact bytes ───────────────────────────────────────────────────────▶ Storage: scriba-originals/<uid>/…
                                                                             (private, RLS, no overwrite)
POST /api/documents ─────────▶ re-download as user, check magic bytes,
                               dimensions, truncation, checksum ──────────▶ ledger_documents (server-attested)

click "Analyze handwriting"
POST /api/documents/:id/analyze ─▶ pipeline (src/lib/extraction/pipeline.ts)
                                  1 cache key → cached? return, no call
                                  2 request id seen? return earlier run
                                  3 pending run? in progress / stale→uncertain
                                  4 rate limit
                                  5 insert pending run (unique indexes)
                                  6 download original, verify SHA-256
                                  7 ONE request ──────────────────────────────────────────────────────────────▶ POST /v1/responses
                                                                                                                 muse-wonder-1.0
                                  8 parse + zod-validate ◀────────────────────────────────────────────────────── strict JSON, usage
                                  9 normalize digits → poisha (TS)
                                 10 validate rules A–E (TS)
                                 11 scriba_complete_extraction() ─────────▶ runs, immutable candidates,
                                                                             review copies, findings (atomic)
review screen (client)
  edits recompute rules locally ─ never calls Meta
  save ──────────────────────▶ PATCH /api/reviews/:id (as user, RLS) ─────▶ entry_reviews (+ audit trigger)
  confirm ───────────────────▶ POST /api/runs/:id/confirm
                               reload, re-validate, re-check approval
                               scriba_confirm_entries() ──────────────────▶ confirmed_records (atomic,
                                                                             version-checked)
```

## Modules

| Path | Responsibility | Depends on |
|---|---|---|
| `src/lib/numerals.ts` | Bangla/Arabic digits, money → poisha, quantities → thousandths, dates | nothing |
| `src/lib/validation/engine.ts` | Rules A–E plus reading checks; finding diffs | numerals |
| `src/lib/review/approval.ts` | Safety rules for approval; acknowledgement fingerprints | engine |
| `src/lib/extraction/{prompt,schema,parse,cache-key}.ts` | Versioned prompt, JSON Schema + zod mirror, response parsing and normalization | numerals |
| `src/lib/meta/transport.ts` | **The only code that calls Meta.** One request, no retries, error normalization | OpenAI SDK |
| `src/lib/extraction/pipeline.ts` | Credit-control orchestration with an injected repository and model caller | all of the above (types only for Meta) |
| `src/lib/server/*` | Supabase repository, auth helpers, review loader | Supabase |
| `src/lib/evaluation/*` | Ground-truth format and metrics | engine, approval |
| `src/app/api/*` | Route handlers; each verifies the user | lib |
| `src/components/*` | Upload, analyze, review workspace, ground-truth editor | lib (client-safe parts) |

A test (`tests/credit-control.test.ts`) enforces that only the analyze route's server
module and the explicit live script import the Meta transport. That structurally
guarantees that edits, revalidation, filters and reopening a document cannot spend credits.

## Why these choices

- **The model copies numbers as written.** Normalization and arithmetic are deterministic TypeScript, so a check can never be "fixed" by the same model that made the reading.
- **Direct-to-Storage upload.** Vercel functions accept at most 4.5 MB request bodies, and the server must never re-encode the original. The server verifies what landed instead.
- **Orientation is a processing mode.** The user can turn a sideways photo before analysis. The server rotates a copy of the verified bytes (`src/lib/images/rotate.ts`) and records `rotate_90|180|270` on the run, so the cache key, run history and evaluation all show which orientation was used. The stored original never changes.
- **Server-attested records.** RLS lets users read their own data, but only the server (secret key, after verifying the user) can write runs, usage, confirmations and evaluations. Triggers write the audit trail.
- **No Cache Components.** Every page is private and per user; there is nothing to share across requests.
- **Bun + Node.** Bun installs packages, runs scripts and tests. Next.js runs on Node.js.
