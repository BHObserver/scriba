import { cx } from "@/components/ui";
import { type ThumbPage, thumbHeight, thumbSrc } from "./history-model";

/**
 * A page as a small picture: his photo, upright, from the thumbnail route; or, for a sample
 * page that has no photo, a drawn ruled page (never fake handwriting).
 */
export function PageThumb({ page, width, label, className }: { page: ThumbPage; width: number; label?: string; className?: string }) {
  const height = thumbHeight(page, width);
  const src = thumbSrc(page, width > 96 ? 320 : 96);
  if (!src) {
    return <span className={cx("kh-pg kh-pg-drawn", className)} style={{ width, height, aspectRatio: `${width} / ${height}` }} role={label ? "img" : undefined} aria-label={label} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in image route; next/image would cache it publicly
  return <img className={cx("kh-pg", className)} src={src} width={width} height={height} alt={label ?? ""} loading="lazy" decoding="async" />;
}
