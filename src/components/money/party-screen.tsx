"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Money, SampleBadge, StatusMark, TopBar } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { Risk } from "@/lib/insights/accounts";
import { riskText } from "@/lib/insights/text";
import type { PartyKind } from "@/lib/ledger/parties";
import type { LineDetail } from "@/lib/server/shop-data";
import { DetailStrip } from "./drill-sheet";
import {
  type LedgerEntryView,
  afterText,
  balanceLabel,
  dateLabel,
  duesHref,
  entryAmount,
  entryText,
  oldestText,
  reminderPhotoIds,
  whenLabel,
} from "./dues-model";
import { MergeSheet, ReminderSheet, RenameSheet } from "./party-sheets";

export type PartyScreenView = {
  asOf: string;
  shopName: string | null;
  sample: boolean;
  party: {
    id: string;
    kind: PartyKind;
    name: string;
    balancePoisha: number;
    risks: Risk[];
    lastPaymentDate: string | null;
    oldestUnpaid: { date: string; leftPoisha: number } | null;
    /** Credits not yet cleared, newest last (the reminder's lines). */
    unpaidRecordIds: string[];
  };
  /** Newest first. */
  entries: LedgerEntryView[];
  /** How many of the newest entries `lines` covers. */
  firstLines: number;
  lines: LineDetail[];
  aliases: Array<{ id: string; name: string }>;
  mergeTargets: Array<{ id: string; name: string }>;
};

const MORE_LINES = 40;

/**
 * A party's ledger: what they owe (or what is owed to them), why it needs a look, the last payment
 * and the oldest unpaid credit, then every credit and payment newest first, each under its own
 * handwriting with the balance after it. Remind (customers) and merge spellings from here.
 */
