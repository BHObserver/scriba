import Link from "next/link";

const STEPS = [
  ["Upload", "A photo of a khata page or a small snippet. The original is stored privately, byte for byte."],
  ["Analyze", "You choose when to send it. One request to Meta's Muse Spark model transcribes every line, keeping the Bangla text."],
  ["Verify", "Scriba's own code checks quantity × rate, written totals and balances. Anything it cannot check is marked, never passed."],
  ["Review & correct", "See each reading beside the handwriting. Corrections recalculate instantly and never call the model again."],
  ["Confirm", "Only lines you approve become Scriba records, with a full trail back to the photo, the reading and your edits."],
] as const;

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-16">
      <p className="text-sm font-medium text-accent">Built in Cox&apos;s Bazar, Bangladesh</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Scriba</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">
        Turning handwritten shop ledgers into checked digital accounts.
      </p>
      <p className="bn mt-2 text-lg text-ink-soft">হাতে লেখা খাতা থেকে যাচাই করা ডিজিটাল হিসাব।</p>

      <div className="mt-8 flex gap-3">
        <Link href="/login" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong">
          Sign in
        </Link>
        <Link href="/documents" className="rounded-md border border-rule bg-card px-4 py-2 text-sm font-medium hover:bg-paper">
          Open your documents
        </Link>
      </div>

      <section className="mt-14">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">AI proposes. Code verifies. A human decides.</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-lg border border-rule bg-card p-4">
              <p className="text-xs font-semibold text-accent">Step {i + 1}</p>
              <p className="mt-1 font-semibold">{title}</p>
              <p className="mt-1 text-sm text-ink-soft">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 rounded-lg border border-warn/30 bg-warn-bg p-4 text-sm">
        <p className="font-semibold">What Scriba does not claim</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
          <li>Arithmetic that adds up shows consistency, not that the handwriting was read correctly.</li>
          <li>Early results come from a small set of the author&apos;s own handwriting and are exploratory.</li>
          <li>A Scriba confirmation is a reviewed record, not an accounting journal posting.</li>
        </ul>
      </section>
    </main>
  );
}
