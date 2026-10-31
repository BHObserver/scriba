import type { ReactNode } from "react";

/** A CSS-drawn ruled page / people / search icon, a title, one or two sentences, at most one action. */
export function EmptyState({ icon = "page", title, body, action }: { icon?: "page" | "people" | "search"; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <section className="card em">
      <i className={`em-ic em-${icon}`} aria-hidden="true" />
      <h2 className="t-sec">{title}</h2>
      {body ? <p className="t-body em-b">{body}</p> : null}
      {action ? <div className="em-act">{action}</div> : null}
    </section>
  );
}
