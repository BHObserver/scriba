"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { Button, ButtonRow } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import { type Point, type Quad, isConvexQuad, orderCorners } from "./geometry";

const CORNER_KEYS = ["corners.tl", "corners.tr", "corners.br", "corners.bl"] as const;
/** The loupe's zoom over the photo as shown, and its radius in px (a 120 px circle). */
const ZOOM = 3;
const R = 60;

type Box = { x: number; y: number; scale: number };

/**
 * After the shot (DESIGN_SPEC D5, corners): the still with the detector's corners. Each dot can
 * be dragged (or moved with the arrow keys); while a finger is on one, a loupe on the other side
 * shows the corner at 3×. "Straighten" needs a proper four-sided page.
 */
export function CornersView({
  src,
  width,
  height,
  initial,
  found,
  busy,
  onRetake,
  onDone,
}: {
  src: string;
  /** The still as displayed (EXIF orientation applied). */
  width: number;
  height: number;
  initial: Quad;
  /** The detector found a page; otherwise the dots start at the photo's corners. */
  found: boolean;
  /** Flattening: what to say over the photo meanwhile. */
  busy: string | null;
  onRetake: () => void;
  onDone: (quad: Quad, moved: boolean) => void;
}) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [quad, setQuad] = useState<Quad>(initial);
  const [moved, setMoved] = useState(false);
  const [drag, setDrag] = useState<{ index: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => {
      const sw = el.clientWidth;
      const sh = el.clientHeight;
      const scale = Math.min(sw / width, sh / height);
      setBox({ x: (sw - width * scale) / 2, y: (sh - height * scale) / 2, scale });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height]);

  const clamp = (p: Point): Point => [Math.min(width, Math.max(0, p[0])), Math.min(height, Math.max(0, p[1]))];
  const place = (index: number, p: Point) => {
    setQuad((q) => q.map((c, i) => (i === index ? clamp(p) : c)) as unknown as Quad);
    setMoved(true);
  };
  /** A dot dragged past its neighbour is put back in order, if that makes a page again. */
  const tidy = () => setQuad((q) => (isConvexQuad(q) ? q : orderCorners(q)));

  const toImage = (e: PointerEvent): Point | null => {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect || !box) return null;
    return [(e.clientX - rect.left - box.x) / box.scale, (e.clientY - rect.top - box.y) / box.scale];
  };

  function down(index: number, e: PointerEvent<HTMLButtonElement>) {
    const p = toImage(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Keep the finger's offset from the dot, so the dot doesn't jump under it.
    setDrag({ index, dx: quad[index]![0] - p[0], dy: quad[index]![1] - p[1] });
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const p = drag && toImage(e);
    if (drag && p) place(drag.index, [p[0] + drag.dx, p[1] + drag.dy]);
  }
  function up() {
    if (!drag) return;
    setDrag(null);
    tidy();
  }
  function key(index: number, e: KeyboardEvent<HTMLButtonElement>) {
    const step = (e.shiftKey ? 0.025 : 0.005) * Math.max(width, height);
    const d: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const by = d[e.key];
    if (!by) return;
    e.preventDefault();
    place(index, [quad[index]![0] + by[0], quad[index]![1] + by[1]]);
  }

  const valid = isConvexQuad(quad);
  const shownW = box ? width * box.scale : 0;
  const shownH = box ? height * box.scale : 0;
  const points = quad.map((p) => p.join(",")).join(" ");
  const held = drag ? quad[drag.index]! : null;

  return (
    <div className="flow column sc-dark">
      <div className="sc-top">
        <h1 className="sc-title">{t("corners.title")}</h1>
      </div>
      <div className="sc-stage" ref={stage}>
        {box ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the still */}
            <img className="sc-photo" src={src} alt="" draggable={false} style={{ left: box.x, top: box.y, width: shownW, height: shownH }} />
            <svg className="sc-outline" style={{ left: box.x, top: box.y, width: shownW, height: shownH }} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <polygon className={valid ? "" : "bad"} points={points} vectorEffect="non-scaling-stroke" />
            </svg>
            {quad.map((p, i) => (
              <button
                key={i}
                type="button"
                className={`sc-handle${drag?.index === i ? " on" : ""}`}
                style={{ left: box.x + p[0] * box.scale, top: box.y + p[1] * box.scale }}
                aria-label={t(CORNER_KEYS[i]!)}
                onPointerDown={(e) => down(i, e)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onKeyDown={(e) => key(i, e)}
                onKeyUp={tidy}
              />
            ))}
            {held ? (
              <div
                className={`sc-loupe${held[0] * box.scale < shownW / 2 ? " right" : ""}${held[1] * box.scale < shownH * 0.35 ? " low" : ""}`}
                aria-hidden="true"
                style={{
                  backgroundImage: `url(${src})`,
                  backgroundSize: `${shownW * ZOOM}px ${shownH * ZOOM}px`,
                  backgroundPosition: `${R - held[0] * box.scale * ZOOM}px ${R - held[1] * box.scale * ZOOM}px`,
                }}
              >
                <svg width={2 * R} height={2 * R} viewBox={`0 0 ${2 * R} ${2 * R}`}>
                  <polygon
                    points={quad.map((p) => `${R + (p[0] - held[0]) * box.scale * ZOOM},${R + (p[1] - held[1]) * box.scale * ZOOM}`).join(" ")}
                  />
                </svg>
                <i className="sc-loupe-x" />
              </div>
            ) : null}
          </>
        ) : null}
        {busy ? (
          <p className="sc-busy" role="status">
            {busy}
          </p>
        ) : null}
      </div>
      <div className="sc-bottom">
        <p className="sc-tip">{t(found ? "corners.tip" : "corners.none")}</p>
        <ButtonRow>
          <Button variant="line" className="light" onClick={onRetake} disabled={busy !== null}>
            {t("corners.retake")}
          </Button>
          <Button variant="red" onClick={() => onDone(quad, moved)} disabled={!valid || busy !== null}>
            {t("flatten")}
          </Button>
        </ButtonRow>
      </div>
    </div>
  );
}
