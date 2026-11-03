/**
 * Explicit live check of voice correction (P1) and spoken answers (U2): send ONE WAV clip to Muse
 * Voice Transcribe and print what it heard, and the number and yes/no the code reads from it.
 * V1: or every clip in a folder, scored against the page's ground truth, one part per clip.
 * Never run by tests or builds.
 * Each clip spends a little credit ($0.18 per audio hour, so about $0.0005 for a 10 s clip).
 *
 *   bun run live:voice <clip.wav>             # Bangla bias, as on the Bangla screen
 *   bun run live:voice <clip.wav> --lang=en   # English + Bangla bias, as on the English screen
 *   bun run live:voice <clip.wav> --dry-run   # check the clip, send nothing
 *
 *   bun run live:voice <folder>               # V1: every clip in the folder, in name order
 *   bun run live:voice <folder> --dry-run     # convert and check them, show what each should carry, send nothing
 *   bun run live:voice --rescore=<results.private.json>   # score saved transcripts again, no call
 *
 * One clip must be mono 16-bit PCM at 16 or 24 kHz, 0.3–15 s, as the app records it.
 * In a folder, a clip may be any audio a phone records (m4a, ogg, mp3, wav…): ffmpeg converts it
 * to 24 kHz mono PCM16, as the app's recorder does, into `<folder>/sent/`. A clip longer than the
 * app's 15 s is still sent (up to 2 min) and marked, since how long a part takes is a finding.
 * A clip named `P1-b3-quiet.m4a` is part b3 of `<truths>/P1.json` (`--truths=`, default
 * private-test-data/ground-truth), taken in the quiet; any other name is transcribed, not scored.
 * Transcripts go to `<folder>/results.<time>.private.json`. The folder run refuses to start when
 * its audio would cost more than `--max-usd` (default 0.10, V1's budget).
 * Reads META_MODEL_API_KEY from .env.local (Bun loads it automatically).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { getMetaConfig, getVoiceConfig } from "@/lib/config";
import { type GroundTruth, groundTruthSchema } from "@/lib/evaluation/ground-truth";
import { formatRatio, type Ratio } from "@/lib/evaluation/metrics";
import { type ExpectedPart, type MarkerGroup, type PartScore, type TruthBlock, expectedPart, partRatios, scorePart } from "@/lib/evaluation/spoken-part";
import { buildTranscribeRequest, createTranscriber, type VoiceLanguage } from "@/lib/meta/voice";
import { estimateVoiceCostUsd } from "@/lib/pricing";
import { readYesNo } from "@/lib/voice/answer-words";
import { parseSpokenNumber } from "@/lib/voice/number-words";
import { readWavInfo, wavProblem } from "@/lib/voice/wav";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const path = args.find((a) => !a.startsWith("--"));
const rescore = flag("rescore");
const lang = flag("lang") ?? "bn";
const dryRun = args.includes("--dry-run");
const truthsDir = flag("truths") ?? "private-test-data/ground-truth";
const maxUsd = Number(flag("max-usd") ?? "0.10");
if ((!path && !rescore) || !["bn", "en"].includes(lang) || !(maxUsd >= 0)) {
  console.error("Usage: bun run live:voice (<clip.wav> | <folder>) [--lang=bn|en] [--dry-run] [--truths=<dir>] [--max-usd=0.10]");
  console.error("       bun run live:voice --rescore=<results.private.json> [--truths=<dir>]");
  process.exit(2);
}

const voice = getVoiceConfig();
const languages: VoiceLanguage[] = lang === "en" ? ["English", "Bengali"] : ["Bengali"];

async function runOne(file: string) {
  const bytes = new Uint8Array(readFileSync(file));
  const info = readWavInfo(bytes);
  const problem = wavProblem(info, voice);
  console.log("Clip:", info ? `${info.sampleRate} Hz, ${info.channels} ch, ${info.bitsPerSample}-bit, ${info.durationMs} ms` : "not a WAV file");
  if (problem) {
    console.error(`Rejected: ${problem}. The app would not send this clip.`);
    process.exit(1);
  }

  console.log("Request:", JSON.stringify(buildTranscribeRequest(voice.modelId, languages)));
  if (dryRun) process.exit(0);

  const result = await createTranscriber(getMetaConfig(), voice)(bytes, languages);
  if (!result.ok) {
    console.error(`Failed (${result.category}, HTTP ${result.httpStatus ?? "none"}): ${result.message}`);
    process.exit(1);
  }
  console.log("Heard:", JSON.stringify(result.transcript));
  console.log("Number:", JSON.stringify(parseSpokenNumber(result.transcript)));
  console.log("Yes/no:", JSON.stringify(readYesNo(result.transcript)));
  console.log(`Audio ${result.audioDurationMs} ms · about $${estimateVoiceCostUsd(result.audioDurationMs).toFixed(6)} · ${result.elapsedMs} ms round trip · session ${result.sessionId ?? "?"}`);
}

// ---- V1: a folder of clips, one part each ----

const AUDIO = new Set([".wav", ".m4a", ".mp4", ".aac", ".mp3", ".ogg", ".oga", ".opus", ".webm", ".amr", ".3gp", ".flac"]);
const LONGEST_SENT_MS = 120_000;

type Saved = {
  clip: string;
  page: string | null;
  block: string | null;
  take: string | null;
  durationMs: number;
  converted: string | null;
  transcript: string | null;
  error: string | null;
  elapsedMs: number | null;
  audioDurationMs: number | null;
};

/** `P1-b3-quiet` → page P1, part b3, take "quiet". */
function nameParts(clip: string) {
  const m = /^(P\d+)-(b\d+)(?:-(.+))?$/i.exec(clip);
  return m ? { page: m[1]!.toUpperCase(), block: m[2]!.toLowerCase(), take: m[3]?.toLowerCase() ?? null } : { page: null, block: null, take: null };
}

