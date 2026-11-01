"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Sheet } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import type { LineDetail } from "@/lib/server/shop-data";
import { DetailStrip } from "./drill-sheet";
import { mergeOrder, mergeWhat, nameMatches, objectiveName, reminderLines } from "./dues-model";

function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sh-head">
      <h2 className="t-sec">{title}</h2>
      <button type="button" className="back" onClick={onClose} aria-label={t("close")}>
        <X size={24} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Show the search field only when the list is long enough to need it. */
const SEARCH_FROM = 7;

/**
 * Two spellings of one person become one account: this party's lines count under the name he
 * picks. Says exactly what moves before he confirms; the merge can be undone on the ledger.
 */
export function MergeSheet({
  open,
  onClose,
  partyId,
  name,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  partyId: string;
  name: string;
  targets: ReadonlyArray<{ id: string; name: string }>;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [into, setInto] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const shown = mergeOrder(name, targets).filter((p) => nameMatches(query, p.name));
  const target = targets.find((p) => p.id === into) ?? null;

  const merge = async () => {
    if (!target) return;
    setState("saving");
    const res = await fetch(`/api/parties/${partyId}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ into: target.id }),
    }).catch(() => null);
    if (!res?.ok) {
      setState("failed");
      return;
    }
    router.replace(`/parties/${target.id}`);
    router.refresh();
  };

  return (
    <Sheet open={open} onClose={onClose} label={t("mg.title")}>
      <div className="sh-body">
        <SheetHead title={t("mg.title")} onClose={onClose} />
        <p className="t-body">{t("mg.body")}</p>
        <h3 className="field-l">{t("mg.pick")}</h3>
        {targets.length >= SEARCH_FROM ? (
          <input className="input" type="search" lang="bn" placeholder={t("mg.find")} aria-label={t("mg.find")} value={query} onChange={(e) => setQuery(e.target.value)} />
        ) : null}
        <div className="mg-list" role="radiogroup" aria-label={t("mg.pick")}>
          {shown.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={into === p.id} className="mg-opt" onClick={() => setInto(p.id)}>
              <span className="mg-tick" aria-hidden="true">
                {into === p.id ? <Check size={18} strokeWidth={3} /> : null}
              </span>
              <b>{p.name}</b>
            </button>
          ))}
          {shown.length === 0 ? <p className="t-small">{t("mg.none")}</p> : null}
        </div>
        {target ? <p className="panel-soft mg-what">{mergeWhat(name, target.name, i18n)}</p> : null}
        {state === "failed" ? (
          <p className="res-err" role="alert">
            {t("mg.err")}
          </p>
        ) : null}
        <Button variant="red" wide disabled={!target || state === "saving"} onClick={merge}>
          {state === "saving" ? t("mg.saving") : t("mg.go")}
        </Button>
      </div>
    </Sheet>
  );
}

type Photo = { key: string; file: File | null };

/**
 * The reminder's picture: his unpaid handwritten lines stacked into one JPEG (GET /api/crops).
 * Fetched when the sheet opens, so the share call can run straight from his tap: browsers only
 * allow sharing during the tap itself.
 */
function useReminderPhoto(recordIds: readonly string[] | null) {
  const key = recordIds && recordIds.length > 0 ? recordIds.join(",") : null;
  const [photo, setPhoto] = useState<Photo | null>(null);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/crops?records=${key}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        setPhoto({ key, file: new File([blob], "khata.jpg", { type: "image/jpeg" }) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhoto({ key, file: null });
      });
    return () => controller.abort();
  }, [key]);
  const current = key && photo?.key === key ? photo : null;
  return { file: current?.file ?? null, failed: current !== null && current.file === null, loading: key !== null && current === null };
}

/** How many of the attached lines the sheet shows as strips; the rest are counted. */
const PREVIEW_LINES = 3;

/**
 * A polite reminder with the unpaid handwritten lines attached as one picture. Nothing is sent
 * from here: "send" opens the phone's share menu (Web Share API) and he picks the app; without
 * it, the text is copied. He can change the message before sending.
 */
export function ReminderSheet({
  open,
  onClose,
  name,
  shopName,
  balancePoisha,
  lastPaymentDate,
  lines,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  shopName: string | null;
  balancePoisha: number;
  lastPaymentDate: string | null;
  /** Unpaid lines that have a photo, newest last: the picture's contents. */
  lines: readonly LineDetail[];
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const photo = useReminderPhoto(open ? lines.map((l) => l.id) : null);
  const withPhoto = lines.length > 0 && !photo.failed;
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? reminderLines({ name, shopName, balancePoisha, lastPaymentDate, withPhoto }, i18n).join("\n");
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [note, setNote] = useState<MessageKey | null>(null);

  const copyText = () =>
    navigator.clipboard
      ? navigator.clipboard.writeText(text).then(
          () => true,
          () => false,
        )
      : Promise.resolve(false);

  const copy = async () => setCopied((await copyText()) ? "ok" : "failed");

  const send = async () => {
    const data: ShareData = { text };
    if (photo.file && navigator.canShare?.({ files: [photo.file] })) data.files = [photo.file];
    if (typeof navigator.share !== "function") {
      setNote((await copyText()) ? "rm.noShare" : "rm.copyFail");
      return;
    }
    setNote("rm.opened");
    try {
      await navigator.share(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setNote(null);
      else setNote((await copyText()) ? "rm.noShare" : "rm.copyFail");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label={t("rm.title")}>
      <div className="sh-body">
        <SheetHead title={t("rm.title")} onClose={onClose} />
        <label className="rm-field">
          <span className="t-small">{t("rm.to", objectiveName(name, i18n))}</span>
          <textarea
            className="rm-msg"
            lang={i18n.locale}
            rows={6}
            value={text}
            onChange={(e) => {
              setEdited(e.target.value);
              setCopied(null);
            }}
            aria-describedby="rm-msg-hint"
          />
          <span id="rm-msg-hint" className="sr-only">
            {t("rm.msg")}
          </span>
        </label>
        {lines.length === 0 || photo.failed ? (
          <p className="panel-soft rm-none">{photo.failed ? t("rm.attFail") : t("rm.attNone")}</p>
        ) : (
          <div className="rm-att">
            <div className="rm-att-h">
              <span>{photo.loading ? t("rm.attLoading") : t("rm.att")}</span>
              <span>{t("rm.attN", lines.length)}</span>
            </div>
            {lines.slice(0, PREVIEW_LINES).map((line) => (
              <DetailStrip key={line.id} line={line} height={44} tag={false} />
            ))}
            {lines.length > PREVIEW_LINES ? <span className="t-small rm-more">{t("rm.attMore", lines.length - PREVIEW_LINES)}</span> : null}
          </div>
        )}
        <div className="rm-acts">
          <Button variant="line" onClick={copy}>
            {copied === "ok" ? t("rm.copied") : t("rm.copy")}
          </Button>
          <Button variant="red" disabled={photo.loading} onClick={send}>
            {t("rm.send")}
          </Button>
        </div>
        {copied === "failed" ? (
          <p className="res-err" role="alert">
            {t("rm.copyFail")}
          </p>
        ) : null}
        <p className="t-small rm-note" aria-live="polite">
          {t(note ?? "rm.note")}
        </p>
      </div>
    </Sheet>
  );
}
