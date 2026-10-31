import type { Viewport } from "next";
import { LanguageChoice } from "@/components/shell/language-choice";
import { getI18n } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export const viewport: Viewport = { themeColor: "#972622" };

/** Sign-in opens the halkhata: the red cover, the language choice, the form, and how Scriba works. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const { t, digits } = await getI18n();
  const steps = [
    [t("how.1.t"), t("how.1.b")],
    [t("how.2.t"), t("how.2.b")],
    [t("how.3.t"), t("how.3.b")],
  ] as const;
  return (
    <div className="column pb-10 pt-[7px]">
      <header className="cloth ob-cloth">
        <span className="ob-kicker">{t("ob.kicker")}</span>
        <h1 className="ob-mark">{t("app.name")}</h1>
        <p className="ob-title">{t("ob.title")}</p>
      </header>
      <div className="pad grid gap-4 pt-6">
        <span className="t-label">{t("ob.lang")}</span>
        <LanguageChoice />
        <section className="card mt-2 grid gap-4 p-5">
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </section>
        <p className="t-small text-center">{t("login.private")}</p>
        <section className="grid gap-4 pt-4">
          <h2 className="t-sec">{t("how.title")}</h2>
          <ol className="how">
            {steps.map(([title, body], i) => (
              <li key={title}>
                <span className="how-n" aria-hidden="true">{digits(String(i + 1))}</span>
                <div>
                  <p className="text-[19px] font-semibold leading-snug">{title}</p>
                  <p className="t-small">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