const truths = new Map<string, { truth: GroundTruth; blocks: TruthBlock[] } | null>();
function expectedFor(page: string | null, block: string | null): ExpectedPart | null {
  if (!page || !block) return null;
  if (!truths.has(page)) {
    const file = join(truthsDir, `${page}.json`);
    if (!existsSync(file)) truths.set(page, null);
    else {
      const json = JSON.parse(readFileSync(file, "utf8")) as { _blocks?: TruthBlock[] };
      truths.set(page, { truth: groundTruthSchema.parse(json), blocks: json._blocks ?? [] });
    }
  }
  const t = truths.get(page);
  const b = t?.blocks.find((x) => x.id === block);
  return t && b ? expectedPart(t.truth, b) : null;
}

/** The clip as the app would send it: as is when it already is, else converted by ffmpeg. */
function asSent(folder: string, file: string): { bytes: Uint8Array; converted: string | null } | { error: string } {
  const original = new Uint8Array(readFileSync(join(folder, file)));
  const info = readWavInfo(original);
  if (info && wavProblem(info, { minMs: 0, maxMs: Infinity }) === null) return { bytes: original, converted: null };
  mkdirSync(join(folder, "sent"), { recursive: true });
  const out = join(folder, "sent", `${basename(file, extname(file))}.wav`);
  const ff = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", join(folder, file), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", out],
    { encoding: "utf8" },
  );
  if (ff.error) return { error: `ffmpeg didn't run (${ff.error.message}); install it or give 24 kHz mono WAVs` };
  if (ff.status !== 0) return { error: `ffmpeg couldn't read it: ${ff.stderr.trim().split("\n").at(-1) ?? ""}` };
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels", "-of", "csv=p=0", join(folder, file)], { encoding: "utf8" });
  return { bytes: new Uint8Array(readFileSync(out)), converted: probe.status === 0 ? probe.stdout.trim().split("\n")[0]! : extname(file).slice(1) };
}

