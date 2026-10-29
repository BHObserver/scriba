"use client";

import { type ReactNode, createContext, use, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { type QuarterTurns, describeTurns } from "@/lib/images/orientation";

type ImageSize = { width: number; height: number };
type Orientation = { turns: QuarterTurns; setTurns: (turns: QuarterTurns) => void };

const OrientationContext = createContext<Orientation | null>(null);

/** Shares the chosen orientation between the photo preview and the Analyze panel. */
export function OrientationProvider({ initialTurns = 0, children }: { initialTurns?: QuarterTurns; children: ReactNode }) {
  const [turns, setTurns] = useState<QuarterTurns>(initialTurns);
  return <OrientationContext value={{ turns, setTurns }}>{children}</OrientationContext>;
}

export function useOrientation(): Orientation {
  const value = use(OrientationContext);
  if (!value) throw new Error("useOrientation must be used inside an OrientationProvider.");
  return value;
}

/**
 * Shows the photo turned by `turns` clockwise quarter turns, using CSS only: the
 * image file is never altered. Children are laid over the turned photo, so line
 * boxes on Meta's 0-1000 grid line up with what was sent.
 */
export function OrientedImage({
  src,
  alt,
  turns,
  size,
  maxHeightVh,
  children,
}: {
  src: string;
  alt: string;
  turns: QuarterTurns;
  /** Stored pixel size; replaced by the browser's own measurement once loaded. */
  size: ImageSize;
  maxHeightVh?: number;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState(size);
  const measure = (img: HTMLImageElement | null) => {
    if (!img?.complete || img.naturalWidth === 0) return;
    setNatural((prev) =>
      prev.width === img.naturalWidth && prev.height === img.naturalHeight ? prev : { width: img.naturalWidth, height: img.naturalHeight },
    );
  };
  // An image already in the cache can finish loading before React attaches onLoad.
  useEffect(() => measure(ref.current), [src]);

  const sideways = turns % 2 === 1;
  const w = sideways ? natural.height : natural.width;
  const h = sideways ? natural.width : natural.height;
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded border border-rule"
      style={{ aspectRatio: `${w} / ${h}`, maxWidth: maxHeightVh ? `calc(${maxHeightVh}vh * ${w / h})` : undefined }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the original, never re-encoded */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={(e) => measure(e.currentTarget)}
        className="absolute left-1/2 top-1/2 max-w-none"
        style={{
          width: sideways ? `${(h / w) * 100}%` : "100%",
          height: sideways ? `${(w / h) * 100}%` : "100%",
          transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
        }}
      />
      {children}
    </div>
  );
}

/** The not-yet-analyzed photo, turned live as the user picks an orientation. */
export function PhotoPreview({ src, size }: { src: string; size: ImageSize }) {
  const { turns } = useOrientation();
  return <OrientedImage src={src} alt="Original ledger photograph" turns={turns} size={size} maxHeightVh={70} />;
}

export function OrientationControls({ disabled }: { disabled?: boolean }) {
  const { turns, setTurns } = useOrientation();
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-ink-soft">
        Photo: <span className="font-medium text-ink">{describeTurns(turns)}</span>
      </p>
      <div className="flex gap-1">
        <Button className="px-2.5 py-1" aria-label="Turn the photo left" title="Turn left" onClick={() => setTurns(((turns + 3) % 4) as QuarterTurns)} disabled={disabled}>
          ↺
        </Button>
        <Button className="px-2.5 py-1" aria-label="Turn the photo right" title="Turn right" onClick={() => setTurns(((turns + 1) % 4) as QuarterTurns)} disabled={disabled}>
          ↻
        </Button>
      </div>
    </div>
  );
}
