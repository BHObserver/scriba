import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cx } from "@/components/ui";

export type ButtonVariant = "red" | "line" | "ghost";

const classes = (variant: ButtonVariant, wide?: boolean, className?: string) =>
  cx("btn", variant === "red" && "btn-red", variant === "line" && "btn-line", variant === "ghost" && "btn-ghost", wide && "w-full", className);

/** 56 px pill. Red is the primary action; a destructive red button must say exactly what happens. */
export function Button({ variant = "line", wide, className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; wide?: boolean }) {
  return <button type={type} {...props} className={classes(variant, wide, className)} />;
}

export function ButtonLink({ variant = "line", wide, className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; wide?: boolean }) {
  return <Link {...props} className={classes(variant, wide, className)} />;
}

/** Two buttons side by side; `stack` puts the primary (last child) on top, full width (for long English labels). */
export function ButtonRow({ stack, children }: { stack?: boolean; children: React.ReactNode }) {
  return <div className={cx("btn-row", stack && "stack")}>{children}</div>;
}
