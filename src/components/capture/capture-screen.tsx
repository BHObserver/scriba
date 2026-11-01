"use client";

import { Check, RotateCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ButtonRow, TopBar } from "@/components/kit";
import { OrientedImage } from "@/components/photo-orientation";
import { ProblemView } from "@/components/check/problem-view";
import { ReadingView } from "@/components/check/reading-view";
import { useI18n } from "@/lib/i18n/client";
import { type SupportedMimeType, inspectImage } from "@/lib/images/inspect";
import type { QuarterTurns } from "@/lib/images/orientation";
import { type ProblemKind, RETRYABLE } from "./problems";
import { useKhataPages } from "./khata-pref";
import { useReadingQueue } from "./reading-queue";
import { takeShot } from "./still-photo";
import { UploadError, problemForRejection, sha256Hex, uploadPage } from "./upload";

/** Pages per send. Each is one paid reading; the hourly limit is 30 by default. */
const MAX_PAGES = 8;
const JPEG_QUALITY = 0.92;

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
};

type Stage =
  | { kind: "camera" }
  | { kind: "sideways"; key: string }
  | { kind: "sending"; index: number; fraction: number }
  | { kind: "problem"; problem: ProblemKind; key?: string };

type Camera = "starting" | "live" | "off";

/** A khata page is taller than wide; a wide photo is probably sideways (there is no detector). */
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
 * `/capture` (DESIGN_SPEC D2): a live camera with a guide frame, the tray of taken pages (turn,
 * remove), and "read" which stores every original, starts their readings and opens /check.
 * No camera (a laptop, permission refused): the phone's own camera or the gallery instead.
 * A shot from the live camera is a full-resolution still where the browser offers one, else the
 * preview's frame (`still-photo.ts`). It is encoded once here, as the original; nothing is resized later.
 */
export function CaptureScreen({ userId, maxUploadBytes }: { userId: string; maxUploadBytes: number }) {
  const { t, count, locale } = useI18n();
  const router = useRouter();
  const { read } = useReadingQueue();
  const [khata, setKhata] = useKhataPages();

  const [pages, setPages] = useState<TrayPage[]>([]);
  const pagesRef = useRef<TrayPage[]>([]);
  const uploaded = useRef(new Map<string, string>());
  const [stage, setStage] = useState<Stage>({ kind: "camera" });
  const [camera, setCamera] = useState<Camera>("starting");
  const [flash, setFlash] = useState(0);
  /** A still can take a second; one press at a time. */
  const [shooting, setShooting] = useState(false);
  const shootingRef = useRef(false);

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

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) el.srcObject = streamRef.current;
  }, []);

  const cameraWanted = stage.kind === "camera";
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

  /** Check one photo and put it in the tray. Returns the problem when it can't be used. */
  async function addPhoto(blob: Blob, filename: string | null): Promise<ProblemKind | null> {
    if (pagesRef.current.length >= MAX_PAGES) return null;
    if (blob.size > maxUploadBytes) return "file";
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const inspection = inspectImage(bytes);
    if (!inspection.ok) return problemForRejection(inspection.reason);
    const sha256 = await sha256Hex(bytes);
    if (pagesRef.current.some((p) => p.sha256 === sha256)) return null;
    const url = URL.createObjectURL(blob);
    const size = await shownSize(url, inspection);
    updatePages((prev) => [
      ...prev,
      { key: crypto.randomUUID(), bytes, mimeType: inspection.mimeType, sha256, filename, url, ...size, turns: 0, hasGps: inspection.hasGpsMetadata, upright: false },
    ]);
    return null;
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || pagesRef.current.length >= MAX_PAGES || shootingRef.current) return;
    shootingRef.current = true;
    setShooting(true);
    setFlash((n) => n + 1);
    try {
      const track = streamRef.current?.getVideoTracks()[0] ?? null;
      const blob = await takeShot(video, track, { maxBytes: maxUploadBytes, quality: JPEG_QUALITY });
      if (!blob) return;
      const problem = await addPhoto(blob, null);
      if (problem) setStage({ kind: "problem", problem });
    } finally {
      shootingRef.current = false;
      setShooting(false);
    }
  }

  async function pickFiles(files: FileList | null) {
    for (const file of files ? [...files] : []) {
      const problem = await addPhoto(file, file.name || null);
      if (problem) {
        setStage({ kind: "problem", problem });
        break;
      }
    }
    if (galleryInput.current) galleryInput.current.value = "";
    if (phoneCamInput.current) phoneCamInput.current.value = "";
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

  /** Store each original (skipping ones already stored), then start every reading and open page 1. */
  async function send(list: TrayPage[]) {
    const ids: string[] = [];
    for (const [index, page] of list.entries()) {
      const known = uploaded.current.get(page.key);
      if (known) {
        ids.push(known);
        continue;
      }
      setStage({ kind: "sending", index, fraction: 0 });
      try {
        const { documentId } = await uploadPage(page, userId, (fraction) => setStage({ kind: "sending", index, fraction }));
        uploaded.current.set(page.key, documentId);
        ids.push(documentId);
      } catch (e) {
        const problem = e instanceof UploadError ? (navigator.onLine ? e.problem : "offline") : "sendFailed";
        setStage({ kind: "problem", problem, key: page.key });
        return;
      }
    }
    read(list.map((p, i) => ({ documentId: ids[i]!, turns: p.turns, layout: khata ? "scriba_khata" : "free" })));
    router.push(`/check/${ids[0]}?pages=${ids.join(",")}`);
  }

  const photoOf = (p: TrayPage) => ({ src: p.url, width: p.width, height: p.height, turns: p.turns });

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
          <span className="cap-tip">{t(khata ? "cap.khata.tip" : "cap.tip")}</span>
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
              <div className="cap-frame" aria-hidden="true">
                <i className="cnr tl" />
                <i className="cnr tr" />
                <i className="cnr bl" />
                <i className="cnr br" />
              </div>
              {camera === "starting" ? <p className="cap-msg t-body">{t("cap.starting")}</p> : null}
              {flash > 0 ? <div key={flash} className="cap-flash" aria-hidden="true" /> : null}
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
            disabled={camera !== "live" || full || shooting}
            aria-busy={shooting}
            aria-label={t("cap.shoot")}
          >
            <i />
          </button>
          <button type="button" className="cap-side done" onClick={() => startRead()} disabled={pages.length === 0}>
            {pages.length ? t("cap.readN", pages.length) : t("cap.read")}
          </button>
        </div>
      </div>

      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} onChange={(e) => void pickFiles(e.target.files)} />
      <input
        ref={phoneCamInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void pickFiles(e.target.files)}
      />
    </div>
  );
}
