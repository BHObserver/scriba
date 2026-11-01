# Security and privacy

## Boundaries

- Scriba is a standalone product with its own repository, Supabase project, auth and storage. It has no connection to any other accounting system. Confirmations stay inside Scriba.
- The repository is public. Photographs, ground truth, raw model responses, `.env*` files and dumps are git-ignored. Run `bun run secrets:scan` before every commit; it inspects staged files.

## Controls implemented

| Control | Where | Tested |
|---|---|---|
| Authentication required for every private page and API route | `src/proxy.ts` (optimistic), `requireUser` and `apiUser` (authoritative, `auth.getUser()`) | build; manual check pending |
| Row Level Security on every table, owner-scoped | migration | `tests/db/rls.test.ts` (PGlite) |
| Minimal explicit grants; anonymous role gets nothing | migration | same |
| Server-attested writes (runs, usage, documents, confirmations, evaluations) | service-role client after user verification | same (users cannot forge them) |
| Immutable AI candidates; trigger-written audit trail | migration | same |
| Private bucket, per-user folders, no overwrite | migration | same |
| Real file type from magic bytes; truncation, dimension and size limits; HEIC rejected with guidance | `src/lib/images/inspect.ts`, `/api/documents` | `inspect.test.ts` |
| Checksum computed in the browser, re-verified on the stored object, and again before sending to Meta | upload panel, `/api/documents`, pipeline | `credit-control.test.ts` |
| Meta and Supabase secret keys server-only | `config.ts`, no `NEXT_PUBLIC_` | — |
| Paid calls: explicit only, rate-limited, allow-list, no automatic retries | analyze route, pipeline, transport | `credit-control.test.ts` |
| Optimistic concurrency on edits and confirmation | `version` columns, RPC lock | `rls.test.ts` |
| Security headers (`nosniff`, `DENY` framing, no referrer) | `next.config.ts` | — |
| No logging of photos, names or amounts | route handlers log error categories only | code review |

## Data sent to Meta

Only when the user clicks **Analyze handwriting**: the original photo bytes (base64 data URL) and the fixed prompt. `store: false` is set so the response is not stored by the API. Standard-mode model only, so content is not used for training. By default the original is sent **unchanged**, including EXIF metadata, and the app warns when GPS metadata is present. If the user turns a sideways photo upright first, the server sends a rotated copy instead: it is re-encoded from the checksum-verified original and carries no metadata. The stored original is never changed.

Voice (P1), only when the user presses **বলে দিন / Say it** and then stops: one WAV clip of at most 15 s, mono, no metadata, sent to Muse Voice Transcribe in push-to-talk mode. The audio isn't stored by Scriba. In the fix sheet the transcript goes back to the user's screen only: the server doesn't log it or save it, and no other model reads it. In Ask Scriba the transcript is the question, and goes on to the Ask call below like a typed one. The server logs only the clip's length and estimated cost. The page allows the microphone for its own origin only (`Permissions-Policy: microphone=(self)`).

Ask Scriba (P2), only when the user sends a typed or spoken question: the question (at most 200 characters) and the shop's own vocabulary, meaning the names of the customers and suppliers with confirmed lines (up to 200) and the item names on sale, purchase and cost lines (up to 150). No amount, date or record is sent, and the strict schema lets the model return only a query shape (intent, a name or item from that list, a period key). `store: false`. Code computes the answer from the user's confirmed records. The server logs the shape's intent, token usage and cost, never the question. Tapping a suggested question sends nothing to Meta: its shape is fixed in code.

Learning your handwriting (P3), only when the user has switched it on in More → "Scriba is learning your handwriting" (off by default, and `SCRIBA_LEARNING=off` disables it for a deployment). The page is then read with prompt 5, and the same request also carries two things. The first is up to 4 of the user's own confirmed lines, cut from their own photos into one JPEG and read through their own client (RLS). The second is those lines' confirmed fields (item, qty, rate, amount) plus counts of digits misread before ("৮ read as ৪, 3 times"). It never includes names of parties, dates or other pages, or anything from the page being read, and nothing from another user. `store: false` as for every reading. The switch is stored in the user's auth metadata (`scriba_learning`). The learning panel itself is computed in code and sends nothing.

Printed Scriba khata pages (P4): when the user ticks "Scriba খাতার ছাপা পাতা / Printed Scriba khata page" on the camera screen, the instructions gain a fixed description of the printed columns. Nothing about the user is added. The blank khata PDFs (`/khata.pdf`, `/khata-a4.pdf`) are static files served without sign-in; the proxy skips `.pdf` as it does images.

For any real shop data later: get consent from the shopkeeper, minimize names in the photo, and re-check Meta's data policies first.

## Known limitations

- Rate limiting is per user, counted from `extraction_runs` (rolling hour and day). There is no global limit across all users beyond the allow-list.
- Voice limits (60 clips an hour, 300 a day per user) live in server memory, so each serverless instance counts separately. A clip costs about $0.0005, the server refuses clips over 15 s, and `SCRIBA_VOICE=off` is a kill switch.
- Ask limits (20 questions an hour, 60 a day per user) also live in server memory. A question costs about $0.013 (mostly reasoning tokens), and `SCRIBA_ASK=off` is a kill switch that leaves the suggestions working.
- Signed image URLs live for 10 minutes. Anyone holding the URL during that window can view the image.
- The audit trail records values, not IP addresses or devices.
- Deleting a document removes the database rows first, then the stored file. If the file removal fails, the response says so, and the orphaned private object needs manual cleanup.

## Retiring the temporary Supabase project (manual checklist)

Nothing is deleted automatically. When the hackathon is over:

1. Export anything you want to keep: from Evaluation, copy the evaluation summaries, or run `select * from evaluation_runs` in the SQL editor and save the result **privately**.
2. Revoke the Meta API key in the Meta dashboard if it's no longer needed.
3. In Vercel, remove the environment variables or delete the deployment.
4. In Supabase: Storage → `scriba-originals` → delete all objects → delete the bucket.
5. Then pause or delete the Supabase project (Settings → General). Deleting the project removes the database, auth users and backups.
6. Delete `private-test-data/` from your machine if the photos shouldn't be kept.

The public repository stays usable: anyone can create a new Supabase project, run the migration and set their own keys.
