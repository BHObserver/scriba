# MASTER PROMPT — SCRIBA
## Standalone Hackathon MVP: Handwritten Bangla Ledger Extraction, Verification and Human Approval

You are Claude Code, acting as my senior full-stack developer, multimodal AI integration engineer, application security engineer, QA engineer and product designer.

Build Scriba as a complete, independently deployable web application for the Meta Global AI Developer Hackathon.

This is an implementation assignment. Inspect the Scriba repository, make informed technical decisions, write the code, create database migrations, run tests, fix problems, and leave the project in a reproducible state.

Do not stop after producing a plan, mockup or documentation. Build the real application, using Meta's API for actual handwriting extraction.

---

# 1. Product mission

**Product:** Scriba

**Tagline:** Turning handwritten shop ledgers into checked digital accounts.

**Origin:** Cox's Bazar, Bangladesh.

## The problem

Many small shops in Bangladesh maintain handwritten khatas recording daily sales, customer credit, repayments, item quantities, rates and running balances. Their records are commonly written in Bangla, often with Bangla digits and inconsistent layouts.

Digitizing these records requires manual transcription, making it difficult for small businesses to maintain useful digital accounts.

## The solution

Scriba accepts a photograph of a handwritten ledger page or a small handwritten ledger snippet.

A Meta multimodal model interprets the image into structured candidate entries. Scriba preserves the source image and original Bangla transcription, normalizes numerical fields, and runs deterministic accounting checks.

The user reviews the interpreted entries beside the original handwriting, corrects mistakes, and explicitly confirms the result.

**Core principle: AI proposes. Code verifies. A human decides. Only approved entries become confirmed records in Scriba.**

Reconciliation is evidence of arithmetic consistency, not proof that the original handwriting was read correctly.

## What makes Scriba different

The core innovation is not simply recognizing Bangla handwriting.

It is combining:

1. Multimodal extraction of handwritten Bangla accounting information.
2. Preservation of the original text and photographic evidence.
3. Deterministic checks of quantities, amounts, totals and balances.
4. A human review workflow that exposes inconsistencies.
5. An evaluation method that measures how often incorrect amounts escape the checks.

The system must report its limitations honestly.

---

# 2. Critical architectural decision: Scriba is a completely separate product

**Do not connect Scriba to my existing private accounting application. Do not modify that application.**

My existing accounting product is in a private repository. Scriba must be developed independently so that I can publish its repository for hackathon judges without exposing the private application's source code, architecture, database, credentials, business logic or proprietary features.

## Public repository

Create and maintain a dedicated public GitHub repository named `scriba` or use the existing standalone Scriba repository if I have already created it.

The repository should contain only the Scriba application and its own required assets, migrations, tests and documentation.

It must be independently installable, testable and deployable.

**Repository isolation rules:**

- Never inspect, search, copy or import the private accounting application's source files.
- Do not access its repository history, database credentials, environment files or deployment configuration.
- Do not reuse its Supabase credentials or project.
- Do not create dependencies on its APIs or private packages.
- Do not reveal its schema, directory structure or implementation details.
- Do not attempt to locate the private repository on the machine.
- Do not create Git submodules or links to private source code.
- Do not reuse proprietary components without explicit permission.

If the current working directory is recognizably the private accounting project, make no modifications and tell me to open the dedicated Scriba repository before proceeding.

If the Scriba repository is empty, build the standalone application in it.

If the repository already contains Scriba code, inspect and extend it rather than replacing working code.

## Standalone product boundary

Scriba needs its own:

- Next.js application.
- TypeScript modules.
- Meta API integration.
- Supabase project.
- Supabase database schema and migrations.
- Supabase authentication and access policies.
- Private image storage.
- Extraction records.
- Review and confirmation workflow.
- Evaluation tools.
- Documentation and deployment configuration.

Confirmed records remain inside Scriba. **Do not implement any integration with the private accounting application's general ledger.**

For this MVP, "confirm" means approving an extracted entry and recording that approval in Scriba. It does not mean posting a transaction into another accounting system.

The implementation must be independently demonstrable without any access to my private product.

---

# 3. Technology stack and fixed infrastructure decisions

Use:

- Next.js App Router.
- TypeScript with strict type checking.
- Tailwind CSS.
- An appropriate accessible component system, preferably shadcn/ui if useful.
- Supabase Auth.
- Supabase PostgreSQL.
- Supabase Storage.
- Meta Model API.
- The smallest suitable test framework that supports the project's needs.

Reuse dependencies already present in the Scriba repository where reasonable.

Do not add an agent framework, custom-trained OCR model, vector database, separate backend framework or unnecessary infrastructure.

## Dedicated Supabase project

**A new, separate Supabase project is an explicit requirement, not an optional alternative.**

I will create a temporary Supabase project dedicated exclusively to Scriba.

Use this project for:

- Authentication.
- Original-image metadata.
- Private image storage.
- Extraction records.
- Extracted candidate entries.
- Validation findings.
- Review edits and confirmation history.
- Ground-truth annotations and benchmark results.

Do not reuse a Supabase project belonging to my existing accounting application.

Do not create a second Scriba Supabase project if the dedicated project already exists and is correctly configured.

### Temporary-project lifecycle