export function PartyScreen(view: PartyScreenView) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const { party, asOf } = view;
  const kind = party.kind;
  const [extra, setExtra] = useState<LineDetail[]>([]);
  const [count, setCount] = useState(view.firstLines);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  const [sheet, setSheet] = useState<"remind" | "merge" | "rename" | null>(null);
  const [unmerging, setUnmerging] = useState<string | null>(null);
  const [unmergeFailed, setUnmergeFailed] = useState(false);

  const details = new Map([...view.lines, ...extra].map((l) => [l.id, l]));
  const shown = view.entries.slice(0, count);
  const withPhoto = new Set(view.lines.filter((l) => l.strip).map((l) => l.id));
  const photoLines = reminderPhotoIds(party.unpaidRecordIds, withPhoto).flatMap((id) => details.get(id) ?? []);
  const canRemind = kind === "customer" && party.balancePoisha > 0;

  const loadMore = async () => {
    const next = view.entries.slice(count, count + MORE_LINES);
    const ids = next.map((e) => e.recordId).filter((id) => !details.has(id));
    setMore("loading");
    try {
      if (ids.length > 0) {
        const res = await fetch("/api/lines", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { lines: LineDetail[] };
        setExtra((prev) => [...prev, ...body.lines]);
      }
      setCount(count + next.length);
      setMore("idle");
    } catch {
      setMore("failed");
    }
  };

  const unmerge = async (aliasId: string) => {
    setUnmerging(aliasId);
    setUnmergeFailed(false);
    const res = await fetch(`/api/parties/${aliasId}/merge`, { method: "DELETE" }).catch(() => null);
    setUnmerging(null);
    if (!res?.ok) setUnmergeFailed(true);
    else router.refresh();
  };

  return (
    <div className="ledger">
      <TopBar title={party.name} sub={t(`pl.sub.${kind}`)} backHref={duesHref(kind)} right={view.sample ? <SampleBadge /> : undefined} />
      <div className="pad money-body">
        <section className="card pl-hero">
          <div className="stitch" />
          <div className="pl-in">
            <span className="t-label">{balanceLabel(kind, party.name, party.balancePoisha, i18n)}</span>
            <Money poisha={Math.abs(party.balancePoisha)} size="hero" />
            {party.risks.map((r) => (
              <span key={r.code} className="why-look">
                {riskText(r, kind, i18n)}
              </span>
            ))}
            <dl className="pl-facts">
              <div>
                <dt>{t(`pl.lastPay.${kind}`)}</dt>
                <dd>{party.lastPaymentDate ? whenLabel(party.lastPaymentDate, asOf, i18n) : t("pl.none")}</dd>
              </div>
              {party.oldestUnpaid ? (
                <div>
                  <dt>{t(`pl.oldest.${kind}`)}</dt>
                  <dd>{oldestText(party.oldestUnpaid.date, party.oldestUnpaid.leftPoisha, asOf, i18n)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        {!view.sample ? (
          <div className="pl-acts">
            {canRemind ? (
              <Button variant="red" wide onClick={() => setSheet("remind")}>
                {t("pl.remind")}
              </Button>
            ) : null}
            {view.mergeTargets.length > 0 ? (
              <Button variant="ghost" wide onClick={() => setSheet("merge")}>
                {t("pl.merge")}
              </Button>
            ) : null}
            <Button variant="ghost" wide onClick={() => setSheet("rename")}>
              {t("pl.rename")}
            </Button>
          </div>
        ) : null}

        {view.aliases.length > 0 ? (
          <section className="card pl-alias">
            <span className="t-label">{t("pl.alias")}</span>
            {view.aliases.map((a) => (
              <div key={a.id} className="pl-alias-row">
                <span className="pl-alias-name">{a.name}</span>
                <Button variant="line" className="btn-sm" disabled={unmerging !== null} onClick={() => unmerge(a.id)}>
                  {t("pl.unmerge")}
                </Button>
              </div>
            ))}
            {unmergeFailed ? (
              <p className="res-err" role="alert">
                {t("pl.unmergeErr")}
              </p>
            ) : null}
          </section>
        ) : null}

        <h2 className="t-sec tl-h">{t("pl.lines")}</h2>
        {view.entries.length === 0 ? <p className="t-body">{t("pl.empty")}</p> : null}
        <div className="tl">
          {shown.map((e) => {
            const line = details.get(e.recordId);
            return (
              <article key={e.recordId} className="card tl-item">
                <div className="tl-top">
                  <span className="tl-date">{dateLabel(e.date, asOf, i18n)}</span>
                  {e.page ? <span className="t-small">{t("cl.page", e.page)}</span> : null}
                </div>
                <DetailStrip line={line} height={56} />
                <div className="tl-row">
                  <span className="tl-what">{entryText(kind, e, line ?? null, i18n)}</span>
                  <span className="tl-amt">{entryAmount(e, i18n)}</span>
                </div>
                <div className="tl-bal">{afterText(kind, e.balancePoisha, i18n)}</div>
                {/* F2 fix 9: a mistake found here (রহিমা's credit saved as cash) is fixed on its page. */}
                <Link href={`/documents/${e.documentId}`} className="tl-fix">
                  {t("pl.wrong")}
                </Link>
              </article>
            );
          })}
        </div>
        {count < view.entries.length ? (
          more === "failed" ? (
            <div className="look-panel" role="alert">
              <span>{t("dr.error")}</span>
              <Button variant="line" className="btn-sm" onClick={loadMore}>
                {t("dr.retry")}
              </Button>
            </div>
          ) : (
            <Button variant="line" wide disabled={more === "loading"} onClick={loadMore}>
              {more === "loading" ? t("dr.loading") : t("pl.more")}
            </Button>
          )
        ) : null}
        {view.entries.length > 0 ? (
          <div className="dr-foot">
            <StatusMark kind="ok" />
            <span>{t("pl.foot")}</span>
          </div>
        ) : null}
      </div>

      {canRemind ? (
        <ReminderSheet
          open={sheet === "remind"}
          onClose={() => setSheet(null)}
          name={party.name}
          shopName={view.shopName}
          balancePoisha={party.balancePoisha}
          lastPaymentDate={party.lastPaymentDate}
          lines={photoLines}
        />
      ) : null}
      <RenameSheet key={party.name} open={sheet === "rename"} onClose={() => setSheet(null)} partyId={party.id} name={party.name} />
      {view.mergeTargets.length > 0 ? (
        <MergeSheet open={sheet === "merge"} onClose={() => setSheet(null)} partyId={party.id} name={party.name} targets={view.mergeTargets} />
      ) : null}
    </div>
  );
}
