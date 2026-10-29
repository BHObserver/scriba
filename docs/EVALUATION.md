# Evaluation

**Status: no evaluation has been run yet.** This page will report measured results with their counts once photos and ground truth exist. Every number below the methodology must come from an `evaluation_runs` row.

## Datasets

| Set | Writer | Purpose | Status |
|---|---|---|---|
| Development | the author (synthetic transactions written by hand) | build and prompt tuning | 20 snippets being collected; S01–S05 follow the designed samples |
| Held-out | other writers | generalization check | does not exist yet. **No held-out claim may be made until it does.** |

These are controlled samples, not real shop data. They cannot show how Scriba performs across Bangladesh.

## Protocol per photo

1. Keep the original bytes; Scriba records the SHA-256.
2. Write the ground truth **from the photo**, in the private template, before looking at any model output for that photo.
3. Upload and click **Analyze handwriting** once.
4. Run an evaluation (Evaluation → Run evaluation). It makes no API calls and compares the stored run with the latest ground-truth version.
5. Never edit an old result. A prompt change creates a new `PROMPT_VERSION`, new runs and a new evaluation row.

## Ground-truth format (`scriba-ground-truth-1`)

See `docs/examples/ground-truth.example.json` (synthetic). Per entry: `type`, `customer`, `item`, `quantity`, `unit`, `rate`, `amount`, `balance`, `unreadable` (fields excluded from scoring) and `expected_flag` (the source is wrong on purpose, e.g. Sample 4's ৳310 subtotal). Per sample: `split` (`development` or `held_out`), `writer`, `manual_transcription_seconds`.

## Metric definitions (`scriba-metrics-1`)

Model output is scored **before** any human correction. Entries are aligned by reading order (line *n* with line *n*), which is strict: a split or merged line counts as errors after it.

| Metric | Numerator | Denominator |
|---|---|---|
| Field accuracy | scored fields exactly right (numbers compared after normalization; text after whitespace and Unicode normalization) | scored fields (excluding `unreadable`; absent-on-both-sides counts as correct; missing or extra lines count as wrong) |
| Exact amount accuracy | labelled amounts read exactly | labelled amounts |
| Wrong-amount escape rate | wrong extracted amounts that an arithmetic rule could test and that ended up **unflagged** | wrong extracted amounts that an arithmetic rule could test |
| Wrong amounts outside check coverage | count of wrong amounts no arithmetic rule could test | (reported as a count) |
| Error rate among unflagged amounts | wrong amounts with no flag | all extracted amounts with no flag (N/A if 0) |
| Review rate | extracted lines with a blocker or a warning that must be acknowledged | extracted lines |
| False-alarm rate | correctly read lines (all scored fields right, not `expected_flag`) that were flagged | correctly read lines |
| Intentional errors caught | `expected_flag` lines that were flagged | `expected_flag` lines |

"Flagged" means the approval rules require attention: a blocker (e.g. unknown type, unreadable amount) or a finding needing explicit acknowledgement (mismatch, model uncertainty, mixed digits). "Could not check" information alone is not a flag.

Lines that belong to a failing total are flagged too, which counts honestly as review burden on correctly read lines.

**Time per page:** manual transcription seconds (from ground truth, stopwatch-measured) vs model wait (`elapsed_ms`) and human review time (first opening of the review screen → last confirmation). Time savings are never inferred from model latency alone.

**API usage:** request count by status, cache hits, input, output and reasoning tokens, and estimated cost from published prices.

## Results

_None yet._
