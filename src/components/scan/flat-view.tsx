"use client";

import { useEffect, useRef, useState } from "react";
import { Button, TopBar } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import { type Quad, homography } from "./geometry";

/** CSS `matrix3d` that draws a w × h box (origin 0 0) onto `quad`: the same homography the page was flattened with. */
export function quadMatrix(w: number, h: number, quad: Quad): string {
  const m = homography(
    [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    quad,
  );
  if (!m) return "none";
  const [a, b, c, d, e, f, g, hh, i] = m;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,${i})`;
}

const lerpQuad = (a: Quad, b: Quad, k: number) => a.map((p, i) => [p[0] + (b[i]![0] - p[0]) * k, p[1] + (b[i]![1] - p[1]) * k]) as unknown as Quad;
const DURATION = 700;

/**
 * The flattened page (DESIGN_SPEC D5, flatten): it rises from where it sat in the photo and
 * squares up in 700 ms (ease-out cubic), then "the page is straight". Reduced motion: it simply
 * appears. `asIs`: nothing was flattened (the photo already is the page, or flattening failed).
 */
export function FlatView({
  page,
  from,
  note,
  title,
  queued,
  onFix,
  onSend,
  onMore,
}: {
  page: { src: string; width: number; height: number };
  /** Where the page sat in the still, and the still's size; null shows it without the travel. */
  from: { quad: Quad; width: number; height: number } | null;
  note: "flat.body" | "flat.asIs" | "flat.whole";
  title: string;
  /** Gallery photos still waiting for their corners. */
  queued: number;
  onFix: (() => void) | null;
  onSend: () => void;
  onMore: () => void;
}) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Decided once: the parent gives each page its own FlatView (a `key`), so it travels once.
  const [travels] = useState(() => from !== null && !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [k, setK] = useState(travels ? 0 : 1);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!travels) return;
    let raf = 0;
    const t0 = performance.now() + 200;
    const step = (now: number) => {
      const x = Math.min(1, Math.max(0, (now - t0) / DURATION));
      setK(1 - (1 - x) ** 3);
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [travels]);

  let transform = "none";
  let box = { w: 0, h: 0 };
  if (size) {
    const pad = 20;
    const s = Math.min((size.w - 2 * pad) / page.width, (size.h - 2 * pad) / page.height);
    box = { w: page.width * s, h: page.height * s };
    const x = (size.w - box.w) / 2;
    const y = (size.h - box.h) / 2;
    const flat: Quad = [
      [x, y],
      [x + box.w, y],
      [x + box.w, y + box.h],
      [x, y + box.h],
    ];
    let start = flat;
    if (from) {
      // The still fitted in the same stage: where the page was before it squared up.
      const fs = Math.min(size.w / from.width, size.h / from.height);
      const fx = (size.w - from.width * fs) / 2;
      const fy = (size.h - from.height * fs) / 2;
      start = from.quad.map(([qx, qy]) => [fx + qx * fs, fy + qy * fs]) as unknown as Quad;
    }
    transform = quadMatrix(box.w, box.h, lerpQuad(start, flat, k));
  }
  const done = k === 1;

  return (
    <div className="flow column">
      <TopBar title={title} onBack={onFix ?? undefined} />
      <div className="sc-flat" ref={stage}>
        {size ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the flattened page
          <img className={`sc-flat-page${done ? " done" : ""}`} src={page.src} alt="" style={{ width: box.w, height: box.h, transform }} />
        ) : null}
      </div>
      <div className={`sc-flat-text pad${done ? " in" : ""}`}>
        {note === "flat.body" ? <h2 className="t-sec">{t("flat.title")}</h2> : null}
        <p className="t-small">{t(note)}</p>
        {/* One red action; fixing the corners and taking another page are soft (DESIGN_SPEC D5). */}
        <Button variant="red" wide onClick={onSend}>
          {queued > 0 ? t("flat.next", queued) : t("flat.send")}
        </Button>
        <div className="sc-flat-more">
          {onFix ? (
            <Button variant="ghost" onClick={onFix}>
              {t("flat.fix")}
            </Button>
          ) : null}
          {queued === 0 ? (
            <Button variant="ghost" onClick={onMore}>
              {t("flat.more")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
