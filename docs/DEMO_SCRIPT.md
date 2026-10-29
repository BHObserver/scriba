# Demo script (2–3 minutes)

Record a backup video of a real run in case the live API is unavailable. Use only your own synthetic snippets. Never edit a live result to make the demo look better: if the model misreads something, show it and correct it on camera.

**Before recording:** sign in. Have **S04** (the deliberately wrong subtotal) uploaded but **not yet analyzed**, and **S01** already analyzed and partly confirmed, as a fallback.

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page | "Small shops in Bangladesh keep handwritten khatas in Bangla. Scriba turns a photo into checked records. AI proposes, code verifies, a human decides." |
| 0:15 | S04 document page: the untouched original, size, SHA-256 | "This is my own handwritten snippet. Scriba stores the exact bytes privately and has sent nothing to Meta yet." |
| 0:25 | Click **Analyze handwriting** (button disables) | "One explicit request to Meta's Muse Wonder, with a strict JSON schema. The model transcribes; it does not calculate." |
| 0:45 | Lines appear: Bangla text, item, qty, rate, amount; hover a line to show its box on the photo | "Bangla text is kept as written. Digits are normalized by code to exact poisha. The model also says where each line is." |
| 1:05 | **Ledger checks** card: written-total mismatch 320 vs 310; balance check consistent | "Code finds that the items add up to ৳320 but ৳310 is written. Scriba doesn't repair it. Note the closing balance is consistent with the item amounts." |
| 1:25 | Either acknowledge the mismatch, or, if the model misread something, correct it and show **changed by your edit** | "Edits recalculate instantly in the browser. No API call. Every change is audited." |
| 1:45 | Select lines → acknowledge → **Confirm selected into Scriba**; open **Confirmed records** | "Only approved lines become records, each traceable to the photo, the reading and my corrections. This is not an accounting posting." |
| 2:05 | **Evaluation & usage**: requests, tokens, estimated cost, cache hits; one evaluation card with counts | "Every metric shows its numerator and denominator. This is my own handwriting, so it is exploratory, not proof of general accuracy." |
| 2:30 | One limitation (pick a real one from the evaluation) | e.g. "Running balances without an opening balance can't be checked, so they're marked not checkable rather than passed." |

**Identify hackathon work:** everything in the repository was built during the event (Git history from 29 Oct 2026). Mention that in the video description.
