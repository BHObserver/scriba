"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Keypad, type KeypadKey, SampleBadge, Sheet, applyKey, groupTyped } from "@/components/kit";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { useI18n } from "@/lib/i18n/client";
import type { OpeningCash } from "@/lib/insights/day";
import { glyph } from "./learning-screen";
import { openingSub } from "./more-model";

export type MoreView = {
  asOf: string;
  sample: boolean;
  shopName: string;
  /** The usual morning cash: a day starts from it when the day before wasn't closed. */
  usualCashPoisha: number;
  /** What today actually starts from, and where that came from. */
  opening: OpeningCash;
  language: "bn" | "en";
  /** P3: how many corrections taught a digit, and the mix-up seen most (null before the first). */
  learning: { learnedFrom: number; top: { written: number; read: number } | null };
};

const DETAILS = [
  ["/documents", "more.photos"],
  ["/records", "more.records"],
  ["/evaluation", "more.eval"],
] as const;

const PRINTS = [
  ["/khata.pdf", "more.print.a5", "more.print.a5.b"],
  ["/khata-a4.pdf", "more.print.a4", "more.print.a4.b"],
] as const;

/**
 * আরও: the shop (name, morning cash), the language, the details pages that keep the full
 * record for an audit, and signing out. The learning card (P3) opens the learning panel; the print
 * card (P4) opens the khata PDFs made by `bun run khata:pdf`.
 */
export function MoreScreen(view: MoreView) {
  const i18n = useI18n();
  const { t } = i18n;
  const [sheet, setSheet] = useState<"name" | "cash" | null>(null);

  return (
    <div className="more">
      <div className="pad du-top">
        <div className="du-titlebar">
          <h1 className="t-title">{t("more.title")}</h1>
          {view.sample ? <SampleBadge /> : null}
        </div>
      </div>
      <div className="pad money-body">
        <section className="card set-group" aria-labelledby="more-shop">
          <h2 id="more-shop" className="t-label set-h">
            {t("more.shop")}
          </h2>
          <button type="button" className="set-row" onClick={() => setSheet("name")} aria-label={`${t("more.shopName")}: ${view.shopName}. ${t("more.edit")}`}>
            <span className="set-l">
              <b>{t("more.shopName")}</b>
            </span>
            <span className="set-v">{view.shopName}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="set-row"
            onClick={() => setSheet("cash")}
            aria-label={`${t("more.morning")}: ${i18n.money(view.opening.poisha)}. ${t("more.edit")}`}
          >
            <span className="set-l">
              <b>{t("more.morning")}</b>
              <span className="t-small">{openingSub(view.opening, view.asOf, i18n)}</span>
            </span>
            <span className="set-v">{i18n.money(view.opening.poisha)}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </section>
        <section className="card set-group">
          <h2 className="t-label set-h">{t("more.lang")}</h2>
          <div className="set-segs">
            <LanguageSwitch />
          </div>
        </section>
        <Link href="/settings/learning" className="card set-learn">
          <span className="set-l">
            <b>{t("more.learn.t")}</b>
            <span className="t-small">{view.learning.top ? t("more.learn.b", view.learning.learnedFrom) : t("learn.empty")}</span>
          </span>
          {view.learning.top ? (
            <span className="lr-mini" aria-hidden="true">
              <span className="lr-hand">{glyph(view.learning.top.written)}</span>
              <span className="lr-arrow">→</span>
              <span className="lr-read">{glyph(view.learning.top.read)}</span>
            </span>
          ) : (
            <span />
          )}
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
        <section className="card set-group" aria-labelledby="more-print">
          <h2 id="more-print" className="t-label set-h">
            {t("more.print.t")}
          </h2>
          <p className="t-small set-p">{t("more.print.b")}</p>
          {PRINTS.map(([href, label, sub]) => (
            <a key={href} href={href} target="_blank" rel="noopener" type="application/pdf" className="set-row">
              <span className="set-l">
                <b>{t(label)}</b>
                <span className="t-small">{t(sub)}</span>
              </span>
              <span className="set-v">PDF</span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          ))}
          <p className="t-small set-p set-print-how">{t("more.print.how")}</p>
        </section>
        <section className="card set-group" aria-labelledby="more-details">
          <h2 id="more-details" className="t-label set-h">
            {t("more.details")}
          </h2>
          <p className="t-small set-p">{t("more.details.b")}</p>
          {DETAILS.map(([href, label]) => (
            <Link key={href} href={href} className="set-row">
              <span className="set-l">
                <b>{t(label)}</b>
              </span>
              <span />
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </section>
        {view.sample ? <p className="t-small set-sample">{t("more.sampleNote")}</p> : null}
        <form action="/auth/signout" method="post">
          <button className="btn btn-line w-full">{t("more.signout")}</button>
        </form>
      </div>
      <NameSheet open={sheet === "name"} onClose={() => setSheet(null)} view={view} />
      <CashSheet open={sheet === "cash"} onClose={() => setSheet(null)} view={view} />
    </div>
  );
}

/** PUT /api/shop with one field changed; the page re-reads everything afterwards. */
function useSaveShop(view: MoreView, onSaved: () => void) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async (change: { shopName?: string; openingCashPoisha?: number }) => {
    setSaving(true);
    setFailed(false);
    const res = await fetch("/api/shop", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopName: view.shopName, language: view.language, openingCashPoisha: view.usualCashPoisha, ...change }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) return setFailed(true);
    onSaved();
    router.refresh();
  };
  return { save, saving, failed, reset: () => setFailed(false) };
}

function NameSheet({ open, onClose, view }: { open: boolean; onClose: () => void; view: MoreView }) {
  const { t } = useI18n();
  const [name, setName] = useState(view.shopName);
  const { save, saving, failed, reset } = useSaveShop(view, onClose);
  const close = () => {
    setName(view.shopName);
    reset();
    onClose();
  };
  const trimmed = name.trim();
  return (
    <Sheet open={open} onClose={close} label={t("more.shopName")}>
      <form
        className="sh-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && trimmed !== view.shopName) void save({ shopName: trimmed });
          else if (trimmed) close();
        }}
      >
        <label htmlFor="more-name" className="t-sec">
          {t("shop.title")}
        </label>
        <input id="more-name" className="set-input" value={name} maxLength={80} placeholder={t("shop.ph")} onChange={(e) => setName(e.target.value)} />
        <p className="t-small">{t("shop.hint")}</p>
        {failed ? (
          <p className="set-err" role="alert">
            {t("more.saveErr")}
          </p>
        ) : null}
        <Button type="submit" variant="red" wide disabled={!trimmed || saving}>
          {saving ? t("more.saving") : t("more.save")}
        </Button>
      </form>
    </Sheet>
  );
}