Treat this as a hackathon project that may be deleted after evaluation.

Nevertheless:

- Do not assume Supabase automatically deletes the project or its data.
- Provide reproducible migrations and setup instructions.
- Document which resources must be removed when the project is retired.
- Provide a safe manual cleanup checklist.
- Do not automatically delete the live database, storage bucket or project.
- Preserve any evaluation results I choose to retain before retirement.

The public Git repository must remain useful even after the temporary Supabase project is deleted.

---

# 4. Begin with repository reconnaissance

Before coding, inspect only the Scriba repository.

Determine:

- Current project structure.
- Framework and dependency versions.
- Package manager.
- Existing UI components.
- Available authentication and database integrations.
- Existing routes and server-side modules.
- Testing, linting and type-checking scripts.
- Existing deployment configuration.
- Missing infrastructure and setup requirements.

If the repository is empty, initialize the smallest appropriate standalone project.

Write a concise implementation plan and immediately proceed with implementation.

Do not spend excessive time writing plans before testing the critical Meta API integration.

If credentials are available, verify Meta API connectivity early. If they are not available, implement the actual integration and configuration path, run all offline tests, and document the missing live verification.

Never fabricate a successful API call.

Do not overwrite existing environment files, destroy data or run destructive database changes without a clear requirement.

---

# 5. Meta Model API integration

Use Meta's official Model API documentation:

- Model overview: https://dev.meta.ai/docs/overview
- Model versions: https://dev.meta.ai/docs/models
- Image understanding: https://dev.meta.ai/docs/image-understanding
- Pricing and rate limits: https://dev.meta.ai/docs/pricing

Read the current documentation for the exact features used.

## Default model configuration

Use the documented standard-mode Muse Spark 1.3 model unless current documentation or observed compatibility requires a different supported choice.

```dotenv
META_MODEL_API_KEY=
META_MODEL_ID=muse-spark-1.3

SCRIBA_MAX_UPLOAD_BYTES=8388608
SCRIBA_MAX_OUTPUT_TOKENS=1800
```

These are proposed defaults, not guarantees about provider limits. Check the actual API constraints before implementation.

Use the current documented base URL:

`https://api.meta.ai/v1`

Use the currently documented authentication method and an officially compatible SDK interface.

Prefer the Responses API if it provides the clearest supported implementation for image input and structured responses. Another documented endpoint may be used if it better supports the required schema and has been verified against the official documentation.

Do not assume that JSON Schema constraints, image formats, token-limit parameters or reasoning controls work identically across API endpoints.

Test the actual chosen protocol.

Keep the model ID and relevant parameters configurable server-side.

Claude Code must not use its own AI service or a different paid AI service at runtime. Meta's API is the extraction engine.

## Standard mode and data-use policy

Default to `muse-spark-1.3`, which is the documented standard-mode model ID.

Do not silently switch to `muse-spark-1.3-contributor` to save money. Contributor mode permits submitted content to be used for future model training.

Do not change the model mode without my explicit decision.

For any real shop ledger data introduced later, consider consent, data minimization and the provider's applicable data policies before sending images to the model.

## Keep API integration isolated

Create a small, dedicated server-side module responsible for:

- API configuration.
- Image input construction.
- Prompt and schema versioning.
- Request execution.
- Response parsing.
- Usage metadata extraction.
- Error normalization.
- Request timing.

Do not call the Meta API directly from React components.

Never expose the Meta API key to the browser.

Avoid unnecessary abstractions and duplicated API clients.

---

# 6. API credit conservation is a mandatory requirement

I have limited API credits. The architecture must minimize unnecessary requests from the very beginning.

**Default behavior: one explicit extraction request per new image.**

A single request should analyze the uploaded snippet or page and return the proposed page structure and entries together, within the chosen output budget.

Do not make one model call per line.

Do not run a second model call for arithmetic checks.

Do not automatically ask the model to critique or repair its own response.

Do not introduce multi-agent orchestration or model chains.

Do not call an AI model when TypeScript can perform the operation deterministically.

## Request workflow

1. The user uploads an image.
2. Scriba validates and stores its original bytes.
3. The user explicitly clicks **Analyze handwriting**.
4. The server checks for an existing compatible successful extraction.
5. If a cached result exists, reuse it without calling Meta.
6. Otherwise, send one API request.
7. Parse and validate the response.
8. Run local arithmetic and consistency checks.
9. Persist the results.
10. Show the editable review interface.

Opening an existing draft must never trigger a model call.

Editing an extracted amount must never trigger a model call.

Re-running local validation must never trigger a model call.

Changing a review filter must never trigger a model call.

## Caching

Create a deterministic extraction cache key based on:

- Authenticated user or appropriately scoped ownership.
- Original-image SHA-256.
- Model ID.
- Extraction prompt version.
- Schema version.
- Processing mode.

Only reuse cached results when all relevant parameters match.

Scope cached records so that one user's image or extraction is never exposed to another user.

Keep the original AI result immutable. Store subsequent human corrections separately or in a distinct review layer, with an audit trail.

If the user explicitly requests a fresh extraction, create a new run and preserve the previous run for comparison.

## Prevent duplicate calls

Implement:

- Disabled buttons during an in-flight request.
- Server-side protection against concurrent extraction of the same image under the same cache key.
- A stable request identifier.
- Database constraints where suitable.
- Explicit retry actions.
- No automatic SDK or application retry loops for paid model calls.

If a request times out after it may have reached Meta, explain the uncertainty. Do not immediately issue another request automatically.

A fresh request may consume additional credits.

## Bound output and input

Use a concise, stable extraction prompt.

Only request fields required by the application.

Do not ask for verbose reasoning, chain-of-thought output or narrative explanations.

Use a documented low reasoning-effort setting if appropriate and compatible with the chosen endpoint.

Use a bounded output token budget. The suggested default is 1,800 tokens, but adjust it only after inspecting actual output sizes and testing whether required entries are truncated.

Do not truncate valid entries silently. If the model response is incomplete or invalid, preserve the result for diagnosis and require deliberate retry or correction.

## Cost and usage visibility

Track, wherever the provider exposes the information:

- API requests.
- Success and failure counts.
- Input and output token usage.
- Elapsed time.
- Cache hits.
- Model ID.
- Prompt and schema versions.
- Processing mode.
- Estimated cost where supported by reliable published pricing and usage details.

Do not invent image-token counts or pretend the estimated cost is exact when the provider does not expose the necessary usage data.

Use the latest published official pricing rather than hardcoding assumptions into multiple parts of the application.

Do not call the real API in ordinary unit tests, linting, builds or every evaluation run.

---

# 7. Photograph handling: original images are immutable

My initial data consists of photographs of five small handwritten Bangla ledger snippets written by me.

The inputs may be snippets rather than full khata pages. Scriba must support both.

**The source of truth is the exact photograph uploaded by the user.**

For this MVP, the uploaded snippet itself is the original image. Do not require a full-page photograph.

## Original-image requirements

- Preserve exact uploaded bytes.
- Calculate SHA-256 for each original.
- Record file size, MIME type, dimensions, checksum, timestamp and owner.
- Reject unsupported file types and corrupt images.
- Enforce documented API-compatible image limits and sensible upload limits.
- Keep the original image private.
- Do not recompress, deskew, rotate, crop or resize the stored original.
- Do not upload private photographs to a public Git repository.
- Do not store originals in `public/`.
- Do not send an image to Meta until the user explicitly initiates extraction.
- Maintain the relationship between the source image, extraction runs, candidate entries and human corrections.

For the initial baseline test, send the original uploaded photograph directly to Meta using the documented image-input format, such as a base64 data URL when appropriate.

Do not apply image preprocessing before the baseline analysis.

Do not silently change the input dimensions in the baseline mode.

## Separate private test data from the public repository

Keep original handwritten photographs and associated private ground-truth files in a Git-ignored local directory or private storage.

Suggested local directory:

`private-test-data/ledger-snippets/`

Add this directory to `.gitignore`.

Also exclude:

- `.env` files and secrets.
- Local credentials.
- Raw private model responses.
- Private photographs.
- Private ground-truth annotation files.
- Local datasets containing user or shop information.
- Temporary benchmark exports containing sensitive content.

The public repository may contain synthetic text-only test cases, schemas, code, migrations and anonymized methodology. It must not contain my original handwritten images by default.

If I deliberately ask to publish a particular test image later, require explicit action and make the change visible.

## Optional derivatives and crop previews

After the original-image baseline works, an optional economy mode may produce a smaller analysis derivative.

If implemented:

- Preserve the original bytes unchanged.
- Store or identify the derivative separately.
- Record its dimensions, transformation settings and checksum.
- Identify the mode in evaluation records.
- Never mix baseline and derivative results without labelling them.

For display, show the entire original photograph by default. Cropped regions may be shown when their coordinates are reliable.

Never invent source coordinates. If the model cannot locate the exact line reliably, display the full image alongside the extracted text.

A missing crop must not block the MVP.

---

# 8. Supabase architecture and security

Use the dedicated Scriba Supabase project.

Official references:

- Supabase security: https://supabase.com/docs/guides/database/secure-data
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Storage access control: https://supabase.com/docs/guides/storage/security/access-control

## Authentication

Use Supabase Auth for the standalone application.

Implement the simplest suitable authentication flow, such as email/password or a documented passwordless option.

For a public deployment, require authentication before users can access private photographs, extraction results, ground-truth annotations or evaluation history.

Do not make the upload and extraction endpoints anonymously usable without a deliberate, documented security design.

## Keys

Use the current Supabase publishable key in browser code where appropriate and only with correctly configured access policies.

Keep any Supabase secret key server-side.

Keep the Meta API key server-side.

Never commit real credentials.

Provide a safe `.env.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_SECRET_KEY=

META_MODEL_API_KEY=
META_MODEL_ID=muse-spark-1.3

SCRIBA_MAX_UPLOAD_BYTES=8388608
SCRIBA_MAX_OUTPUT_TOKENS=1800
```

Only use `SUPABASE_SECRET_KEY` if a documented server-side operation actually requires it. Prefer user-scoped server-side operations that respect RLS wherever practical.

Do not expose a Supabase secret or service-role key to client components.

## Database design

Inspect the Scriba project before creating migrations.

