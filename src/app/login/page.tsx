import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        Scriba
      </Link>
      <h1 className="text-lg font-semibold">Sign in to your ledgers</h1>
      <p className="mb-6 mt-1 text-sm text-ink-soft">
        Your photographs and records are private to your account.
      </p>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
