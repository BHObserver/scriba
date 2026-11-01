"use client";

import { useState } from "react";
import { SampleBadge, TopBar } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import { BANGLA_DIGITS } from "@/lib/numerals";
import type { LearningPanel } from "@/lib/server/learning-data";
import "./learning.css";

/** His digits stay Bangla in English too (the mix-up is about their shapes); English adds the value. */
export function glyph(d: number): string {
  return BANGLA_DIGITS[d]!;
}

/** A strip of his confirmed lines cut from the photos, exactly as the reader is shown them. */
function Strip({ ids, alt }: { ids: readonly string[]; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a private, per-user JPEG from /api/crops
  return <img className="lr-strip" src={`/api/crops?records=${ids.join(",")}`} alt={alt} loading="lazy" />;
}

/**
 * What Scriba learned from his corrections (P3): the digits it mixes up, the lines it uses to
 * recognise his writing, and the switch, off by default, that reads new pages with them.
 * Said honestly: fewer misreads is the aim, and every line is still checked.
 */
export function LearningScreen({ panel, sample }: { panel: LearningPanel; sample: boolean }) {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const say = (d: number) => (locale === "bn" ? glyph(d) : `${glyph(d)} (${d})`);
  const [on, setOn] = useState(panel.on);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const toggle = async () => {
    const next = !on;
    setOn(next);
    setSaving(true);
    setFailed(false);
    const res = await fetch("/api/learning", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setOn(!next);
      setFailed(true);
    }
  };
  const mixRow = (c: { written: number; read: number; count: number }) =>
    c.count === 1 ? t("learn.mixRow1", say(c.written), say(c.read)) : t("learn.mixRow", say(c.written), say(c.read), c.count);
  const example = panel.confusions.find((c) => c.exampleId)?.exampleId ?? null;
  const empty = panel.confusions.length === 0 && panel.references.length === 0;

  return (
    <div className="more">
      <TopBar title={t("learn.title")} backHref="/settings" right={sample ? <SampleBadge /> : null} />
      <div className="pad money-body">
        <p className="t-body">{t("learn.lead")}</p>
        {empty ? (
          <section className="card lr-card">
            <p className="t-body">{t("learn.empty")}</p>
          </section>
        ) : null}
        {panel.confusions.length > 0 ? (
          <section className="card lr-card" aria-labelledby="lr-mix">
            <h2 id="lr-mix" className="t-label">
              {t("learn.mix")}
            </h2>
            {panel.confusions.map((c, i) => (
              <div key={`${c.written}-${c.read}`} className={`lr-row${i === 0 ? " top" : ""}`}>
                <span className="lr-pair" aria-hidden="true">
                  <span className="lr-hand">{glyph(c.written)}</span>
                  <span className="lr-arrow">→</span>
                  <span className="lr-read">{glyph(c.read)}</span>
                </span>
                <span className="lr-t">{mixRow(c)}</span>
              </div>
            ))}
            {example ? <Strip ids={[example]} alt={mixRow(panel.confusions.find((c) => c.exampleId === example)!)} /> : null}
            <span className="t-small">{t("learn.stats", panel.corrected.numbers, panel.corrected.pages)}</span>
          </section>
        ) : null}
        {panel.references.length > 0 ? (
          <section className="card lr-card" aria-labelledby="lr-refs">
            <h2 id="lr-refs" className="t-label">
              {t("learn.refs")}
            </h2>
            <Strip ids={panel.references} alt={t("learn.refs")} />
            <span className="t-small">{t("learn.refs.b")}</span>
          </section>
        ) : null}
        {panel.available ? (
          <section className="card lr-card">
            <div className="lr-use">
              <b id="lr-use">{t("learn.use")}</b>
              <button type="button" role="switch" aria-checked={on} aria-labelledby="lr-use" className="sw" disabled={saving} onClick={() => void toggle()}>
                <i aria-hidden="true" />
                <span>{t(on ? "learn.on" : "learn.off")}</span>
              </button>
            </div>
            <span className="t-small">{t("learn.use.b")}</span>
            {failed ? (
              <p className="set-err" role="alert">
                {t("more.saveErr")}
              </p>
            ) : null}
          </section>
        ) : null}
        <div className="look-panel">{t("learn.honest")}</div>
      </div>
    </div>
  );
}
