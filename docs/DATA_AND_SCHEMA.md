# Data and schema

Migration: `supabase/migrations/20261029120000_scriba_core.sql` (additive, idempotent bucket creation).

## Tables

| Table | One row per | Written by | Users may |
|---|---|---|---|
| `ledger_documents` | uploaded original (unique per user + SHA-256) | server, after inspecting the stored bytes | read, delete, edit labels |
| `extraction_runs` | real Meta attempt, including failures | server | read |
| `extraction_cache_hits` | reuse of a cached run (no request sent) | server | read |
| `extracted_entries` | AI candidate line; **immutable** (trigger blocks updates) | server | read |
| `entry_reviews` | human working copy of a candidate, or a line the reviewer added | user (RLS) | read, edit drafts, reject, add lines; cannot confirm |
| `page_reviews` | page-level review values (account convention, date, name) | user (RLS) | read, edit |
| `review_events` | audit event (`edit`, `reject`, `restore`, `add_row`, `confirm`, `page_edit`) | **triggers only** | read |
| `validation_findings` | rule result at extraction and at each confirmation | server | read |
| `confirmed_records` | approved Scriba record, with acknowledgements and traceability | server (`scriba_confirm_entries`) | read |
| `ground_truth_annotations` | immutable ground-truth version for a photo | user (RLS) | read, add version, delete |
| `evaluation_runs` | benchmark computation with versions, summary and per-sample details | server | read |

Composite foreign keys `(run_id, owner_id, document_id)` keep every child row consistent with its run, owner and photo.

### Traceability of a confirmed record

`confirmed_records` → `entry_review_id` (human values and version, with `review_events` history)
→ `extracted_entry_id` (immutable AI candidate) → `run_id` (model, prompt, schema, mode, usage, raw output)
→ `document_id` (original photo, SHA-256), and `confirmation_id` groups the
`validation_findings` captured at that moment.

## Server-only functions

- `scriba_complete_extraction(owner, run, run_json, entries_json, page_json, findings_json)`: marks a pending run succeeded and inserts candidates, review copies, page review and findings in one transaction.
- `scriba_confirm_entries(owner, run, confirmation_id, validator_version, records_json, findings_json)`: locks exactly the assessed versions of draft rows, then inserts records, marks rows confirmed, stores the findings snapshot and updates document status. A changed row raises `40001` and nothing is written.

`EXECUTE` is granted to `service_role` only.

## Storage

Bucket `scriba-originals`: private, 8 MB limit, JPEG/PNG/WebP only. Object path `<user id>/<random uuid>.<ext>`.
Policies allow the owner to insert, select and delete inside their own folder. There is **no update policy**, so originals cannot be overwritten.

## Extraction output (model → app), `scriba-extraction-1`

Page fields: `date_text`, `ledger_type` (`customer_credit | cash_sales | mixed | unknown`), `account_name`, `legibility`.

Entry fields: `id`, `line`, `text` (as written), `type` (`credit_sale | cash_sale | repayment | opening_balance | closing_balance | subtotal | adjustment | unknown`), `customer`, `item`, `qty`, `unit`, `rate`, `amount`, `balance` (numbers **as written**), `crossed_out`, `review` (fields the model was unsure about), `note`, `box` (0–1000 grid or null), and `warnings`.

Derived in TypeScript (stored in `extraction_runs.result`): normalized poisha and thousandths values, ISO date (only for an unambiguous DD/MM/YYYY), page opening and closing balances (only from explicit balance lines), written totals and normalization warnings.

## Versions recorded with every result

`model_id`, `prompt_version` (`scriba-prompt-4`; `scriba-prompt-3` via `SCRIBA_PROMPT_VERSION`), `schema_version` (`scriba-extraction-2`; `-1` with prompt 3), `processing_mode` (`baseline_original`, or `rotate_90` / `rotate_180` / `rotate_270` when the user turned the photo upright before analysis), `validator_version` (`scriba-validator-2`), `metrics_version` (`scriba-metrics-1`), ground-truth version.

## Data model v2: the shop (`20261031120000_scriba_shop_v2.sql`)

| Addition | What it holds | Who writes it |
|---|---|---|
| Transaction types `purchase`, `credit_purchase`, `supplier_payment`, `expense` | Money out. Money in = `cash_sale` + `repayment`; receivable = `credit_sale` − `repayment`; payable = `credit_purchase` − `supplier_payment` | n/a |
| `ledger_documents.business_date`, `business_date_source` (`capture` / `written` / `user`) | The day a page's lines happened: the written date when it parses (`src/lib/ledger/dates.ts`), else the capture day in Bangladesh time | Server at confirmation (never over a `user` date); the owner can change it |
| `parties` (`kind` customer/supplier, `display_name`, `normalized_key`, `merged_into`) | Customers and suppliers. The key folds common Bangla spelling variants (`src/lib/ledger/parties.ts`) | Created by `scriba_confirm_entries`; the owner can rename |
| `confirmed_records.party_id` | The record's party, following `merged_into` | `scriba_confirm_entries` |
| `shop_profiles` (`shop_name`, `language`, `opening_cash_poisha`, `is_sample`) | One per user | The owner, except `is_sample` (seed script only) |
| `day_closes` (`business_date`, opening, expected and counted cash, `breakdown`, `record_ids`, `note`) | A closed day; one per date | Server only (expected cash is computed by code) |