Implement a minimal, additive schema with clear ownership and lifecycle states. Adapt names and exact field types to the existing Scriba codebase.

The schema should support the following entities, or equivalent designs:

### `ledger_documents`

Metadata for original photographs:

- ID.
- Owner ID.
- Private storage path.
- SHA-256.
- Original filename where appropriate.
- MIME type.
- File size.
- Image dimensions.
- Upload timestamp.
- Current processing status.
- Optional dataset label.
- Retention status.

### `extraction_runs`

One record per actual Meta extraction attempt:

- ID.
- Document ID.
- Owner ID.
- Model ID.
- Extraction prompt version.
- Schema version.
- Processing mode.
- Request status.
- Started and completed timestamps.
- Elapsed time.
- Available input/output usage.
- Error category.
- Structured result or a reference to the normalized output.
- Cache key and cache metadata where appropriate.

Record real attempts, including failed attempts. Never fabricate successful requests.

### `extracted_entries`

Normalized candidate entries associated with one extraction:

- ID.
- Extraction run ID.
- Source line order.
- Raw Bangla text.
- Transaction type.
- Customer alias.
- Item name.
- Quantity and unit.
- Unit rate.
- Amount as written.
- Normalized amount.
- Recorded balance.
- Source coordinates when available.
- Uncertainty fields.
- Review status.

### `validation_findings`

Persistent results from deterministic checks:

- ID.
- Extraction run ID.
- Affected entry IDs.
- Rule ID and version.
- Pass, fail or unverifiable status.
- Expected and observed values.
- Severity.
- Explanation.
- Timestamp.

### `review_events`

Audit history for human corrections and decisions:

- ID.
- Owner ID.
- Document or extraction reference.
- Entry reference where applicable.
- Previous and updated values where appropriate.
- Action type.
- Timestamp.
- Confirmation decision.

Do not store unnecessary sensitive information in audit messages.

### Evaluation records

Implement minimal separate entities or equivalent versioned structures for:

- Ground-truth annotations.
- Evaluation runs.
- Per-field comparisons.
- Metric summaries.

Keep ground truth private and separate from extraction output.

Avoid redundant tables if a simpler normalized design fully satisfies the requirements.

## Row Level Security

Enable and test RLS on every exposed user-owned table.

Policies must restrict rows to the authenticated owner.

Ensure database grants and policies are compatible with the intended queries.

For private Storage, implement explicit policies that allow authenticated users to access only their own objects.

Storage access rules are separate from application-table RLS; configure and test both.

Use server-side authorization in addition to UI visibility.

Do not assume hiding a button makes an API route secure.

Avoid using a service key to bypass RLS for ordinary user operations.

If privileged server-side operations are needed, verify ownership and authorization before acting.

## Storage

Create a dedicated private bucket, for example:

`scriba-originals`

Use unique, non-guessable object paths scoped to authenticated user IDs.

Do not use public buckets or permanent public URLs.

Preserve original uploaded bytes in storage without transformations.

Test upload, retrieval, authorization and deletion.

Do not create a second bucket or redundant backend without a reason.

---

# 9. Handwriting extraction schema

Create a versioned extraction module separating:

- API transport.
- Model prompt.
- JSON Schema.
- TypeScript types.
- Response parsing.
- Bengali digit normalization.
- Accounting validation.

The model must interpret only what is visible in the photograph.

It must not fill in missing values merely to create a mathematically complete ledger.

## Required behavior

The model should:

- Read handwritten Bangla and Bangla digits.
- Handle Arabic digits and mixed numeral styles.
- Recognize customer identifiers and item descriptions when legible.
- Identify transaction types when supported by the source.
- Extract quantities, units, unit rates and written amounts.
- Preserve the source text in Bangla.
- Separate raw text from normalized values.
- Identify uncertain or unreadable fields.
- Represent genuinely unknown values as `null`.
- Distinguish a written total from a transaction.
- Avoid inventing names, dates, quantities, units, amounts and balances.
- Preserve corrections and crossed-out text where they affect interpretation.
- Avoid inferring a date or currency value when it is not supported by the photograph.

## Page-level fields

Include:

- Schema version.
- Source document identifier.
- Raw date text.
- Normalized date when confidently interpretable.
- Ledger type.
- Opening balance when explicitly visible.
- Closing balance when explicitly visible.
- Entries.
- Written subtotals and totals.
- Page-level uncertainty indicators.
- Extraction warnings.

## Entry-level fields

At minimum:

- Stable candidate identifier.
- Line order.
- `source_text`.
- Transaction type.
- Customer identifier or alias.
- Item name.
- Quantity.
- Unit.
- Unit rate.
- Amount as written.
- Normalized amount.
- Recorded balance.
- Optional source bounding box.
- Fields requiring review.
- Brief uncertainty reason.

Use a controlled transaction-type enumeration:

- `credit_sale`
- `cash_sale`
- `repayment`
- `opening_balance`
- `closing_balance`
- `subtotal`
- `adjustment`
- `unknown`

Do not force an unsupported interpretation into a specific type.

Do not interpret a missing amount as zero.

Do not automatically classify an uncertain entry as a credit sale.

## Bangla digit normalization

Implement a deterministic normalization helper for:

`০১২৩৪৫৬৭৮৯`

