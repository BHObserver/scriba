"use client";

import { Check, RotateCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ButtonRow, TopBar } from "@/components/kit";
import { OrientedImage } from "@/components/photo-orientation";
import { ProblemView } from "@/components/check/problem-view";
import { ReadingView } from "@/components/check/reading-view";
import { CornersView } from "@/components/scan/corners-view";
import { FlatView } from "@/components/scan/flat-view";
import type { PageStatus } from "@/components/scan/detect";
import { type Quad, fullQuad, isFullFrame } from "@/components/scan/geometry";
import { LiveOutline } from "@/components/scan/live-outline";
import { Scanner, type StillPage } from "@/components/scan/scanner";
import { FLAT_QUALITY } from "@/components/scan/sizes";
import { usePageFinder } from "@/components/scan/use-page-finder";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { type SupportedMimeType, inspectImage } from "@/lib/images/inspect";
import type { QuarterTurns } from "@/lib/images/orientation";
import { type ProblemKind, RETRYABLE } from "./problems";
import { useAutoShutter, useKhataPages } from "./khata-pref";
import { useReadingQueue } from "./reading-queue";
import { takeShot } from "./still-photo";
import { type CameraOriginal, UploadError, keepOriginals, problemForRejection, sha256Hex, uploadPage } from "./upload";

/** Pages per send. Each is one paid reading; the hourly limit is 30 by default. */
const MAX_PAGES = 8;
const JPEG_QUALITY = 0.92;

/** The status pill under the live outline (DESIGN_SPEC D5, scanner); "none" says it's looking. */
const STATUS_TEXT: Partial<Record<PageStatus, MessageKey>> = {
  found: "scan.found",
  far: "scan.far",
  cut: "scan.cut",
  khata: "scan.khata",
};

type TrayPage = {
  key: string;
  bytes: Uint8Array;
  mimeType: SupportedMimeType;
  sha256: string;
  filename: string | null;
  url: string;
  /** As the browser shows it (EXIF orientation applied), which is what the user judges. */
  width: number;
  height: number;
  turns: QuarterTurns;
  hasGps: boolean;
  /** He confirmed a wide page is the right way up. */
  upright: boolean;
  /** The camera's own photo when this page was cut out of it (C2); kept after the reading starts. */
  camera: CameraOriginal | null;
  /** The detector locked on a Scriba khata's corner squares: read with the khata layout. */
  khataLock: boolean;
};

/** A photo (the shutter's still or a gallery file) waiting for its corners. */
type Shot = {
  blob: Blob;
  url: string;
  bytes: Uint8Array;
  mimeType: SupportedMimeType;
  sha256: string;
  filename: string | null;
  hasGps: boolean;
  /** As displayed (EXIF orientation applied); the corners are in these pixels. */
  width: number;
  height: number;
  found: boolean;
  khata: boolean;
  quad: Quad;
};

/** The page cut out of a shot, or the shot itself when nothing was cut. */
type FlatPage = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  quad: Quad;
  note: "flat.body" | "flat.asIs" | "flat.whole";
  source: CameraOriginal["cornersSource"] | null;
};

type Stage =
  | { kind: "camera" }
  | { kind: "corners"; shot: Shot; quad: Quad }
  | { kind: "flat"; shot: Shot; flat: FlatPage }
  | { kind: "sideways"; key: string }
  | { kind: "sending"; index: number; fraction: number }
  | { kind: "problem"; problem: ProblemKind; key?: string };

type Camera = "starting" | "live" | "off";

/** A khata page is taller than wide; a wide page is probably sideways. */
function looksSideways(p: TrayPage): boolean {
  const [w, h] = p.turns % 2 === 1 ? [p.height, p.width] : [p.width, p.height];
  return w > h * 1.05;
}

async function shownSize(url: string, fallback: { width: number; height: number }) {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return { width: img.naturalWidth || fallback.width, height: img.naturalHeight || fallback.height };
  } catch {
    return fallback;
  }
}

