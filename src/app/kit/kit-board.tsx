"use client";

import { useState } from "react";
import {
  Button,
  ButtonRow,
  Chip,
  Cover,
  EmptyState,
  Equation,
  Keypad,
  LineStrip,
  Money,
  SampleBadge,
  Seal,
  Sheet,
  StatusMark,
  Switch,
  TopBar,
  applyKey,
} from "@/components/kit";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { useI18n } from "@/lib/i18n/client";

// A synthetic ruled page (600×800) so the strip crop can be checked without a private photo.
const LINES = ["চাল ২ কেজি × ৯৫ = ১৯০", "ডাল ৩ × ৬০ = ১৮০", "তেল ১ লি × ১৮০ = ১৮০", "মোট = ৫৫০"];
const PAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#f6efdc"/>${Array.from({ length: 10 }, (_, i) => `<line x1="0" x2="600" y1="${133 + i * 80}" y2="${133 + i * 80}" stroke="#9fb4d6" stroke-width="1.5"/>`).join("")}<line x1="64" x2="64" y1="0" y2="800" stroke="#d98b80" stroke-width="2"/>${LINES.map((l, i) => `<text x="84" y="${200 + i * 80}" font-size="40" fill="#2b3f8f" font-family="sans-serif">${l}</text>`).join("")}</svg>`;
const PAGE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PAGE_SVG)}`;
const box = (i: number) => ({ x_min: 120, y_min: Math.round(((150 + i * 80) / 800) * 1000), x_max: 900, y_max: Math.round(((215 + i * 80) / 800) * 1000) });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="t-label uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

export function KitBoard() {
  const { t, digits, count, money } = useI18n();
  const [typed, setTyped] = useState("180");
  const [on, setOn] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sealKey, setSealKey] = useState(0);

  return (
    <div className="column grid gap-8 pb-10">
      <Cover shopName="মায়ের দোকান" sample title={t("today.title", "১ নভেম্বর")} label={t("today.drawer")} hero={money(432000)} sub={t("today.onlyMorning")} />
      <div className="pad grid gap-8">
        <TopBar title={t("kh.title")} sub={t("kh.pages", 3)} backHref="/settings" right={<SampleBadge />} />
        <Section title="Language">
          <LanguageSwitch />
        </Section>
        <Section title="Buttons">
          <ButtonRow>
            <Button variant="line">{t("retake")}</Button>
            <Button variant="red">{t("next")}</Button>
          </ButtonRow>
          <Button variant="ghost" wide>{t("nothing.add")}</Button>
        </Section>
        <Section title="Chips and marks">
          <div className="flex flex-wrap items-center gap-2">
            <Chip kind="ok">{t("kh.checked")}</Chip>
            <Chip kind="look">{t("kh.waiting")}</Chip>
            <Chip>{t("kh.notClosed")}</Chip>
            <StatusMark kind="ok" />
            <StatusMark kind="look" />
            <StatusMark kind="wait" />
          </div>
        </Section>
        <Section title="Money">
          <div className="card grid gap-2 p-5">
            <Money poisha={432000} size="hero" />
            <Money poisha={12345000} size="tile" />
            <Money poisha={18000} size="card" />
            <p className="t-body">
              <Money poisha={2875050} /> · {t("kh.sales", money(2875050))}
            </p>
          </div>
        </Section>
        <Section title="Strip and equation">
          <div className="card grid gap-2 p-4">
            <LineStrip src={PAGE_SRC} box={box(1)} photoWidth={600} photoHeight={800} reading={LINES[1]} />
            <Equation qty={digits("3")} rate={digits("60")} amount={digits("180")} unit="কেজি" look={{ amount: true }} onTap={() => setSheet(true)} />
          </div>
          <div className="card grid gap-2 p-4">
            <LineStrip src={PAGE_SRC} box={box(3)} photoWidth={600} photoHeight={800} height={64} />
            <Equation amount={count(550)} />
          </div>
          <LineStrip src={null} box={null} photoWidth={0} photoHeight={0} height={56} />
        </Section>
        <Section title="Keypad and sheet">
          <Button variant="line" wide onClick={() => setSheet(true)}>
            {t("eq.amount")}: {digits(typed || "0")}
          </Button>
          <Sheet open={sheet} onClose={() => setSheet(false)} label={t("eq.amount")}>
            <div className="grid gap-4">
              <p className="hero-n text-center">{digits(typed || "0")}</p>
              <Keypad onKey={(k) => setTyped((v) => applyKey(v, k))} />
              <Button variant="red" wide onClick={() => setSheet(false)}>
                {t("close")}
              </Button>
            </div>
          </Sheet>
        </Section>
        <Section title="Switch">
          <div className="card flex items-center justify-between gap-3 p-5">
            <span className="t-body">{t("learn.use")}</span>
            <Switch checked={on} onChange={setOn} label={t("learn.use")} />
          </div>
        </Section>
        <Section title="Seal">
          <div className="card grid place-items-center gap-4 p-6">
            <Seal key={sealKey} land={sealKey > 0} />
            <Button variant="line" onClick={() => setSealKey((k) => k + 1)}>
              {t("seal.label")}
            </Button>
          </div>
        </Section>
        <Section title="Empty states">
          <EmptyState icon="page" title={t("empty.kh.t")} body={t("empty.kh.b")} />
          <EmptyState icon="people" title={t("empty.dues.t")} body={t("empty.dues.b")} />
          <EmptyState icon="search" title={t("kh.none.t", "করিম")} body={t("kh.none.b")} action={<Button variant="line">{t("retry")}</Button>} />
        </Section>
        <Section title="Problem panel">
          <div className="panel-soft grid gap-1">
            <p className="t-sec">{t("failed.t")}</p>
            <p className="t-body">{t("failed.b")}</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