Support mixed Bangla and Arabic digits.

Test commas, separators, decimal notation and malformed numbers.

Preserve the source text independently from the normalized number.

Use integer poisha or a suitable precise decimal representation for calculations. Avoid floating-point errors in money calculations.

If the handwritten value is ambiguous, show the original text and require a human to resolve it.

## Structured output

Use the response format officially supported by the chosen Meta endpoint.

If constrained JSON output is supported for the selected endpoint, configure the appropriate JSON Schema.

Also validate every response against the local schema. API-side schema constraints are not a substitute for application-side validation.

Handle malformed or incomplete responses safely.

If output is truncated or a required field is missing, do not invent a value or silently claim extraction succeeded.

Do not require perfect line-coordinate localization for the MVP.

---

# 10. Deterministic validation engine

Build a pure TypeScript validation engine with no Meta dependency.

It must accept a parsed candidate extraction and return structured findings. All checks should run locally and must not trigger another API request.

## Rule A: Quantity × rate

Where the line contains a usable quantity, unit rate and written amount:

Calculate the expected amount and compare it with the written amount.

Flag mismatches.

Do not silently overwrite the written amount.

Do not run the calculation if units or required fields are unclear.

## Rule B: Opening and closing balances

Where the account convention is known and all required values are present:

`Expected closing balance = opening balance + signed transactions`

For a conventional customer-credit account:

- Credit sales increase the customer's outstanding balance.
- Repayments decrease it.

Do not assume every ledger uses this convention. When the convention is unknown, return `unverifiable`.

Exclude opening balances, closing balances and subtotal rows from transaction sums.

## Rule C: Written totals

Where an explicit subtotal or total is visible, compare it against the applicable line amounts.

Ensure that the correct rows belong to that total.

Do not sum unrelated entries from the same photograph.

## Rule D: Running balances

Where consecutive balances and transaction signs are available, verify the calculated next balance.

Flag discontinuities.

## Rule E: Cross-record continuity

Only compare closing and opening balances if the records are explicitly linked to the same account and their ordering is known.

Do not infer continuity merely because two images contain similar customer names.

## Validation result

Each result must include:

- Rule ID and version.
- Status: `pass`, `fail` or `unverifiable`.
- Affected entry identifiers.
- Expected and observed values, where available.
- Short explanation.
- Review severity.

An unavailable check must never be represented as passing.

A passing arithmetic check does not prove that the source handwriting was read correctly.

Do not invent balancing entries, change amounts automatically or suppress a mismatch to make the ledger appear valid.

Implement automated unit tests for the validation functions independently of Meta and Supabase.

---

# 11. Human review and confirmation workflow

Build the actual workflow, not a static demo.

## Step 1: Authenticate

The user signs in to their Scriba account.

Unauthenticated users must not access private account history or images.

## Step 2: Upload a snippet or page

Accept a single photograph at a time.

Support small handwritten snippets and complete pages.

Show the original preview, file size, upload progress and resulting document status.

Do not require a full ledger page when the user has uploaded a deliberately cropped snippet.

## Step 3: Explicitly analyze

The user clicks **Analyze handwriting**.

Only then does Scriba make the Meta API request, unless a compatible successful extraction already exists.

Show the request state and prevent duplicate submissions.

## Step 4: Review the extraction

Display a side-by-side layout on desktop and an appropriate stacked layout on mobile.

Show:

- Original photograph.
- Extracted Bangla text.
- Normalized transaction fields.
- Amounts and calculations.
- Customer or item information.
- Validation findings.
- Uncertain or missing fields.
- Source crop when coordinates are reliable.

Use the whole photograph as the fallback when precise line localization is unavailable.

## Step 5: Correct

Permit editing candidate values and transaction classifications.

Recalculate affected validation rules immediately in TypeScript.

Edits must never trigger a paid API request.

Show which validation results changed after an edit.

Keep a history of corrections without overwriting the original extraction.

## Step 6: Confirm

Allow the user to approve entries after review.

Make unresolved errors and unverifiable fields visible.

Require explicit acknowledgment when the user chooses to accept an unresolved warning, subject to the defined safety rules.

Support deliberate entry-level or page-level approval without accidentally approving unrelated entries.

A user must never be misled into believing that Scriba guarantees an entry is correct simply because it passes the arithmetic checks.

## Step 7: Record within Scriba

Persist confirmed entries as approved Scriba records.

Maintain a traceable relationship between each record and:

- Original image.
- Extraction run.
- Extracted candidate.
- Human corrections.
- Validation results.
- Confirmation event.

Do not send records to my existing accounting application.

Do not present a Scriba confirmation as a completed double-entry journal posting.

If the application later needs true accounting integration, that is a separate project and is outside this MVP.

---

# 12. First test dataset: my own handwriting

My initial handwritten dataset will consist of five original photographs of small ledger snippets.

The five examples have the following purposes.

### Sample 1: Simple customer account

Expected values:

- Opening balance: ৳1,000.
- Credit sale: 2 kg × ৳60 = ৳120.
- Credit sale: 1 item × ৳50 = ৳50.
- Total new credit: ৳170.
- Repayment: ৳200.
- Expected closing balance: ৳970.