/**
 * `/capture` (DESIGN_SPEC D2, D5): a live camera that outlines the page as it finds it, the
 * corners screen after each shot, the flattened page, the tray of pages (turn, remove), and
 * "read" which stores every page, starts their readings and opens /check. Each camera photo
 * the page was cut from is kept too, uploaded after the readings start (C2).
 * No camera (a laptop, permission refused): the phone's own camera or the gallery instead;
 * their photos get the same corners screen.
 * A shot from the live camera is a full-resolution still where the browser offers one, else the
 * preview's frame (`still-photo.ts`).
 */
export function CaptureScreen({ userId, maxUploadBytes }: { userId: string; maxUploadBytes: number }) {
  const { t, count, locale } = useI18n();
  const router = useRouter();
  const { read } = useReadingQueue();
  const [khata, setKhata] = useKhataPages();
  const [auto, setAuto] = useAutoShutter();

  const [pages, setPages] = useState<TrayPage[]>([]);
  const pagesRef = useRef<TrayPage[]>([]);
  const uploaded = useRef(new Map<string, string>());
  const [stage, setStage] = useState<Stage>({ kind: "camera" });
  const [camera, setCamera] = useState<Camera>("starting");
  const [flash, setFlash] = useState(0);
  /** A still can take a second; one press at a time. */
  const [shooting, setShooting] = useState(false);
  const shootingRef = useRef(false);
  /** Finding the page in a still, or flattening it. */
  const [busy, setBusy] = useState<MessageKey | null>(null);
  /** Gallery photos waiting for their corners, one at a time. */
  const [queue, setQueue] = useState<File[]>([]);
  /**
   * The auto shutter after a shot: "see" waits to find the page again, "leave" waits for it to
   * go (he turns the page or takes it away), then it's "on" again. So one page isn't shot twice.
   */
  const [arm, setArm] = useState<"on" | "see" | "leave">("on");
  /** The page finder's worker, for as long as the screen is open. */
  const scannerRef = useRef<Scanner | null>(null);

  const galleryInput = useRef<HTMLInputElement>(null);
  const phoneCamInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const updatePages = useCallback((fn: (prev: TrayPage[]) => TrayPage[]) => {
    const next = fn(pagesRef.current);
    pagesRef.current = next;
    setPages(next);
    return next;
  }, []);

  // Object URLs live as long as the screen.
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  useEffect(() => {
    const s = new Scanner();
    scannerRef.current = s;
    return () => {
      s.close();
      scannerRef.current = null;
    };
  }, []);

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) el.srcObject = streamRef.current;
  }, []);

  // The camera stays on between the shot and the next page, so coming back is instant.
  const cameraWanted = stage.kind === "camera" || stage.kind === "corners" || stage.kind === "flat";
  useEffect(() => {
    if (!cameraWanted) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const stop = () => stream?.getTracks().forEach((track) => track.stop());
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (cancelled) return stop();
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera("live");
      } catch {
        if (!cancelled) setCamera("off");
      }
    })();
    return () => {
      cancelled = true;
      stop();
      streamRef.current = null;
    };
  }, [cameraWanted]);

  const live = usePageFinder(videoRef, scannerRef, stage.kind === "camera" && camera === "live" && !busy);
  const holding = live.status === "found" || live.status === "khata";
  if (arm === "see" && holding) setArm("leave");
  else if (arm === "leave" && !holding && live.video) setArm("on");

  /** Check a photo before its corners: size, format, and not already in the tray. */
  async function checkPhoto(
    blob: Blob,
  ): Promise<{ bytes: Uint8Array; mimeType: SupportedMimeType; sha256: string; hasGps: boolean; width: number; height: number } | ProblemKind | null> {
    if (blob.size > maxUploadBytes) return "file";
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const inspection = inspectImage(bytes);
    if (!inspection.ok) return problemForRejection(inspection.reason);
    const sha256 = await sha256Hex(bytes);
    if (pagesRef.current.some((p) => p.sha256 === sha256 || p.camera?.sha256 === sha256)) return null;
    return { bytes, mimeType: inspection.mimeType, sha256, hasGps: inspection.hasGpsMetadata, width: inspection.width, height: inspection.height };
  }

  /** Find the page in a photo and open its corners. False when it can't be used (a problem may be shown). */
  async function openShot(blob: Blob, filename: string | null): Promise<boolean> {
    if (pagesRef.current.length >= MAX_PAGES) return false;
    const checked = await checkPhoto(blob);
    if (checked === null) return false;
    if (typeof checked === "string") {
      setStage({ kind: "problem", problem: checked });
      return false;
    }
    setBusy("scan.finding");
    try {
      const url = URL.createObjectURL(blob);
      const scanner = scannerRef.current;
      let page: StillPage | null = null;
      try {
        page = scanner ? await scanner.still(blob) : null;
      } catch {
        page = null;
      }
      const size = page ?? (await shownSize(url, checked));
      const found = Boolean(page?.quad) && page?.status !== "none";
      const shot: Shot = {
        blob,
        url,
        ...checked,
        filename,
        width: size.width,
        height: size.height,
        found,
        khata: page?.khata ?? false,
        quad: found && page?.quad ? page.quad : fullQuad(size.width, size.height),
      };
      setStage({ kind: "corners", shot, quad: shot.quad });
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || pagesRef.current.length >= MAX_PAGES || shootingRef.current) return;
    shootingRef.current = true;
    setShooting(true);
    setArm("see");
    setFlash((n) => n + 1);
    try {
      const track = streamRef.current?.getVideoTracks()[0] ?? null;
      const blob = await takeShot(video, track, { maxBytes: maxUploadBytes, quality: JPEG_QUALITY });
      if (blob) await openShot(blob, null);
    } finally {
      shootingRef.current = false;
      setShooting(false);
    }
  }

  /** The next gallery photo waiting, or back to the camera. */
  async function openNext(rest: File[]) {
    for (let i = 0; i < rest.length; i++) {
      const file = rest[i]!;
      setQueue(rest.slice(i + 1));
      if (await openShot(file, file.name || null)) return;
    }
    setQueue([]);
    setStage((s) => (s.kind === "problem" ? s : { kind: "camera" }));
  }

  function pickFiles(files: FileList | null) {
    const list = files ? [...files] : [];
    if (galleryInput.current) galleryInput.current.value = "";
    if (phoneCamInput.current) phoneCamInput.current.value = "";
    if (list.length > 0) void openNext(list);
  }

  function retake(shot: Shot) {
    URL.revokeObjectURL(shot.url);
    setArm("on"); // he wants this page again
    if (queue.length > 0) void openNext(queue);
    else setStage({ kind: "camera" });
  }

  /** Cut the page out along `quad`. Corners at the photo's own edges mean the photo already is the page. */
  async function straighten(shot: Shot, quad: Quad, moved: boolean) {
    const whole = isFullFrame(quad, shot.width, shot.height, 0.01 * Math.max(shot.width, shot.height));
    const asIs = (note: FlatPage["note"]): FlatPage => ({ blob: shot.blob, url: shot.url, width: shot.width, height: shot.height, quad, note, source: null });
    const scanner = scannerRef.current;
    if (whole || !scanner) {
      setStage({ kind: "flat", shot, flat: asIs(whole ? "flat.whole" : "flat.asIs") });
      return;
    }
    setBusy("flat.working");
    try {
      const exact = shot.khata && !moved;
      let out = await scanner.flatten(shot.blob, quad, exact, FLAT_QUALITY);
      if (out.blob.size > maxUploadBytes) out = await scanner.flatten(shot.blob, quad, exact, 0.8);
      if (out.blob.size > maxUploadBytes) throw new Error("too large");
      const source = moved ? "adjusted" : exact ? "khata" : "detected";
      setStage({ kind: "flat", shot, flat: { ...out, url: URL.createObjectURL(out.blob), quad, note: "flat.body", source } });
    } catch {
      setStage({ kind: "flat", shot, flat: asIs("flat.asIs") });
    } finally {
      setBusy(null);
    }
  }

  /** Put the page in the tray; the shot's photo goes with it as the camera original when the page was cut from it. */
  async function keep(shot: Shot, flat: FlatPage): Promise<TrayPage[]> {
    const cut = flat.source !== null;
    if (cut) URL.revokeObjectURL(shot.url);
    const bytes = cut ? new Uint8Array(await flat.blob.arrayBuffer()) : shot.bytes;
    const sha256 = cut ? await sha256Hex(bytes) : shot.sha256;
    const camera: CameraOriginal | null =
      cut && flat.source
        ? {
            bytes: shot.bytes,
            mimeType: shot.mimeType,
            sha256: shot.sha256,
            filename: shot.filename,
            corners: flat.quad.map(([x, y]) => [x / shot.width, y / shot.height]),
            cornersSource: flat.source,
          }
        : null;
    return updatePages((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        bytes,
        mimeType: cut ? "image/jpeg" : shot.mimeType,
        sha256,
        filename: cut ? null : shot.filename,
        url: flat.url,
        width: flat.width,
        height: flat.height,
        turns: 0,
        hasGps: shot.hasGps,
        upright: false,
        camera,
        khataLock: shot.khata,
      },
    ]);
  }

  const turn = (key: string) =>
    updatePages((prev) => prev.map((p) => (p.key === key ? { ...p, turns: ((p.turns + 1) % 4) as QuarterTurns, upright: false } : p)));

  function remove(key: string) {
    const page = pagesRef.current.find((p) => p.key === key);
    if (page) URL.revokeObjectURL(page.url);
    uploaded.current.delete(key);
    updatePages((prev) => prev.filter((p) => p.key !== key));
  }

  function startRead(list: TrayPage[] = pagesRef.current) {
    if (list.length === 0) return;
    const sideways = list.find((p) => !p.upright && looksSideways(p));
    if (sideways) setStage({ kind: "sideways", key: sideways.key });
    else void send(list);
  }

  /**
   * Store each page (skipping ones already stored), then start every reading and open page 1.
   * The camera photos the pages were cut from follow in the background.
   */
  async function send(list: TrayPage[]) {
    const ids: string[] = [];
    const originals: { documentId: string; camera: CameraOriginal }[] = [];
    for (const [index, page] of list.entries()) {
      const known = uploaded.current.get(page.key);
      if (known) {
        ids.push(known);
        continue;
      }
      setStage({ kind: "sending", index, fraction: 0 });
      try {
        const { documentId, duplicate } = await uploadPage(page, userId, (fraction) => setStage({ kind: "sending", index, fraction }));
        uploaded.current.set(page.key, documentId);
        ids.push(documentId);
        if (page.camera && !duplicate) originals.push({ documentId, camera: page.camera });
      } catch (e) {
        const problem = e instanceof UploadError ? (navigator.onLine ? e.problem : "offline") : "sendFailed";
        setStage({ kind: "problem", problem, key: page.key });
        if (originals.length > 0) void keepOriginals(originals, userId);
        return;
      }
    }
    read(list.map((p, i) => ({ documentId: ids[i]!, turns: p.turns, layout: khata || p.khataLock ? "scriba_khata" : "free" })));
    router.push(`/check/${ids[0]}?pages=${ids.join(",")}`);
    void keepOriginals(originals, userId);
  }

  const photoOf = (p: TrayPage) => ({ src: p.url, width: p.width, height: p.height, turns: p.turns });

  if (stage.kind === "corners") {
    const { shot } = stage;
    return (
      <CornersView
        key={`${shot.url}:${stage.quad.join()}`}
        src={shot.url}
        width={shot.width}
        height={shot.height}
        initial={stage.quad}
        found={shot.found}
        busy={busy ? t(busy) : null}
        onRetake={() => retake(shot)}
        onDone={(quad, moved) => void straighten(shot, quad, moved)}
      />
    );
  }

  if (stage.kind === "flat") {
    const { shot, flat } = stage;
    return (
      <FlatView
        key={flat.url}
        page={{ src: flat.url, width: flat.width, height: flat.height }}
        from={flat.source ? { quad: flat.quad, width: shot.width, height: shot.height } : null}
        note={flat.note}
        title={t("kh.page", pages.length + 1)}
        queued={queue.length}
        onFix={() => {
          if (flat.url !== shot.url) URL.revokeObjectURL(flat.url);
          setStage({ kind: "corners", shot, quad: flat.quad });
        }}
        onSend={async () => {
          const list = await keep(shot, flat);
          if (queue.length > 0 && list.length < MAX_PAGES) void openNext(queue);
          else startRead(list);
        }}
        onMore={async () => {
          await keep(shot, flat);
          setStage({ kind: "camera" });
        }}
      />
    );
  }

  if (stage.kind === "sending") {
    const first = pages[0];
    return (
      <ReadingView
        photo={first ? photoOf(first) : null}
        sub={t("rd.pageOf", 1, pages.length)}
        step={0}
        sendLabel={pages.length > 1 ? t("rd.sendN", stage.index + 1, pages.length) : undefined}
        sendProgress={stage.fraction}
      />
    );
  }

  if (stage.kind === "sideways") {
    const index = pages.findIndex((p) => p.key === stage.key);
    const page = pages[index];
    if (!page) return null;
    return (
      <div className="flow column">
        <TopBar title={t("kh.page", index + 1)} onBack={() => setStage({ kind: "camera" })} />
        <div className="pad pb-main">
          <div className="rd-photo">
            <OrientedImage src={page.url} alt="" turns={page.turns} size={page} maxHeightVh={44} />
          </div>
          <section className="pb-panel" role="alert">
            <h2 className="t-sec">{t("side.t")}</h2>
            <p className="t-body">{t("side.b")}</p>
          </section>
        </div>
        <div className="pad pb-acts">
          <ButtonRow stack={locale === "en"}>
            <Button variant="line" onClick={() => turn(page.key)}>
              {t("side.turn")}
            </Button>
            <Button
              variant="red"
              onClick={() => startRead(updatePages((prev) => prev.map((p) => (p.key === page.key ? { ...p, upright: true } : p))))}
            >
              {t("side.ok")}
            </Button>
          </ButtonRow>
        </div>
      </div>
    );
  }

  if (stage.kind === "problem") {
    const page = pages.find((p) => p.key === stage.key);
    const back = () => setStage({ kind: "camera" });
    const canRetry = RETRYABLE.has(stage.problem);
    return (
      <ProblemView kind={stage.problem} title={t("tab.camera")} photo={page ? photoOf(page) : null} kept={false} onBack={back}>
        {canRetry ? (
          <>
            <Button variant="red" wide onClick={() => void send(pagesRef.current)}>
              {t("retry")}
            </Button>
            <Button variant="ghost" wide onClick={back}>
              {t("back")}
            </Button>
          </>
        ) : (
          <Button
            variant="red"
            wide
            onClick={() => {
              if (page) remove(page.key);
              back();
            }}
          >
            {t("retake")}
          </Button>
        )}
      </ProblemView>
    );
  }

  const full = pages.length >= MAX_PAGES;
  return (
    <div className="cap flow">
      <div className="cap-in">
        <div className="cap-top">
          <Link href="/" className="back light" aria-label={t("close")}>
            <X size={26} strokeWidth={2.25} aria-hidden="true" />
          </Link>
          {camera === "live" ? (
            <button type="button" className="sc-auto" aria-pressed={auto} onClick={() => setAuto(!auto)}>
              <i aria-hidden="true" />
              {t("scan.auto")} · {t(auto ? "on" : "off")}
            </button>
          ) : (
            <span className="cap-tip">{t(khata ? "cap.khata.tip" : "cap.tip")}</span>
          )}
        </div>

        <div className="cap-view">
          {camera === "off" ? (
            <div className="cap-msg" role="status">
              <h2 className="t-sec">{t("cap.nocam.t")}</h2>
              <p className="t-body">{t("cap.nocam.b")}</p>
              <Button variant="red" wide onClick={() => phoneCamInput.current?.click()} disabled={full}>
                {t("cap.phoneCam")}
              </Button>
              <Button variant="line" wide onClick={() => galleryInput.current?.click()} disabled={full}>
                {t("cap.gallery")}
              </Button>
            </div>
          ) : (
            <>
              <video ref={attachVideo} className="cap-video" autoPlay playsInline muted aria-hidden="true" />
              <LiveOutline live={live} />
              {camera === "starting" ? <p className="cap-msg t-body">{t("cap.starting")}</p> : null}
              {camera === "live" && !busy ? (
                <p className={`sc-msg${live.status === "far" || live.status === "cut" ? " far" : live.status === "khata" ? " lock" : ""}`} role="status">
                  {t(STATUS_TEXT[live.status] ?? (khata ? "cap.khata.tip" : "scan.finding"))}
                </p>
              ) : null}
              {flash > 0 ? <div key={flash} className="cap-flash" aria-hidden="true" /> : null}
              {busy ? (
                <p className="sc-busy" role="status">
                  {t(busy)}
                </p>
              ) : null}
            </>
          )}
        </div>

        <button type="button" className="cap-kh" aria-pressed={khata} onClick={() => setKhata(!khata)}>
          <span className="cap-kh-box" aria-hidden="true">
            {khata ? <Check size={16} strokeWidth={3} /> : null}
          </span>
          {t("cap.khata")}
        </button>
        {pages.some((p) => p.hasGps) ? <p className="cap-note">{t("cap.gps")}</p> : null}
        {full ? <p className="cap-note">{t("cap.full", MAX_PAGES)}</p> : null}

        <div className="cap-tray">
          {pages.length === 0 ? <span className="cap-empty">{t("cap.empty")}</span> : null}
          {pages.map((p, i) => (
            <div className="cap-thumb" key={p.key}>
              <span className="cap-pic">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the original */}
                <img src={p.url} alt={t("kh.page", i + 1)} style={{ transform: `rotate(${p.turns * 90}deg)` }} />
              </span>
              <span className="cap-n" aria-hidden="true">
                {count(i + 1)}
              </span>
              <button type="button" className="cap-x" onClick={() => remove(p.key)} aria-label={t("cap.remove", i + 1)}>
                <X size={14} strokeWidth={3} aria-hidden="true" />
              </button>
              <button type="button" className="cap-rot" onClick={() => turn(p.key)} aria-label={t("cap.turn.label", i + 1)}>
                <RotateCw size={13} strokeWidth={2.5} aria-hidden="true" />
                {t("cap.turn")}
              </button>
            </div>
          ))}
        </div>

        <div className="cap-bar">
          <button type="button" className="cap-side" onClick={() => galleryInput.current?.click()} disabled={full}>
            {t("cap.gallery")}
          </button>
          <button
            type="button"
            className="cap-shutter"
            onClick={() => void shoot()}
            disabled={camera !== "live" || full || shooting || busy !== null}
            aria-busy={shooting}
            aria-label={t("cap.shoot")}
          >
            {/* The hold-still ring: a new one starts each time the page settles; when it closes, the shot is taken. */}
            {auto && arm === "on" && holding && live.steadySince !== null && !full && !shooting && !busy ? (
              <svg key={live.steadySince} className="sc-hold" viewBox="0 0 92 92" aria-hidden="true">
                <circle cx="46" cy="46" r="42" onAnimationEnd={() => void shoot()} />
              </svg>
            ) : null}
            <i />
          </button>
          <button type="button" className="cap-side done" onClick={() => startRead()} disabled={pages.length === 0}>
            {pages.length ? t("cap.readN", pages.length) : t("cap.read")}
          </button>
        </div>
      </div>

      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} onChange={(e) => pickFiles(e.target.files)} />
      <input
        ref={phoneCamInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => pickFiles(e.target.files)}
      />
    </div>
  );
}
