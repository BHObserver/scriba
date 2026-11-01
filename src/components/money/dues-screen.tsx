"use client";

import Link from "next/link";
import { useState } from "react";
import { ButtonLink, EmptyState, Money, SampleBadge, Segmented } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import { riskText } from "@/lib/insights/text";
import type { PartyKind } from "@/lib/ledger/parties";
import { type DuesRowView, duesHref, quietText } from "./dues-model";

export type DuesView = {
  asOf: string;
  sample: boolean;
  /** The tab the URL asked for. */
  tab: PartyKind;
  /** Riskiest first (the engine's order), and the sum of their balances. */
  lists: Record<PartyKind, { rows: DuesRowView[]; totalPoisha: number }>;
  /** Pages not checked yet, whose lines aren't in any balance. */
  waiting: { count: number; href: string | null };
};

/**
 * বাকি: who owes the shop (পাওনা) and whom the shop owes (দেনা), riskiest first, each with the
 * reason it needs a look or when money last came. Each row opens that party's ledger, where
 * every line of the balance sits under its handwriting.
 */
export function DuesScreen(view: DuesView) {
  const i18n = useI18n();
  const { t } = i18n;
  const [tab, setTab] = useState(view.tab);
  const list = view.lists[tab];
  const pick = (next: PartyKind) => {
    setTab(next);
    // Back from a ledger returns to the same tab.
    window.history.replaceState(null, "", duesHref(next));
  };

  return (
    <div className="dues">
      <div className="pad du-top">
        <div className="du-titlebar">
          <h1 className="t-title">{t("du.title")}</h1>
          {view.sample ? <SampleBadge /> : null}
        </div>
        <Segmented
          options={[
            { value: "customer", label: t("du.customer") },
            { value: "supplier", label: t("du.supplier") },
          ]}
          value={tab}
          onChange={pick}
          label={t("du.kind")}
        />
        {list.rows.length > 0 ? (
          <div className="du-sum">
            <span className="t-label">{t(`du.sum.${tab}`, list.rows.length)}</span>
            <Money poisha={list.totalPoisha} size="hero" />
          </div>
        ) : null}
      </div>
      <div className="pad money-body">
        {view.waiting.count > 0 ? (
          <div className="look-panel">
            <span>{view.waiting.count === 1 ? t("du.waiting.one") : t("du.waiting.many", view.waiting.count)}</span>
            {view.waiting.href ? (
              <ButtonLink href={view.waiting.href} variant="line" className="btn-sm">
                {t("td.waiting")}
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
        {list.rows.length === 0 ? (
          <section className="card">
            {tab === "customer" ? (
              <EmptyState icon="people" title={t("empty.dues.t")} body={t("empty.dues.b")} />
            ) : (
              <EmptyState icon="people" title={t("du.empty.supplier.t")} body={t("du.empty.supplier.b")} />
            )}
          </section>
        ) : (
          <>
            <section className="card du-list">
              {list.rows.map((row) => (
                <Link key={row.partyId} href={`/parties/${row.partyId}`} className="du-row">
                  <span className="du-name">{row.name}</span>
                  <span className="du-amt">{i18n.money(row.balancePoisha)}</span>
                  <span className="du-why">
                    {row.risk ? <span className="why-look">{riskText(row.risk, tab, i18n)}</span> : quietText(tab, row.lastPaymentDate, view.asOf, i18n)}
                  </span>
                </Link>
              ))}
            </section>
            <p className="t-small money-hint">{t(`du.hint.${tab}`)}</p>
          </>
        )}
      </div>
    </div>
  );
}
