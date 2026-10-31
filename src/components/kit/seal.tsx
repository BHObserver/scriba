"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/client";

/**
 * "হিসাব মিলেছে": a double red ring at −12°. With `land` it drops from scale 1.6 and −20° with a
 * slight overshoot (420 ms) and buzzes once where the phone allows; reduced motion fades it in.
 */
export function Seal({ size = 112, land = false }: { size?: number; land?: boolean }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (land && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
  }, [land]);
  const inner = Math.round(size * 0.84);
  const ring = (
    <div className="seal-in" style={{ width: inner, height: inner, fontSize: Math.round(size * 0.16) }}>
      <span>
        {t("seal.l1")}
        <br />
        {t("seal.l2")}
      </span>
    </div>
  );
  if (!land) {
    return (
      <div className="seal" role="img" aria-label={t("seal.label")} style={{ width: size, height: size, transform: "rotate(-12deg)" }}>
        {ring}
      </div>
    );
  }
  return (
    <motion.div
      className="seal"
      role="img"
      aria-label={t("seal.label")}
      style={{ width: size, height: size }}
      initial={reduce ? { opacity: 0, rotate: -12 } : { opacity: 0, scale: 1.6, rotate: -20 }}
      animate={{ opacity: 1, scale: 1, rotate: -12 }}
      transition={reduce ? { duration: 0.3 } : { duration: 0.42, ease: [0.3, 1.45, 0.5, 1] }}
    >
      {ring}
    </motion.div>
  );
}