### Sample 2: Multiple items and repayment

Expected values:

- Opening balance: ৳450.
- Sugar: 3 kg × ৳120 = ৳360.
- Oil: 2 litres × ৳180 = ৳360.
- Total new credit: ৳720.
- Repayment: ৳500.
- Expected closing balance: ৳670.

### Sample 3: Cash sales

Expected values:

- Eggs: 12 × ৳12 = ৳144.
- Bread: 8 × ৳15 = ৳120.
- Milk: 4 × ৳40 = ৳160.
- Expected cash sales total: ৳424.

### Sample 4: Intentionally inconsistent written total

Expected values:

- Opening balance: ৳800.
- Rice: 3 kg × ৳60 = ৳180.
- Lentils: 1 kg × ৳140 = ৳140.
- Correct total from item amounts: ৳320.
- Intentionally incorrect written subtotal: ৳310.
- Repayment: ৳100.
- Expected closing balance using the item amounts: ৳1,020.

The written subtotal must remain `310` in the ground truth. Do not silently repair it to `320`. Scriba should flag the mismatch while recognizing that the item values and closing balance are mutually consistent.

### Sample 5: Mixed Bengali and Arabic digits

Expected values:

- Opening balance: ৳560.
- Sugar: 2 kg × ৳85 = ৳170.
- Biscuits: 5 packs × ৳20 = ৳100.
- Total new credit: ৳270.
- Repayment: ৳100.
- Expected closing balance: ৳730.

Use these expectations to construct independent arithmetic unit tests and ground-truth annotation templates.

Do not assume that the model has correctly extracted a sample merely because the expected values are known.

The original handwritten photographs must be uploaded and evaluated independently.

## Original-photo evaluation protocol

For every image:

1. Preserve the original bytes.
2. Record its SHA-256 checksum.
3. Manually verify its intended transcription.
4. Upload and analyze the original photograph.
5. Compare the extraction with the ground truth.
6. Run deterministic validation.
7. Record all incorrect fields and missed warnings.
8. Store the evaluation outcome.
9. Do not reprocess old results silently.

Ground truth must be established independently of the model's output.

Do not ask the AI to certify its own answers.

My handwriting samples are a development dataset. They cannot prove generalization to other writers.

Later, samples from other writers will be introduced to evaluate generalization. Keep those samples held out from prompt tuning until the evaluation is ready.

Do not claim that a held-out evaluation has occurred before an actual held-out dataset exists.

---

# 13. Evaluation metrics

Create a functional evaluation interface that reports real measured values and their denominators.

## Field accuracy

Exact correctness of normalized, labelled fields.

Define which fields are included and how unreadable or genuinely absent values are scored.

## Exact amount accuracy

Number of correctly extracted labelled amounts divided by the number of labelled amounts evaluated.

Show both numerator and denominator.

## Wrong-amount escape rate

Incorrect extracted amounts that pass all applicable validation rules and remain unflagged, divided by the incorrect extracted amounts for which those rules can be evaluated.

Show raw counts.

## Error rate among accepted amounts

Incorrect unflagged amounts divided by all accepted, unflagged amounts.

If the denominator is zero, report `N/A`, not zero percent.

## Review rate

Percentage of extracted entries requiring human review because of uncertainty, missing required information or failed checks.

## False-alarm rate

Percentage of correctly interpreted entries incorrectly flagged by the validation or uncertainty rules.

## Time per page

Compare manual transcription time with total assisted workflow time.

Assisted time includes:

- Upload.
- Model wait.
- Review.
- Correction.
- Confirmation.

Measure human effort and machine wait separately when feasible.

Do not claim time savings from response time alone.

## API usage

Report request count, available token usage, elapsed time, cache hits and estimated cost where supported.

## Reproducibility

Each benchmark result must identify:

- Dataset and sample ID.
- Original image checksum.
- Model ID.
- Processing mode.
- Prompt version.
- Schema version.
- Validator version.
- Ground-truth version.
- Evaluation timestamp.

Do not silently overwrite historical benchmark results when the prompt or validator changes.

Small samples must be clearly labelled as exploratory. Do not suggest that the first five images establish reliable performance across Bangladesh.

---

# 14. Public-repository and secret-management rules

The Scriba repository will be public.

Keep only source code, non-sensitive configuration templates, migrations, tests, documentation and intentionally public assets in Git.

Never commit:

- Meta API keys.
- Supabase secret or service-role keys.
- `.env.local`.
- Actual handwritten test photographs.
- Private ground-truth annotation files.
- Supabase backups.
- Real customer ledgers.
- Database dumps containing user data.
- Private API responses containing sensitive records.

Create an appropriate `.gitignore` before importing or adding local data.

Use environment variables in local development and deployment configuration.

Before each public commit, inspect staged files and verify that no secret or private image has been included.

Do not rely on deleting a secret in a later commit if it has already entered Git history. If a secret is exposed, report the problem and rotate it.

Include a safe `.env.example` containing placeholders only.

Provide a documented way to run the app after creating a new dedicated Supabase project.

---

# 15. Security, reliability and privacy

Implement:

- Authentication.
- Object-level authorization.
- Database RLS.
- Private Storage policies.
- File-type and image-decoding validation.
- Upload-size and image-dimension limits.
- Server-side API key handling.
- Duplicate-request prevention.
- Explicit paid-operation initiation.
- Rate limiting appropriate to the deployment.
- Safe and concise error handling.
- Audit history for corrections and approval.
- Secure handling of deletion and retention.
- No unnecessary logging of photographs, customer names or amounts.

Never expose raw stack traces, provider credentials or private storage paths unnecessarily.

Do not let anonymous users trigger unlimited paid requests.

Do not trust client-supplied owner IDs or confirmation status.

Never treat UI-only authorization as security.

If an extraction fails, preserve the original image and display a useful error.

If saving a confirmation fails, do not report success.

If a database write partially fails, use an appropriate transaction or idempotent recovery strategy. Document any remaining limitation.

For the hackathon, synthetic transactions written by me are the default. If real shop data is introduced later, obtain appropriate consent and minimize sensitive information before external model processing.

---

# 16. User experience

Create a polished, responsive product suitable for a short live demonstration.

The visual design should be clear and restrained, using:

- Bangla-compatible typography.
- Strong text contrast.
- An easy-to-understand upload screen.
- A faithful photograph preview.
- Readable extracted transaction rows.
- Visible expected and observed amounts.
- Clear warning and unverifiable states.
- Accessible controls.
- A useful mobile layout.

Avoid fake customer dashboards, fabricated analytics, excessive animation and unnecessary functionality.

The primary workflow should be obvious:

**Upload → Analyze → Review → Correct → Validate → Confirm.**

Include clear language explaining that AI readings can be wrong.

Build only the pages needed for this MVP:

- Authentication.
- Dashboard or recent documents.
- Upload.
- Extraction and review.
- Confirmed records.
- Evaluation and usage summary.
- Basic settings or configuration guidance.

Do not build a complete accounting system.

---

# 17. Implementation phases

Work sequentially and preserve a working repository.

## Phase 0 — Standalone project foundation

Verify that the current working repository is the independent Scriba repository.

Confirm that it has no dependency on the private accounting app.

Establish:

- Project configuration.
- Environment templates.
- `.gitignore`.
- Basic application structure.
- Documentation and task checklist.

Do not spend time restyling a working design system unnecessarily.

## Phase 1 — Supabase setup and connectivity

Implement the dedicated Supabase project configuration.

Create migrations, authentication integration, the private storage bucket configuration and RLS policies.

Test that an authenticated user can access their own data and cannot access another user's data.

Document all required environment variables.

## Phase 2 — Meta API proof of concept

Before building the full workflow, test a single actual handwritten image through the chosen documented Meta API endpoint if credentials are available.

Verify:

- Image input.
- Model selection.
- Structured response.
- Parsing.
- Usage metadata.
- Error behavior.

Do not perform repeated live calls while debugging unrelated UI code.

If a live test cannot be run, clearly record the blocker and continue with mocked-response tests.

## Phase 3 — Original image upload and storage

Implement secure upload and immutable original storage.

Verify checksums before and after storage retrieval.

Ensure the original is not transformed.

Build an image preview and a reliable document record.

## Phase 4 — Extraction pipeline

Implement the versioned prompt, response schema, actual API integration, parsing, caching, usage tracking and explicit retry behavior.

Prove the end-to-end pipeline with one of my own handwritten photographs.

Do not fabricate output.

## Phase 5 — Validation engine

Implement deterministic arithmetic and balance checks with comprehensive unit tests.

Test the intentionally inconsistent subtotal case.

Make the engine work entirely offline after extraction.

## Phase 6 — Human review and confirmation

Build the editable review interface.

Implement local recalculation, source evidence, audit history and explicit confirmation of entries within Scriba.

Verify that no extraction occurs merely because an entry is edited.

## Phase 7 — Evaluation and credit controls

Implement private ground-truth annotations, metric calculations, benchmark tracking, request usage and cache statistics.

Evaluate my own original photographs without claiming generalization to other writers.

## Phase 8 — Hardening and demo preparation

Run tests, linting, type checking, production build and relevant security checks.

Fix discovered errors.

Verify the full workflow from photograph upload to confirmed record.

Prepare deployment instructions and a repeatable demo script.

Do not mark a phase complete until its acceptance criteria have actually been checked.

If a dependency or credential blocks one feature, implement and test the remaining independent features.

---

# 18. Testing requirements

Use mocked API responses for ordinary automated tests.

A live Meta API test must be explicitly invoked and must not run automatically during every build or test suite.

Cover the following.

### Extraction

- Valid response.
- Invalid or malformed response.
- Missing and null fields.
- Unsupported transaction types.
- Mixed Bangla and Arabic digits.
- Malformed numeric values.
- Missing source coordinates.
- Invalid source coordinates.
- Truncated or incomplete output.

### Validation

- Correct quantity × rate.
- Incorrect quantity × rate.
- Correct written subtotal.
- Incorrect written subtotal.
- Correct running balance.
- Incorrect running balance.
- Missing opening or closing balance.
- Unknown transaction type.
- Subtotal rows excluded from transaction calculations.
- Unverifiable relationships reported as unverifiable rather than pass.

### Upload and image integrity

