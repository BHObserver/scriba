# Scriba

**A shopkeeper photographs his handwritten khata. Scriba reads it, checks it, and keeps his books, in Bangla, on his phone.** Built in Cox's Bazar, Bangladesh, for the Meta Global AI Developer Hackathon (problem statement: *Build for Your World*).

- **Demo video (2:43):** https://youtu.be/4HPt28I7RlA
- **Live app:** https://scriba-one.vercel.app (phone-first, Bangla with an English switch). Sign-ups are closed; the judges' demo login is in the submission form.

Most small shops in Bangladesh keep their accounts in a handwritten *khata*: Bangla script and Bangla digits, the day's cash sales, customers' credit, payments to the company's sales representative (এস.আর), all on one page. Every night the owner adds it up with a calculator, and every night something doesn't add up. He never sees what he sold, who owes him, or what should be in the cash drawer.

> **AI reads. Code checks. He decides.** Meta's Muse Wonder reads the handwriting. Every sum, balance and total is worked out by code, never by the model. Nothing enters his books until he has seen it and agreed.

## What he does with it

1. **Photographs the page.** The camera finds the page on a cluttered counter, straightens it, and takes several pages in a row.
2. **Checks the numbers.** Every line is shown under a strip of his own handwriting, with what Scriba read beneath it. Figures the model wasn't sure of are marked, with its two or three readings to pick from. One tap fixes a figure, a word, a line's kind, or a part of the page (the day's sales, a customer's credit, a company's visit, with the company and its SR named).
3. **Answers only what code can't know.** "Is this Karim's account?", "Did he owe anything before this page?", "Pran's SR Selim came: you owed ৳3,200 before and paid ৳1,200, right?" Each question shows the lines it is about. He can answer by tapping, typing or speaking.
4. **Sees his day.** What should be in the drawer, sales (cash and credit apart), money out, a plain note, seven days of sales, and everyone who owes him. Every figure opens the handwritten lines behind it.
5. **Closes the day.** He counts the drawer; Scriba compares it with the books, and tomorrow starts from what he counted.
6. **Keeps the khata.** Each customer's and company's account with its handwritten lines, reminders shared with a picture of the unpaid lines, two spellings merged into one person, a misread name renamed, and a confirmed page reopened to fix it.
7. **Asks Scriba.** "How much does Rina owe?" in Bangla or English, typed or spoken. The answer is computed by code and shows the lines it came from.

## How Meta's models are used

| Model | What Scriba does with it |
|---|---|
| **Muse Wonder 1.0**, image understanding | One request per page reads the whole handwritten Bangla page: every line as written, its items, quantities, rates and amounts, and the **parts** of the page (day's sales, a customer's account, a company's visit, expenses) with their names. |
| Muse Wonder, **perception grounding** (0–1000 boxes) | Where each line is on the photo, so every figure is shown under its own handwriting. Code then puts each box on the actual row of ink (below). |
| Muse Wonder, **its own doubts** | The model lists the figures and words it isn't sure of, with alternative readings. Those are what he is asked to look at first. |
| Muse Wonder, **strict JSON Schema** (Responses API) | Typed lines with a fixed vocabulary of transaction kinds and explicit nulls. |
| Muse Wonder, **adapting to one writer** | His corrections on confirmed pages become short notes about his handwriting (e.g. how his ৩ and ৬ differ), sent with the next page. |
| Muse Wonder, **company memos** | A company's printed memo (challan) photographed with the page is read and matched to the visit's goods, so the prices come from the memo. |
| Muse Wonder, **Ask Scriba** | A question in Bangla or English is turned into a typed query (whose dues, which period, which item). The model never produces a number; code answers from his books. |
| **Muse Voice Transcribe** | Spoken answers on the question cards and spoken questions to Ask Scriba, in Bangla or English. |

Reasoning effort `low`, bounded output, `store: false`. The model is never asked to do arithmetic or to judge its own answer.

## What code does (no model calls)

- **Arithmetic:** Bangla and mixed digits to exact integer poisha; quantity × rate, written totals, running totals and each account's balance are checked. What can't be checked is shown as *not checkable*, never as passed.
- **Line boxes put on the writing:** the model's boxes drift on long pages (up to five lines low near the bottom). Code finds the rows of ink on the photo and matches the lines to them in order.
- **Parts split at his lines:** he draws a short stroke between parts; code finds the strokes and splits a part the model ran across.
- **Page finder:** straight-edge detection that works on his real counters (a laptop, files, white sheets as bright as the paper).
- **The books:** accounts and dues follow every customer and company across pages; a "before" written on a page that differs from the books becomes a visible adjustment; the day's drawer is opening cash + cash sales + repayments − purchases − payments − expenses.
- **Trust:** the database keeps the model's reading unchanged, audits every edit, checks versions on every save, and re-runs every check on the server before anything is confirmed. Row Level Security on every table; photos in private storage.

## Measured (exploratory: the author's own handwriting, $0 re-runs on stored readings)

| What | Result |
|---|---|
| Amounts read right, his 5 test pages (prompt with his handwriting notes vs without) | 53/58 vs 52/58; his ৩ no longer read as ৬ (one ৬ read as ৩) |
| A line's picture shows its own line | model's boxes 225/277 → put on the ink 276/277 (20 readings); 313/316 with his later pages |
| Page found on his photos | 7/13 → 13/13 |
| Parts split at his strokes (28 readings) | 10 splits, every one at a stroke he drew; none on pages without strokes |

These come from one writer's pages and say nothing yet about other writers. Method and scripts: [docs/EVALUATION.md](docs/EVALUATION.md), `scripts/measure-*.ts`.

## Built during the hackathon

Everything in this repository was written during the building period (27 Oct – 4 Nov 2026); the Git history begins on 29 Oct 2026. A Gemini-based HTML prototype was used privately only to check feasibility; none of its code is here. Development was AI-assisted: the brief is in [Master Prompt.md](Master%20Prompt.md), the plans in [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) and [docs/PLAN_V3.md](docs/PLAN_V3.md), and every working session's notes, measurements and decisions in [docs/sessions/](docs/sessions/). The video's story scenes are AI-generated stills (labelled in the video); every app scene is a real screen recording of the live app on a phone.

## Architecture

Next.js 16 (App Router, TypeScript strict, Tailwind 4) · Supabase Auth, Postgres (RLS on every table) and private Storage · Meta Model API via the OpenAI-compatible SDK · Bun for packages, scripts and tests · Vercel. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATA_AND_SCHEMA.md](docs/DATA_AND_SCHEMA.md).

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
bun run check       # typecheck, lint and 921 unit, engine and database-security tests; never calls Meta
bun run build
bun run live:extract <photo> [--dry-run]   # explicit live check: one paid request
bun run secrets:scan                       # before committing: no secrets or private images staged
```

The database tests run the real migrations in PGlite (Postgres in WebAssembly) and check owner isolation, anonymous denial, forged-write prevention, the immutable model reading, audited edits, version-checked confirmation and reopening, and storage policies.

## Credit discipline

One explicit request per photo; results cached by owner, image hash, model, prompt and schema version; duplicate clicks and parallel tabs de-duplicated in the server and by unique indexes; no automatic retries; per-user rate limits and an allow-list; a test fails the build if any module outside a short allow-list imports the Meta client.

## Privacy

Photos, ground truth and raw model responses never enter this public repository (`private-test-data/` is git-ignored). Originals are private to their owner and go to Meta only when he asks Scriba to read them. The ledger pages are the author's own handwriting with made-up transactions, not real shop data. See [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md).

## Limitations

- Measured on one writer's handwriting only.
- Some words are still misread (a unit, a name); he can fix most in place, but not yet the unit word. The open list is in [docs/AFTER_SUBMISSION.md](docs/AFTER_SUBMISSION.md).
- Spoken answers work end to end, but Bangla speech accuracy hasn't been measured yet.
- Pages are dated by what is written on them; Today shows the khata's last day until today's page is in.

## Video credits

Narration voice and sound effects generated by ElevenLabs. Music from Pixabay: "Sad Story" (alexgrohl) and "Inspiring Story" (nastelbom). Story stills generated with Gemini; the khata close-up is a real photo.

## License

MIT, see [LICENSE](LICENSE).
