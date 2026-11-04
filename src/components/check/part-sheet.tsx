"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Button, Sheet } from "@/components/kit";
import { useI18n } from "@/lib/i18n/client";
import type { BlockKind, BlockValues } from "@/lib/ledger/types";
import { PART_KINDS, partHasRep, partNeedsName } from "./ask-model";

/**
 * What a part is, set by him (F2 fix 9): opened from the part's name on the numbers screen. He
 * picks its kind, writes the name when it is someone's credit or a company's visit, and saves; its
 * lines change to match. Or he joins it to the part above, when the reading split one part in two.
 * Splitting a part is on each line's fix sheet ("a separate part from here").
 */
export function PartSheet({
  block,
  canJoin,
  busy,
  onKind,
  onJoin,
  onClose,
}: {
  block: BlockValues | null;
  canJoin: boolean;
  busy: boolean;
  onKind: (kind: BlockKind, name: string | null, rep: string | null) => void;
  onJoin: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={block != null} onClose={onClose} label={t("asks.pt.title")}>
      {block ? <PartBody key={block.id} block={block} canJoin={canJoin} busy={busy} onKind={onKind} onJoin={onJoin} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PartBody({ block, canJoin, busy, onKind, onJoin, onClose }: { block: BlockValues; canJoin: boolean; busy: boolean; onKind: (kind: BlockKind, name: string | null, rep: string | null) => void; onJoin: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<BlockKind>(block.kind);
  const [name, setName] = useState(block.party ?? "");
  const [rep, setRep] = useState(block.person ?? "");
  const kinds = PART_KINDS.includes(block.kind) ? PART_KINDS : [...PART_KINDS, block.kind];
  const needsName = partNeedsName(kind);
  const hasRep = partHasRep(kind);
  const changed =
    kind !== block.kind || (needsName && name.trim() !== (block.party ?? "").trim()) || (hasRep && rep.trim() !== (block.person ?? "").trim());
  return (
    <div className="as-sheet">
      <div className="as-sheet-head">
        <span className="t-sec">{t("asks.pt.title")}</span>
        <button type="button" className="back" onClick={onClose} aria-label={t("close")}>
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <p className="t-body">{t("asks.pt.sub")}</p>
      <div className="ty-list">
        {kinds.map((k) => (
          <Button key={k} variant={kind === k ? "red" : "line"} disabled={busy} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`q.kind.${k}`)}
          </Button>
        ))}
      </div>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!changed || (needsName && !name.trim())) return;
          onKind(kind, needsName ? name.trim() : null, hasRep ? rep.trim() : null);
        }}
      >
        {needsName ? (
          <label className="grid gap-1">
            <span className="t-small">{t(kind === "customer_account" ? "asks.pt.name.customer" : "asks.pt.name.supplier")}</span>
            <input className="as-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
        ) : null}
        {hasRep ? (
          <label className="grid gap-1">
            <span className="t-small">{t("asks.pt.rep")}</span>
            <input className="as-input" value={rep} maxLength={80} onChange={(e) => setRep(e.target.value)} />
          </label>
        ) : null}
        <Button type="submit" variant="red" wide disabled={busy || !changed || (needsName && !name.trim())}>
          {t("asks.pt.save")}
        </Button>
      </form>
      {canJoin ? (
        <div className="grid gap-1">
          <Button variant="line" wide disabled={busy} onClick={onJoin}>
            {t("asks.pt.join")}
          </Button>
          <p className="as-hint">{t("asks.pt.joinSub")}</p>
        </div>
      ) : null}
    </div>
  );
}