async function runFolder(folder: string) {
  const files = readdirSync(folder)
    .filter((f) => AUDIO.has(extname(f).toLowerCase()) && statSync(join(folder, f)).isFile())
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (files.length === 0) {
    console.error(`No audio in ${folder}.`);
    process.exit(1);
  }

  const ready: Array<{ saved: Saved; bytes: Uint8Array }> = [];
  for (const file of files) {
    const clip = basename(file, extname(file));
    const sent = asSent(folder, file);
    if ("error" in sent) {
      console.error(`${clip}: ${sent.error}`);
      continue;
    }
    const info = readWavInfo(sent.bytes)!;
    const problem = wavProblem(info, { minMs: voice.minMs, maxMs: LONGEST_SENT_MS });
    if (problem) {
      console.error(`${clip}: not sent (${problem}, ${(info.durationMs / 1000).toFixed(1)} s)`);
      continue;
    }
    const saved: Saved = { clip, ...nameParts(clip), durationMs: info.durationMs, converted: sent.converted, transcript: null, error: null, elapsedMs: null, audioDurationMs: null };
    ready.push({ saved, bytes: sent.bytes });
  }

  const totalMs = ready.reduce((n, r) => n + r.saved.durationMs, 0);
  // Billed per started second of each clip, at most.
  const worstUsd = ready.reduce((n, r) => n + estimateVoiceCostUsd(r.saved.durationMs + 999), 0);
  console.log(`${ready.length} clips, ${(totalMs / 1000).toFixed(1)} s of audio, about $${worstUsd.toFixed(4)} · ${JSON.stringify(buildTranscribeRequest(voice.modelId, languages))}\n`);
  if (worstUsd > maxUsd) {
    console.error(`Refused: more than the $${maxUsd} allowed (--max-usd).`);
    process.exit(1);
  }

  const transcribe = createTranscriber(getMetaConfig(), voice);
  for (const { saved, bytes } of ready) {
    if (!dryRun) {
      const result = await transcribe(bytes, languages);
      saved.elapsedMs = result.elapsedMs;
      if (result.ok) {
        saved.transcript = result.transcript;
        saved.audioDurationMs = result.audioDurationMs;
      } else saved.error = `${result.category}, HTTP ${result.httpStatus ?? "none"}: ${result.message}`;
    }
    report(saved);
  }
  if (dryRun) return;

  const out = join(folder, `results.${new Date().toISOString().replace(/[:.]/g, "-")}.private.json`);
  writeFileSync(out, `${JSON.stringify({ format: "scriba-voice-results-1", model: voice.modelId, languages, clips: ready.map((r) => r.saved) }, null, 2)}\n`);
  summarize(ready.map((r) => r.saved));
  console.log(`\nSaved ${out}`);
}

async function rescoreSaved(file: string) {
  const saved = (JSON.parse(readFileSync(file, "utf8")) as { clips: Saved[] }).clips;
  for (const s of saved) report(s);
  summarize(saved);
}

const scores = new Map<string, { score: PartScore; expected: ExpectedPart }>();
const mark = (ok: boolean) => (ok ? "✓" : "✗");

function report(s: Saved) {
  const long = s.durationMs > voice.maxMs ? `, longer than the app's ${voice.maxMs / 1000} s` : "";
  console.log(`${s.clip}  ${(s.durationMs / 1000).toFixed(1)} s${long}${s.converted ? `  (from ${s.converted})` : ""}`);
  const expected = expectedFor(s.page, s.block);
  if (s.transcript === null) {
    if (s.error) console.log(`  Failed: ${s.error}`);
    if (expected) console.log(`  Should carry: ${expected.figures.map((f) => (f.role === "amount" ? f.value : `${f.role} ${f.value}`)).join(" · ")} | ${expected.words.map((w) => w.word).join(" ")}`);
    console.log("");
    return;
  }
  console.log(`  Heard: ${JSON.stringify(s.transcript)}`);
  if (!expected) {
    console.log(`  Numbers: ${parseSpokenNumbers(s.transcript)}${s.page ? `  (no part ${s.block} in ${s.page})` : ""}\n`);
    return;
  }
  const score = scorePart(expected, s.transcript);
  scores.set(s.clip, { score, expected });
  const r = partRatios(score);
  console.log(`  Numbers: ${score.heard.join(" ") || "none"}`);
  console.log(`  Figures: ${score.figures.map((f) => `${mark(f.heard)}${f.role === "amount" ? "" : `${f.role} `}${f.value}`).join("  ")}${score.extra.length ? `  · extra ${score.extra.join(" ")}` : ""}`);
  console.log(`  Words: ${score.words.map((w) => `${w.found === "exact" ? "✓" : w.found === "near" ? "~" : "✗"}${w.word}`).join("  ")}`);
  console.log(`  Markers said: ${score.said.join(", ") || "none"}${score.unsaid.length ? ` · not said: ${score.unsaid.join(", ")}` : ""}`);
  console.log(`  money ${formatRatio(r.money)} · counts ${formatRatio(r.qty)} · words ${formatRatio(r.words)}${s.elapsedMs !== null ? ` · ${s.elapsedMs} ms` : ""}\n`);
}