function CashSheet({ open, onClose, view }: { open: boolean; onClose: () => void; view: MoreView }) {
  const i18n = useI18n();
  const { t } = i18n;
  const start = String(Math.round(view.usualCashPoisha / 100));
  const [typed, setTyped] = useState(start);
  const { save, saving, failed, reset } = useSaveShop(view, onClose);
  const close = () => {
    setTyped(start);
    reset();
    onClose();
  };
  const onKey = (key: KeypadKey) => setTyped((v) => applyKey(v, key, 7));
  const fromCount = view.opening.source === "counted" && view.opening.date;
  return (
    <Sheet open={open} onClose={close} label={t("more.morning")}>
      <div className="sh-body">
        <span className="t-sec">{t("more.cash.title")}</span>
        <div className="fx-field" aria-live="polite">
          <span className="fx-val">
            {`৳${i18n.digits(groupTyped(typed || "0"))}`}
            <i className="fx-caret" aria-hidden="true" />
          </span>
        </div>
        <p className="t-small">{t("more.cash.hint")}</p>
        {fromCount ? <div className="look-panel">{t("more.cash.today", i18n.dayMonth(view.opening.date!), i18n.money(view.opening.poisha))}</div> : null}
        {failed ? (
          <p className="set-err" role="alert">
            {t("more.saveErr")}
          </p>
        ) : null}
        <Keypad onKey={onKey} />
        <Button variant="red" wide disabled={saving} onClick={() => void save({ openingCashPoisha: Number(typed || "0") * 100 })}>
          {saving ? t("more.saving") : t("more.save")}
        </Button>
      </div>
    </Sheet>
  );
}
