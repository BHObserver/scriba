"use client";

import type { LivePage } from "./use-page-finder";

/**
 * The page's outline over the live preview (DESIGN_SPEC D5, scanner). The SVG uses the video's
 * own pixels and crops like the video's `object-fit: cover`, so the outline sits on the paper.
 * Found: turmeric outline with corner dots; locked on a Scriba khata: green; too far or cut off:
 * a dashed cream outline. Nothing found: the guide corners stay.
 */
export function LiveOutline({ live }: { live: LivePage }) {
  const { quad, video, status } = live;
  if (!quad || !video || status === "none") {
    return (
      <div className="cap-frame" aria-hidden="true">
        <i className="cnr tl" />
        <i className="cnr tr" />
        <i className="cnr bl" />
        <i className="cnr br" />
      </div>
    );
  }
  const tone = status === "khata" ? "lock" : status === "far" || status === "cut" ? "far" : "";
  const r = Math.max(video.width, video.height) * 0.009;
  return (
    <svg
      className={`sc-outline ${tone}`}
      viewBox={`0 0 ${video.width} ${video.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <polygon points={quad.map((p) => p.join(",")).join(" ")} vectorEffect="non-scaling-stroke" />
      {tone === "far" ? null : quad.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={r} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}