const parseSpokenNumbers = (t: string) => {
  const n = parseSpokenNumber(t);
  return n.kind === "none" ? "none" : n.kind === "one" ? n.value : n.values.join(" ");
};

function summarize(saved: Saved[]) {
  const add = (a: Ratio, b: Ratio): Ratio => ({ numerator: a.numerator + b.numerator, denominator: a.denominator + b.denominator });
  const zero = (): Ratio => ({ numerator: 0, denominator: 0 });
  const takes = new Map<string, Saved[]>();
  for (const s of saved) takes.set(s.take ?? "(no take)", [...(takes.get(s.take ?? "(no take)") ?? []), s]);
  console.log("Summary by take");
  for (const [take, list] of takes) {
    let money = zero();
    let qty = zero();
    let words = zero();
    const markers = new Map<MarkerGroup, Ratio>();
    let scored = 0;
    for (const s of list) {
      const hit = scores.get(s.clip);
      if (!hit) continue;
      scored++;
      const r = partRatios(hit.score);
      money = add(money, r.money);
      qty = add(qty, r.qty);
      words = add(words, r.words);
      for (const g of hit.expected.markers) markers.set(g, add(markers.get(g) ?? zero(), { numerator: hit.score.said.includes(g) ? 1 : 0, denominator: 1 }));
    }
    const ms = list.reduce((n, s) => n + s.durationMs, 0);
    const long = list.filter((s) => s.durationMs > voice.maxMs).length;
    const failed = list.filter((s) => s.transcript === null).length;
    const trips = list.flatMap((s) => (s.elapsedMs !== null && s.transcript !== null ? [s.elapsedMs] : []));
    console.log(`  ${take}: ${list.length} clips (${scored} scored${failed ? `, ${failed} failed` : ""}), ${(ms / 1000).toFixed(1)} s${long ? `, ${long} over ${voice.maxMs / 1000} s` : ""}`);
    if (scored) {
      console.log(`    money ${formatRatio(money)} · counts ${formatRatio(qty)} · words ${formatRatio(words)}`);
      console.log(`    markers said where the part has one: ${[...markers].map(([g, r]) => `${g} ${r.numerator}/${r.denominator}`).join(" · ")}`);
    }
    if (trips.length) console.log(`    round trip: median ${trips.sort((a, b) => a - b)[Math.floor(trips.length / 2)]} ms, slowest ${Math.max(...trips)} ms`);
  }
  const billedMs = saved.reduce((n, s) => n + (s.audioDurationMs ?? 0), 0);
  if (billedMs) console.log(`  Audio billed ${(billedMs / 1000).toFixed(1)} s · about $${saved.reduce((n, s) => n + estimateVoiceCostUsd(s.audioDurationMs ?? 0), 0).toFixed(4)}`);
}

// Last, so every constant above is set before a run starts.
if (rescore) await rescoreSaved(rescore);
else if (statSync(path!).isDirectory()) await runFolder(path!);
else await runOne(path!);