- Supported image.
- Unsupported file.
- Corrupt image.
- Oversized upload.
- Checksum consistency.
- Private image retrieval.
- Unauthorized file retrieval.
- Original image bytes unchanged.

### Credit control

- Successful cached result reused.
- Editing a row causes zero new model calls.
- Revalidating a row causes zero new model calls.
- Double-clicking Analyze does not cause duplicate requests.
- A failed request does not trigger an automatic paid retry.
- Explicit reanalysis records a new run.
- Reopening a document does not trigger extraction.

### Approval workflow

- Unconfirmed entries remain drafts.
- Corrections are recorded.
- Validation updates after edits.
- A successful confirmation creates a Scriba record.
- Failed persistence does not report confirmation success.
- User A cannot retrieve User B's records.

### Deployment

- Type checking.
- Linting.
- Production build.
- Database migration checks where available.
- Appropriate RLS and Storage policy checks.

Do not add live API calls to ordinary automated tests.

---

# 19. Hackathon acceptance criteria

The MVP is complete only when the following are verified:

- Scriba is a separate application in its own public repository.
- No private accounting application code or credentials are exposed.
- It uses a dedicated Supabase project.
- Original handwritten photographs are private and immutable.
- The application accepts small handwritten snippets as well as full pages.
- A user can explicitly initiate real Meta-powered extraction.
- The output is structured, parsed and validated.
- Raw Bangla text is preserved.
- Bangla numerals are normalized without losing the source text.
- Arithmetic inconsistencies are detected by code.
- Missing evidence is marked unverifiable, not passed.
- A reviewer can correct candidate entries.
- Corrections cause no additional API call.
- Confirmation is explicit and applies only within Scriba.
- API usage and available cost metrics are observable.
- Original-photo evaluation can be compared against independent ground truth.
- Private test photographs are excluded from the public repository.
- Automated tests and production build succeed.
- Security controls have been meaningfully tested.
- The application can be deployed independently.
- Limitations and outstanding defects are documented honestly.

Do not claim that the model accurately reads handwritten Bangla until the evaluation evidence supports that claim.

---

# 20. Hackathon demonstration

Prepare a reliable two-to-three-minute walkthrough.

Show:

1. One of my original handwritten snippets.
2. Explicitly initiating a real Meta API extraction.
3. The extracted Bangla text and structured candidate entries.
4. Validation results beside the extracted values.
5. The intentionally inconsistent written subtotal from Sample 4, if the extraction reads it correctly.
6. A human correction or acknowledgment.
7. The recalculated validation result.
8. Explicit confirmation into Scriba's own records.
9. Actual API usage and evaluation statistics.
10. At least one current limitation.

The intentionally incorrect subtotal must not be silently corrected by the application.

If the model itself misreads the subtotal, report the extraction error honestly. Do not modify a live result merely to manufacture a successful demonstration.

Record a backup video in case the live API is unavailable.

The README should explain the problem, architecture, installation, Meta API configuration, Supabase setup, test commands, privacy, evaluation methodology and known limitations.

Do not fabricate accuracy percentages, latency values, cost savings or field-test outcomes.

Do not present my controlled handwritten samples as real shop data.

---

# 21. Context and handoff management

Maintain these documents incrementally:

- `README.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_AND_SCHEMA.md`
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/EVALUATION.md`
- `docs/HANDOFF.md`
- `docs/DEMO_SCRIPT.md`

Update them as the implementation progresses. Do not delay the working product to write excessive documentation.

After each meaningful phase, record:

- Implemented functionality.
- Changed files.
- Database migrations.
- Tests executed and actual results.
- API access blockers.
- Remaining defects.
- The next concrete action.

`HANDOFF.md` must let a fresh Claude Code session continue from the first incomplete task without rediscovering the entire repository.

Do not claim that tests passed if they were not run.

Do not claim a live API integration works if it has only been mocked.

Do not recreate working features or rerun paid evaluations unnecessarily.

If the session must end because context is becoming insufficient, complete a safe checkpoint and update the handoff document.

---

# 22. Immediate execution instructions

Begin now.

1. Verify that the current repository is the standalone Scriba repository. Do not access the private accounting project.
2. Inspect the Scriba code and environment.
3. Establish the dedicated Supabase integration and secure data boundaries.
4. Verify the current Meta API documentation and credentials.
5. Run one minimal live extraction against an original handwritten photograph if one is accessible and credentials are available.
6. Build the upload, extraction, validation, review and confirmation workflow.
7. Add the usage controls and private evaluation features.
8. Run tests and fix errors.
9. Document actual results and remaining limitations.

Do not ask me to provide information that is already available in the repository or current official documentation.

If I have not yet configured credentials or uploaded my photographs, implement the real configuration and upload paths, complete the offline work, and clearly report what requires my input.

Do not fabricate credentials, API results or successful tests.

Choose the simplest secure architecture that meets the requirements.

**Final objective:** Deliver an independently deployable Scriba MVP that demonstrates whether original photographs of my handwritten Bangla ledger snippets can be transformed into structured accounting candidates, whether deterministic validation catches inconsistencies, how frequently errors escape those checks in the available test data, how much review remains necessary, and whether a human can safely approve the resulting records—all without exposing my private accounting application or wasting Meta API credits.