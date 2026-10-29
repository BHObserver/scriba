import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { FindingStatus, Severity } from "@/lib/validation/engine";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:bg-accent-strong",
        variant === "secondary" && "border border-rule bg-card text-ink hover:bg-paper",
        variant === "danger" && "border border-fail/30 bg-card text-fail hover:bg-fail-bg",
        variant === "ghost" && "text-ink-soft hover:bg-paper hover:text-ink",
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-rule bg-card", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

const STATUS_STYLES: Record<FindingStatus, string> = {
  pass: "bg-pass-bg text-pass",
  fail: "bg-fail-bg text-fail",
  unverifiable: "bg-unverifiable-bg text-unverifiable",
};

const STATUS_LABELS: Record<FindingStatus, string> = {
  pass: "Consistent",
  fail: "Mismatch",
  unverifiable: "Not checkable",
};

export function StatusBadge({ status, severity }: { status: FindingStatus; severity?: Severity }) {
  const warn = status === "unverifiable" && severity === "warning";
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        warn ? "bg-warn-bg text-warn" : STATUS_STYLES[status],
      )}
    >
      {warn ? "Needs a look" : STATUS_LABELS[status]}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "pass" | "fail" | "warn" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-unverifiable-bg text-unverifiable",
        tone === "pass" && "bg-pass-bg text-pass",
        tone === "fail" && "bg-fail-bg text-fail",
        tone === "warn" && "bg-warn-bg text-warn",
        tone === "accent" && "bg-accent/10 text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "fail" | "pass"; children: ReactNode }) {
  return (
    <div
      role={tone === "fail" ? "alert" : "status"}
      className={cx(
        "rounded-md border px-3 py-2 text-sm",
        tone === "info" && "border-accent/20 bg-accent/5 text-ink",
        tone === "warn" && "border-warn/30 bg-warn-bg text-ink",
        tone === "fail" && "border-fail/30 bg-fail-bg text-ink",
        tone === "pass" && "border-pass/30 bg-pass-bg text-ink",
      )}
    >
      {children}
    </div>
  );
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
