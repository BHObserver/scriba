import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckBoard, type Fixture } from "./check-board";
import { parseModelResponse } from "@/lib/extraction/parse";
import { inspectImage } from "@/lib/images/inspect";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import type { ReviewRow } from "@/lib/review/state";

export const metadata = { title: "Kit · check flow" };

const STEPS = [
  "capture",
  "sending",
  "reading",
  "checking",
  "reveal",
  "nothing",
  "unread",
  "problem-unreadable",
  "problem-failed",
  "problem-busy",
  "problem-waiting",
  "problem-offline",
  "problem-notAllowed",
] as const;

const DATA = path.join(process.cwd(), "private-test-data");

/** The newest stored response for one test photo, read as the app would read a run. */
async function loadFixture(photo: string): Promise<Fixture | null> {
  try {
    const bytes = new Uint8Array(await readFile(path.join(DATA, "ledger-snippets", photo)));
    const inspection = inspectImage(bytes);
    if (!inspection.ok) return null;
    const names = (await readdir(path.join(DATA, "responses"))).filter((n) => n.startsWith(`${photo}.2026-`)).sort();
    const latest = names.at(-1);
    if (!latest) return null;
    const stored = JSON.parse(await readFile(path.join(DATA, "responses", latest), "utf8"));
    const parsed = parseModelResponse(stored.result.summary);
    if (!parsed.ok) return null;
    const { extraction } = parsed;
    const rows: ReviewRow[] = extraction.entries.map((e) => ({
      id: e.candidateId,
      extractedEntryId: null,
      lineOrder: e.line,
      values: e.values,
      reviewFields: e.reviewFields,
      status: "draft",
      version: 0,
      candidate: { candidateId: e.candidateId, values: e.values, bbox: e.bbox, reviewFields: e.reviewFields, uncertaintyReason: e.uncertaintyReason },
    }));
    return {
      photo: { src: `/kit/photo/${photo}`, width: inspection.width, height: inspection.height, turns: turnsForProcessingMode(stored.processingMode) },
      page: {
        values: { dateText: extraction.page.dateText, ledgerType: extraction.page.ledgerType, accountName: extraction.page.accountName },
        version: 0,
        reviewStartedAt: null,
      },
      rows,
      source: latest,
    };
  } catch {
    return null;
  }
}

/**
 * Development only: the check flow's screens on a stored reading of a private test photo (S04 by
 * default, `&photo=S01.jpg` for another), for screenshots without an account or a paid call.
 */
export default async function KitCheckPage({ searchParams }: PageProps<"/kit/check">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { step, photo } = await searchParams;
  const name = typeof photo === "string" && /^S\d{2}(-upright)?\.jpg$/.test(photo) ? photo : "S04.jpg";
  const current = STEPS.find((s) => s === step);
  if (!current) {
    return (
      <main className="app-main pad">
        <h1 className="t-title mt-6">Check flow</h1>
        <ul className="mt-4 grid gap-2">
          {STEPS.map((s) => (
            <li key={s}>
              <Link className="underline" href={`/kit/check?step=${s}`}>
                {s}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }
  const fixture = await loadFixture(name);
  if (!fixture) return <main className="app-main pad">No stored reading for {name} in private-test-data.</main>;
  return (
    <main className="app-main">
      <CheckBoard step={current} fixture={fixture} />
    </main>
  );
}
