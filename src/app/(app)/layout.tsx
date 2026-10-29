import Link from "next/link";
import { requireUser } from "@/lib/server/auth";

const NAV = [
  { href: "/documents", label: "Documents" },
  { href: "/records", label: "Confirmed records" },
  { href: "/evaluation", label: "Evaluation & usage" },
  { href: "/settings", label: "Settings" },
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/documents" className="text-lg font-semibold tracking-tight">
            Scriba
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-2 py-1 text-ink-soft hover:bg-paper hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-ink-soft">
            <span className="hidden sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded px-2 py-1 hover:bg-paper hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-rule py-4 text-center text-xs text-ink-soft">
        AI proposes. Code verifies. A human decides. Readings by a Meta model can be wrong; check every entry against the photo.
      </footer>
    </div>
  );
}
