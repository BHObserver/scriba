"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OrientedImage } from "@/components/photo-orientation";
import { Button, Card, CardHeader, Notice, Pill, StatusBadge, cx } from "@/components/ui";
import { type QuarterTurns, describeTurns } from "@/lib/images/orientation";
import {
  type EntryValues,
  LEDGER_TYPES,
  LEDGER_TYPE_LABELS,
  type PageValues,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/ledger/types";
import { formatQuantity, formatTaka, normalizeDate, type ParsedNumber } from "@/lib/numerals";
import { type Acknowledgements, ackFingerprint, assessEntry, decideApproval } from "@/lib/review/approval";
import { type PageState, type ReviewRow, toValidationInput, wasCorrected } from "@/lib/review/state";
import { EMPTY_ENTRY, remainingReviewFields } from "@/lib/review/values";
import { type Finding, RULE_LABELS, deriveNumbers, diffFindings, findingsForEntry, validateLedger } from "@/lib/validation/engine";

type Props = {
  runId: string;
  imageUrl: string | null;
  /** Stored pixel size of the original. */
  imageSize: { width: number; height: number };
  /** The orientation this run was analyzed in, so line boxes line up. */
  imageTurns: QuarterTurns;
  initialRows: ReviewRow[];
  initialPage: PageState;
  warnings: string[];
  legibility: string | null;
};

const NO_ACK: Acknowledgements = { findings: [], uncheckable: false };

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function NumberPreview({ parsed, kind }: { parsed: ParsedNumber | null; kind: "money" | "qty" }) {
  if (!parsed) return <span className="text-ink-soft">—</span>;
  if (!parsed.ok) return <span className="text-fail">unreadable ({parsed.reason.replaceAll("_", " ")})</span>;
  return <span className="text-ink-soft">= {kind === "money" ? formatTaka(parsed.value) : formatQuantity(parsed.value)}</span>;
}

export function ReviewWorkspace({ runId, imageUrl, imageSize, imageTurns, initialRows, initialPage, warnings, legibility }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [drafts, setDrafts] = useState<Record<string, EntryValues>>({});
  const [pageDraft, setPageDraft] = useState<PageValues | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acks, setAcks] = useState<Record<string, Acknowledgements>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [snapshot, setSnapshot] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string[]>>({});
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);

  // Record when the human review started (first opening only), for time-per-page metrics.
  useEffect(() => {
    if (!initialPage.reviewStartedAt) {
      void fetch(`/api/runs/${runId}/page`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markReviewStarted: true }),
      });
    }
  }, [runId, initialPage.reviewStartedAt]);

  // Current state, including unsaved edits. All checks run locally; nothing calls Meta.
  const effectiveRows = useMemo(
    () =>
      rows.map((r) => {
        const d = drafts[r.id];
        return d ? { ...r, values: d, reviewFields: remainingReviewFields(r.reviewFields, r.values, d) } : r;
      }),
    [rows, drafts],
  );
  const effectivePage = useMemo(() => ({ ...page, values: pageDraft ?? page.values }), [page, pageDraft]);
  const input = useMemo(() => toValidationInput({ page: effectivePage, rows: effectiveRows }), [effectivePage, effectiveRows]);
  const findings = useMemo(() => validateLedger(input), [input]);
  const entryById = useMemo(() => new Map(input.entries.map((e) => [e.id, e])), [input]);
  const changes = useMemo(() => (snapshot ? diffFindings(snapshot, findings) : []), [snapshot, findings]);
  const changedKeys = new Set(changes.map((c) => c.key));
  const dirty = Object.keys(drafts).length > 0 || pageDraft != null;

  function beginEdit() {
    if (!dirty) setSnapshot(findings);
  }

  function editRow(id: string, patch: Partial<EntryValues>) {
    beginEdit();
    const base = drafts[id] ?? rows.find((r) => r.id === id)!.values;
    setDrafts((d) => ({ ...d, [id]: { ...base, ...patch } }));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  function editPage(patch: Partial<PageValues>) {
    beginEdit();
    setPageDraft((p) => ({ ...(p ?? page.values), ...patch }));
  }

  async function call(path: string, method: string, body: unknown) {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Request failed.");
    return json;
  }

  async function saveRow(row: ReviewRow, extra: Record<string, unknown> = {}) {
    setBusy(row.id);
    setError(null);
    try {
      const updated = await call(`/api/reviews/${row.id}`, "PATCH", {
        expectedVersion: row.version,
        ...(drafts[row.id] ? { values: drafts[row.id] } : {}),
        ...extra,
      });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      setDrafts((d) => withoutKey(d, row.id));
      setAcks((a) => ({ ...a, [row.id]: NO_ACK }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function savePage() {
    if (!pageDraft) return;
    setBusy("page");
    setError(null);
    try {
      const updated = await call(`/api/runs/${runId}/page`, "PATCH", { expectedVersion: page.version, values: pageDraft });
      setPage(updated);
      setPageDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function addRow(afterId: string | null) {
    setBusy("add");
    setError(null);
    try {
      const row: ReviewRow = await call(`/api/runs/${runId}/rows`, "POST", { afterId, values: EMPTY_ENTRY });
      setRows((rs) => [...rs, row].sort((a, b) => a.lineOrder - b.lineOrder));
      setFocusId(row.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add a line.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmSelected() {
    setBusy("confirm");
    setError(null);
    setProblems({});
    try {
      const entries = [...selected].map((id) => ({
        id,
        expectedVersion: rows.find((r) => r.id === id)!.version,
        acknowledgements: acks[id] ?? NO_ACK,
      }));
      const res = await fetch(`/api/runs/${runId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 422 && Array.isArray(body.problems)) {
        setProblems(Object.fromEntries(body.problems.map((p: { id: string; reasons: string[] }) => [p.id, p.reasons])));
        throw new Error(body.error);
      }
      if (!res.ok) throw new Error(body.error ?? "Confirmation failed. Nothing was saved.");
      setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, status: "confirmed" } : r)));
      setConfirmedCount(body.confirmed);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirmation failed. Nothing was saved.");
    } finally {
      setBusy(null);
    }
  }

  const ledgerFindings = findings.filter((f) => ["balance_equation", "written_total", "running_balance"].includes(f.ruleId));
  const counts = {
    fail: findings.filter((f) => f.status === "fail").length,
    attention: findings.filter((f) => f.status === "unverifiable" && f.severity !== "info").length,
    unverifiable: findings.filter((f) => f.status === "unverifiable" && f.severity === "info").length,
    pass: findings.filter((f) => f.status === "pass").length,
  };
  const focusRow = rows.find((r) => r.id === focusId) ?? null;
  const box = focusRow?.candidate?.bbox ?? null;
  const pageDate = normalizeDate(effectivePage.values.dateText);

  const readyIds = rows
    .filter((r) => r.status === "draft" && !drafts[r.id])
    .filter((r) => {
      const e = entryById.get(r.id);
      return e && assessEntry(e, findings).blockers.length === 0;
    })
    .map((r) => r.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Source evidence */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader
            title="Original photograph"
            subtitle={
              imageTurns === 0
                ? "Shown unaltered. Compare every line with the handwriting."
                : `Shown ${describeTurns(imageTurns)}, as it was analyzed. The stored original is unchanged.`
            }
            action={
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
                Line boxes
              </label>
            }
          />
          <div className="p-3">
            {imageUrl ? (
              <OrientedImage src={imageUrl} alt="Original ledger photograph" turns={imageTurns} size={imageSize}>
                {showBoxes && box ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute rounded-sm border-2 border-accent bg-accent/10"
                    style={{
                      left: `${box.x_min / 10}%`,
                      top: `${box.y_min / 10}%`,
                      width: `${(box.x_max - box.x_min) / 10}%`,
                      height: `${(box.y_max - box.y_min) / 10}%`,
                    }}
                  />
                ) : null}
              </OrientedImage>
            ) : (
              <Notice tone="warn">The photograph could not be loaded.</Notice>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              {focusRow && !box ? "No reliable position for this line; use the whole photo. " : ""}
              Line boxes are the model&apos;s estimate and may be imprecise.{" "}
              {imageUrl ? (
                <a href={imageUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Open full size
                </a>
              ) : null}
            </p>
          </div>
        </Card>
      </div>

      {/* Review */}
      <div className="space-y-4">
        <Notice tone="info">
          These readings come from an AI model and can be wrong. Consistent arithmetic does not prove the handwriting was read
          correctly. Only lines you confirm become Scriba records.
        </Notice>
        {warnings.length > 0 || (legibility && legibility !== "clear") ? (
          <Notice tone="warn">
            <p className="font-medium">Reading notes{legibility && legibility !== "clear" ? ` (legibility: ${legibility.replace("_", " ")})` : ""}</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((w) => (
                <li key={w} className="bn">{w}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {error ? <Notice tone="fail">{error}</Notice> : null}
        {confirmedCount != null ? (
          <Notice tone="pass">{confirmedCount} line(s) confirmed into Scriba records. This is not an accounting posting.</Notice>
        ) : null}

        <Card>
          <CardHeader
            title="Ledger checks"
            subtitle={`${counts.fail} mismatch · ${counts.attention} need a look · ${counts.unverifiable} not checkable · ${counts.pass} consistent`}
          />
          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="block text-xs font-medium text-ink-soft">Account convention</span>
                <select
                  className="mt-1 w-full rounded-md border border-rule bg-card px-2 py-1.5"
                  value={effectivePage.values.ledgerType}
                  onChange={(e) => editPage({ ledgerType: e.target.value as PageValues["ledgerType"] })}
                >
                  {LEDGER_TYPES.map((t) => (
                    <option key={t} value={t}>{LEDGER_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-ink-soft">Account / customer</span>
                <input
                  lang="bn"
                  className="bn mt-1 w-full rounded-md border border-rule bg-card px-2 py-1"
                  value={effectivePage.values.accountName ?? ""}
                  onChange={(e) => editPage({ accountName: e.target.value || null })}
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-ink-soft">Date as written {pageDate ? `(= ${pageDate})` : ""}</span>
                <input
                  lang="bn"
                  className="bn mt-1 w-full rounded-md border border-rule bg-card px-2 py-1"
                  value={effectivePage.values.dateText ?? ""}
                  onChange={(e) => editPage({ dateText: e.target.value || null })}
                />
              </label>
            </div>
            {pageDraft ? (
              <div className="flex gap-2">
                <Button variant="primary" onClick={savePage} disabled={busy != null}>Save page details</Button>
                <Button onClick={() => setPageDraft(null)}>Discard</Button>
              </div>
            ) : null}

            {ledgerFindings.length === 0 ? (
              <p className="text-sm text-ink-soft">No totals or balances on this page to check.</p>
            ) : (
              <ul className="space-y-2">
                {ledgerFindings.map((f) => (
                  <li
                    key={f.key}
                    className={cx("rounded-md border px-3 py-2 text-sm", changedKeys.has(f.key) ? "border-accent" : "border-rule")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={f.status} severity={f.severity} />
                      <span className="font-medium">{RULE_LABELS[f.ruleId]}</span>
                      {changedKeys.has(f.key) ? <Pill tone="accent">changed by your edit</Pill> : null}
                    </div>
                    <p className="mt-1">{f.message}</p>
                    {f.expected != null || f.observed != null ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Expected {formatTaka(f.expected)} · Written {formatTaka(f.observed)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {changes.filter((c) => !c.after).length > 0 ? (
              <p className="text-xs text-ink-soft">
                Resolved by your edit: {changes.filter((c) => !c.after).map((c) => c.before!.message).join(" ")}
              </p>
            ) : null}
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Lines ({rows.filter((r) => r.status !== "rejected").length})</h2>
          <Button variant="ghost" onClick={() => addRow(null)} disabled={busy != null}>+ Add a missed line at the top</Button>
        </div>

        <ol className="space-y-3">
          {effectiveRows.map((row, index) => {
            const original = rows[index]!;
            const entry = entryById.get(row.id)!;
            const own = findingsForEntry(findings, row.id).filter((f) => f.entryIds.length === 1 || f.ruleId === "qty_x_rate");
            const assessment = assessEntry(entry, findings);
            const ack = acks[row.id] ?? NO_ACK;
            const decision = decideApproval(entry, findings, ack);
            const isDraft = Boolean(drafts[row.id]);
            const locked = row.status === "confirmed";
            const rejected = row.status === "rejected";
            const numbers = deriveNumbers(row.values);
            const unsure = new Set(row.reviewFields);
            const fieldClass = (f: string) =>
              cx("mt-0.5 w-full rounded border bg-card px-2 py-1 text-sm", unsure.has(f as never) ? "border-warn bg-warn-bg" : "border-rule");
            const aiValue = (key: keyof EntryValues) =>
              row.candidate && row.candidate.values[key] !== row.values[key] ? (
                <span className="block text-[11px] text-ink-soft">AI read: <span className="bn line-through">{String(row.candidate.values[key] ?? "—")}</span></span>
              ) : null;

            return (
              <li key={row.id}>
                <Card className={cx(focusId === row.id && "ring-2 ring-accent/40", rejected && "opacity-60")}>
                  <div
                    className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2"
                    onMouseEnter={() => setFocusId(row.id)}
                    onFocus={() => setFocusId(row.id)}
                  >
                    <span className="text-xs font-semibold text-ink-soft">Line {index + 1}</span>
                    <select
                      aria-label="Transaction type"
                      disabled={locked || rejected}
                      value={row.values.type}
                      onChange={(e) => editRow(row.id, { type: e.target.value as EntryValues["type"] })}
                      className={cx("rounded border bg-card px-1.5 py-0.5 text-sm", unsure.has("type") || row.values.type === "unknown" ? "border-warn" : "border-rule")}
                    >
                      {TRANSACTION_TYPES.map((t) => (
                        <option key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    {!row.candidate ? <Pill tone="accent">added by reviewer</Pill> : wasCorrected(row) ? <Pill tone="accent">corrected</Pill> : null}
                    {row.values.crossedOut ? <Pill tone="warn">crossed out · excluded</Pill> : null}
                    {locked ? <Pill tone="pass">confirmed</Pill> : null}
                    {rejected ? <Pill>rejected · excluded</Pill> : null}
                    <div className="ml-auto flex gap-1">
                      {!locked ? (
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          disabled={busy != null || isDraft}
                          onClick={() => saveRow(original, { status: rejected ? "draft" : "rejected" })}
                        >
                          {rejected ? "Restore" : "Reject line"}
                        </Button>
                      ) : null}
                      {!locked && !rejected ? (
                        <Button variant="ghost" className="px-2 py-1 text-xs" disabled={busy != null} onClick={() => addRow(row.id)}>
                          + Line below
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 p-4" onFocus={() => setFocusId(row.id)}>
                    <label className="block text-xs font-medium text-ink-soft">
                      Text as written
                      <textarea
                        lang="bn"
                        rows={1}
                        disabled={locked || rejected}
                        className={cx("bn mt-0.5 w-full resize-y rounded border bg-card px-2 py-1 text-base text-ink", unsure.has("text") ? "border-warn bg-warn-bg" : "border-rule")}
                        value={row.values.sourceText}
                        onChange={(e) => editRow(row.id, { sourceText: e.target.value })}
                      />
                      {aiValue("sourceText")}
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["item", "item", "Item"],
                          ["customer", "customer", "Customer"],
                          ["quantityText", "qty", "Quantity"],
                          ["unit", "unit", "Unit"],
                          ["rateText", "rate", "Rate"],
                          ["amountText", "amount", "Amount"],
                          ["balanceText", "balance", "Balance"],
                        ] as const
                      ).map(([key, field, label]) => (
                        <label key={key} className="block text-xs font-medium text-ink-soft">
                          {label}
                          {unsure.has(field) ? <span className="text-warn"> · model unsure</span> : null}
                          <input
                            lang="bn"
                            disabled={locked || rejected}
                            className={cx(fieldClass(field), "bn text-ink")}
                            value={(row.values[key] as string | null) ?? ""}
                            onChange={(e) => editRow(row.id, { [key]: e.target.value || null })}
                          />
                          <span className="block text-[11px]">
                            {key === "amountText" ? <NumberPreview parsed={numbers.amount} kind="money" /> : null}
                            {key === "rateText" ? <NumberPreview parsed={numbers.rate} kind="money" /> : null}
                            {key === "balanceText" ? <NumberPreview parsed={numbers.balance} kind="money" /> : null}
                            {key === "quantityText" ? <NumberPreview parsed={numbers.quantity} kind="qty" /> : null}
                          </span>
                          {aiValue(key)}
                        </label>
                      ))}
                      <label className="flex items-center gap-1.5 self-end pb-5 text-xs text-ink-soft">
                        <input
                          type="checkbox"
                          disabled={locked || rejected}
                          checked={row.values.crossedOut}
                          onChange={(e) => editRow(row.id, { crossedOut: e.target.checked })}
                        />
                        Crossed out
                      </label>
                    </div>
                    {row.candidate?.uncertaintyReason ? (
                      <p className="bn text-xs text-ink-soft">Model note: {row.candidate.uncertaintyReason}</p>
                    ) : null}

                    {own.length > 0 ? (
                      <ul className="space-y-1">
                        {own.map((f) => (
                          <li key={f.key} className="flex flex-wrap items-start gap-2 text-sm">
                            <StatusBadge status={f.status} severity={f.severity} />
                            <span className={cx(changedKeys.has(f.key) && "font-medium text-accent")}>{f.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-ink-soft">No arithmetic check applies to this line on its own.</p>
                    )}

                    {isDraft ? (
                      <div className="flex gap-2">
                        <Button variant="primary" onClick={() => saveRow(original)} disabled={busy != null}>
                          {busy === row.id ? "Saving…" : "Save correction"}
                        </Button>
                        <Button onClick={() => setDrafts((d) => withoutKey(d, row.id))} disabled={busy != null}>
                          Discard
                        </Button>
                      </div>
                    ) : null}
                    {!isDraft && !locked && !rejected && row.reviewFields.length > 0 ? (
                      <Button variant="ghost" className="text-xs" disabled={busy != null} onClick={() => saveRow(original, { markChecked: row.reviewFields })}>
                        I checked these fields against the photo
                      </Button>
                    ) : null}

                    {!locked && !rejected && !isDraft ? (
                      <div className="rounded-md bg-paper p-3 text-sm">
                        {assessment.blockers.length > 0 ? (
                          <ul className="list-disc pl-5 text-fail">
                            {assessment.blockers.map((b) => <li key={b}>{b}</li>)}
                          </ul>
                        ) : (
                          <>
                            <label className="flex items-center gap-2 font-medium">
                              <input
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={(e) =>
                                  setSelected((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.add(row.id);
                                    else next.delete(row.id);
                                    return next;
                                  })
                                }
                              />
                              Select this line for confirmation
                            </label>
                            {assessment.needsAck.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-ink-soft">To confirm despite these, tick each one after checking the photo:</p>
                                {assessment.needsAck.map((f) => {
                                  const fp = ackFingerprint(f);
                                  return (
                                    <label key={fp} className="flex items-start gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={ack.findings.includes(fp)}
                                        onChange={(e) =>
                                          setAcks((a) => {
                                            const cur = a[row.id] ?? NO_ACK;
                                            const list = e.target.checked ? [...cur.findings, fp] : cur.findings.filter((x) => x !== fp);
                                            return { ...a, [row.id]: { ...cur, findings: list } };
                                          })
                                        }
                                      />
                                      <span>I accept: {f.message}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}
                            {assessment.uncheckable.length > 0 ? (
                              <label className="mt-2 flex items-start gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={ack.uncheckable}
                                  onChange={(e) => setAcks((a) => ({ ...a, [row.id]: { ...(a[row.id] ?? NO_ACK), uncheckable: e.target.checked } }))}
                                />
                                <span>I understand {assessment.uncheckable.length} check(s) could not be run for this line.</span>
                              </label>
                            ) : null}
                            {selected.has(row.id) && !decision.ok ? (
                              <p className="mt-2 text-xs text-warn">Acknowledge the items above to confirm this line.</p>
                            ) : null}
                          </>
                        )}
                        {problems[row.id] ? (
                          <ul className="mt-2 list-disc pl-5 text-xs text-fail">
                            {problems[row.id]!.map((p) => <li key={p}>{p}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>

        <div className="sticky bottom-0 z-10 -mx-1 rounded-t-lg border border-rule bg-card/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <span className="font-semibold">{selected.size}</span> line(s) selected
              {dirty ? <span className="text-warn"> · save or discard edits first</span> : null}
            </p>
            <Button variant="ghost" onClick={() => setSelected(new Set(readyIds))} disabled={readyIds.length === 0}>
              Select all lines without blockers ({readyIds.length})
            </Button>
            <Button
              variant="primary"
              className="ml-auto"
              disabled={
                selected.size === 0 ||
                dirty ||
                busy != null ||
                [...selected].some((id) => !decideApproval(entryById.get(id)!, findings, acks[id] ?? NO_ACK).ok)
              }
              onClick={confirmSelected}
            >
              {busy === "confirm" ? "Confirming…" : "Confirm selected into Scriba"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
