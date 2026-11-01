"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Keypad, type KeypadKey, TopBar, applyKey, groupTyped } from "@/components/kit";
import { LanguageChoice } from "@/components/shell/language-choice";
import { useI18n } from "@/lib/i18n/client";
import type { WelcomeStep } from "./welcome-steps";


function Dots({ at }: { at: 1 | 2 | 3 }) {
  const { t } = useI18n();
  return (
    <div className="ob-dots">
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= at ? "on" : undefined} aria-hidden="true" />
      ))}
      <span>{t("step", at, 3)}</span>
    </div>
  );
}

/**
 * Opening a new halkhata, once, before the first Today: the language, how Scriba works, the
 * shop's name and the morning cash. Nothing is saved until the last step; then Today opens
 * with only the morning cash in it. A new shop is a real shop: no sample badge here.
 */
export function WelcomeFlow({ start }: { start: WelcomeStep }) {
  const router = useRouter();
  const i18n = useI18n();
  const { t } = i18n;
  const [step, setStep] = useState<WelcomeStep>(start);
  const [shopName, setShopName] = useState("");
  const [cash, setCash] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = shopName.trim();

  const open = async () => {
    if (!name) return setStep("shop");
    setSaving(true);
    setFailed(false);
    const res = await fetch("/api/shop", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopName: name, language: i18n.locale, openingCashPoisha: Number(cash || "0") * 100 }),
    }).catch(() => null);
    if (!res?.ok) {
      setSaving(false);
      setFailed(true);
      return;
    }
    router.replace("/");
    router.refresh();
  };

  if (step === "welcome") {
    return (
      <>
        <header className="cloth ob-cloth">
          <span className="ob-kicker">{t("ob.kicker")}</span>
          <span className="ob-mark">{t("app.name")}</span>
          <h1 className="ob-title">{t("ob.title")}</h1>
        </header>
        <div className="pad ob-body">
          <p className="t-body">{t("ob.body")}</p>
          <span className="t-label">{t("ob.lang")}</span>
          <LanguageChoice />
          <p className="t-small">{t("ob.lang.note")}</p>
        </div>
        <div className="pad ob-foot">
          <Button variant="red" wide onClick={() => setStep("how")}>
            {t("next")}
          </Button>
        </div>
      </>
    );
  }

  if (step === "how") {
    return (
      <>
        <TopBar title={t("how.title")} onBack={() => setStep("welcome")} />
        <div className="pad ob-main">
          <Dots at={1} />
          <ol className="how">
            {([1, 2, 3] as const).map((i) => (
              <li key={i}>
                <span className="how-n" aria-hidden="true">
                  {i18n.digits(String(i))}
                </span>
                <div>
                  <p className="text-[19px] font-semibold leading-snug">{t(`how.${i}.t`)}</p>
                  <p className="t-small">{t(`how.${i}.b`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="pad ob-foot">
          <Button variant="red" wide onClick={() => setStep("shop")}>
            {t("next")}
          </Button>
        </div>
      </>
    );
  }

  if (step === "shop") {
    return (
      <>
        <TopBar title="" onBack={() => setStep("how")} />
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (name) setStep("cash");
          }}
        >
          <div className="pad ob-main">
            <Dots at={2} />
            <h1 className="t-title ob-q">
              <label htmlFor="shop-name">{t("shop.title")}</label>
            </h1>
            <input
              id="shop-name"
              className="set-input"
              value={shopName}
              maxLength={80}
              autoComplete="organization"
              enterKeyHint="next"
              placeholder={t("shop.ph")}
              onChange={(e) => setShopName(e.target.value)}
            />
            <p className="t-small">{t("shop.hint")}</p>
          </div>
          <div className="pad ob-foot">
            <Button type="submit" variant="red" wide disabled={!name}>
              {t("next")}
            </Button>
          </div>
        </form>
      </>
    );
  }

  const onKey = (key: KeypadKey) => setCash((v) => applyKey(v, key, 7));
  return (
    <>
      <TopBar title="" onBack={() => setStep("shop")} />
      <div className="pad ob-main">
        <Dots at={3} />
        <h1 className="t-title ob-q">{t("cash.title")}</h1>
        <div className="ob-cash" aria-live="polite">
          <span className="hero-n">{`৳${i18n.digits(groupTyped(cash || "0"))}`}</span>
          <i className="fx-caret" aria-hidden="true" />
        </div>
        <p className="t-small">{t("cash.hint")}</p>
        {failed ? (
          <p className="set-err" role="alert">
            {t("ob.saveErr")}
          </p>
        ) : null}
      </div>
      <div className="pad ob-keys">
        <Keypad onKey={onKey} />
        <Button variant="red" wide disabled={saving} onClick={open}>
          {saving ? t("ob.saving") : t("ob.go")}
        </Button>
      </div>
    </>
  );
}
