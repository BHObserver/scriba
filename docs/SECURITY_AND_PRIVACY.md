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

For any real shop data later: get consent from the shopkeeper, minimize names in the photo, and re-check Meta's data policies first.

## Known limitations

- Rate limiting is per user, counted from `extraction_runs` (rolling hour and day). There is no global limit across all users beyond the allow-list.
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
