import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckBoard, type Fixture, type KitMemo } from "./check-board";
import { karimBookFixture, karimFixture } from "./karim-fixture";
import { memoView } from "@/components/check/ask-memo";
import { pageValuesOf, parseModelResponse } from "@/lib/extraction/parse";
import { inspectImage } from "@/lib/images/inspect";
import { grayForSnap, snapExtraction } from "@/lib/images/snap-boxes";
import { turnsForProcessingMode } from "@/lib/images/orientation";
import { parseMemoResponse } from "@/lib/memo/parse";
import type { ReviewRow } from "@/lib/review/state";

export const metadata = { title: "Kit · check flow" };

const STEPS = [
  "capture",
  "sending",
  "reading",
  "checking",
  "reveal",
  "asks",
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

/**
 * S01–S04 are the line-ledger snippets; V01 and V02 (and their flattened pages) are the v3 pages
 * with blocks; P1–P5 are his five-page test (consented as test samples on 3 Nov).
 */
const PHOTO_RE = /^(S\d{2}(-upright)?|V\d{2}(\.flat)?|P\d|f[2-4]-P\d)\.jpg$/;
const folderOf = (photo: string) => (/^[VP]/.test(photo) ? "v3" : "ledger-snippets");

/** F2 fix 6: his pages and their stored readings, saved by scripts/fetch-pages.ts: f2 (4 Nov), f3 and f4 (5 Nov). */
async function loadF2(photo: string): Promise<{ bytes: Uint8Array; stored: { promptVersion: string; schemaVersion: string; processingMode: string; summary: Parameters<typeof parseModelResponse>[0] }; source: string } | null> {
  const set = photo.slice(0, 2);
  const page = photo.slice(3).replace(/\.jpg$/, "");
  const bytes = new Uint8Array(await readFile(path.join(DATA, set, `${page}.jpg`)));
  const j = JSON.parse(await readFile(path.join(DATA, set, `${page}.reading.private.json`), "utf8"));
  const summary = { status: "completed", incompleteReason: null, outputText: j.rawOutputText, refusal: null };
  return { bytes, stored: { promptVersion: j.promptVersion, schemaVersion: j.schemaVersion, processingMode: j.processingMode, summary }, source: `${set}/${page}` };
}
/** M01, M02: the synthetic company memos for V01 and V02 (U4). */
const MEMO_RE = /^M\d{2}\.jpg$/;

/**
 * The newest stored single-pass response for one test photo, read as the app would read a run:
 * since F2 fix 6 with its boxes put on the writing, as a reading is stored; `snap` false keeps
 * the model's boxes, as readings stored before it have them.
 */
async function loadFixture(photo: string, snap: boolean): Promise<Fixture | null> {
  try {
    let bytes: Uint8Array;
    let stored: { promptVersion: string; schemaVersion: string; processingMode: string; summary: Parameters<typeof parseModelResponse>[0] };
    let latest: string;
    if (/^f[2-4]-/.test(photo)) {
      const f2 = await loadF2(photo);
      if (!f2) return null;
      ({ bytes, stored, source: latest } = f2);
    } else {
      bytes = new Uint8Array(await readFile(path.join(DATA, folderOf(photo), photo)));
      const names = (await readdir(path.join(DATA, "responses"))).filter((n) => n.startsWith(`${photo}.2026-`) && !/\.(2pass|p6draft)/.test(n)).sort();
      const newest = names.at(-1);
      if (!newest) return null;
      latest = newest;
      const j = JSON.parse(await readFile(path.join(DATA, "responses", latest), "utf8"));
      stored = { promptVersion: j.promptVersion, schemaVersion: j.schemaVersion, processingMode: j.processingMode, summary: j.result.summary };
    }
    const inspection = inspectImage(bytes);
    if (!inspection.ok) return null;
    const parsed = parseModelResponse(stored.summary, { promptVersion: stored.promptVersion, schemaVersion: stored.schemaVersion });
    if (!parsed.ok) return null;
    // The stored responses are unturned pages, so the photo is the image the model saw.
    const extraction = snap ? snapExtraction(await grayForSnap(bytes), parsed.extraction).extraction : parsed.extraction;
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
      page: { values: pageValuesOf(extraction), version: 0, reviewStartedAt: null },
      rows,
      doubts: extraction.doubts ?? [],
      source: latest,
    };
  } catch {
    return null;
  }
}

/** The newest stored reading of a company memo photo (U4), as the check screen gets it with its page. */
async function loadMemo(photo: string): Promise<KitMemo | null> {
  try {
    const bytes = new Uint8Array(await readFile(path.join(DATA, "v3", photo)));
    const inspection = inspectImage(bytes);
    if (!inspection.ok) return null;
    const names = (await readdir(path.join(DATA, "responses"))).filter((n) => n.startsWith(`${photo}.2026-`) && n.endsWith(".memo.private.json")).sort();
    const latest = names.at(-1);
    if (!latest) return null;
    const stored = JSON.parse(await readFile(path.join(DATA, "responses", latest), "utf8"));
    const parsed = parseMemoResponse(stored.result.summary);
    if (!parsed.ok) return null;
    const memo = { documentId: `kit-${photo}`, runId: `kit-run-${photo}`, memo: parsed.memo };
    return { memo, view: memoView(memo, { src: `/kit/photo/${photo}`, width: inspection.width, height: inspection.height, turns: 0 }) };
  } catch {
    return null;
  }
}

/**
 * Development only: the check flow's screens on a stored reading of a private test photo (S04 by
 * default, `&photo=S01.jpg` for another; the ask deck on V01.flat by default, `&photo=V02.flat.jpg`;
 * `&photo=P1.jpg` … `P5.jpg` his five-page test (F2: the numbers screen on real pages);
 * `&photo=f2-P1.jpg`, `f2-P2.jpg` his 4 Nov pages (F2 fix 6), boxes put on the writing as a
 * reading is now stored, or `&snap=0` the model's boxes as they came;
 * `&memo=M01.jpg` adds a company memo's stored reading, as if photographed with the page;
 * `&photo=karim` is a drawn page shaped like the five-page test's first, for splitting a part;
 * `&photo=karim2` one shaped like its second, with a pretend khata for the "before" questions;
 * `&closed=1` makes "Fix this page" warn of a closed day), for screenshots without an account or
 * a paid call.
 */
export default async function KitCheckPage({ searchParams }: PageProps<"/kit/check">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { step, photo, memo, closed, snap } = await searchParams;
  const current = STEPS.find((s) => s === step);
  const name = typeof photo === "string" && PHOTO_RE.test(photo) ? photo : current === "asks" ? "V01.flat.jpg" : "S04.jpg";
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
  const fixture = photo === "karim" ? karimFixture() : photo === "karim2" ? karimBookFixture() : await loadFixture(name, snap !== "0");
  if (!fixture) return <main className="app-main pad">No stored reading for {name} in private-test-data.</main>;
  const kitMemo = typeof memo === "string" && MEMO_RE.test(memo) ? await loadMemo(memo) : null;
  if (memo && !kitMemo) return <main className="app-main pad">No stored memo reading for {String(memo)} in private-test-data.</main>;
  return (
    <main className="app-main">
      <CheckBoard step={current} fixture={fixture} memos={kitMemo ? [kitMemo] : []} closed={closed === "1"} />
    </main>
  );
}
