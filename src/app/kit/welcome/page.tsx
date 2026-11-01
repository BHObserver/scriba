import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { WelcomeFlow } from "@/components/more/welcome-flow";
import { welcomeStep } from "@/components/more/welcome-steps";

export const metadata = { title: "Kit · Welcome" };
export const viewport: Viewport = { themeColor: "#972622" };

/**
 * Development only: the welcome flow without an account, `?step=welcome|how|shop|cash`, for
 * design review and screenshots. Its last step can't save (no one is signed in), which shows the
 * error state.
 */
export default async function KitWelcomePage({ searchParams }: PageProps<"/kit/welcome">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { step } = await searchParams;
  const start = welcomeStep(step);
  return (
    <main className="column welcome pt-[7px]">
      <WelcomeFlow key={start} start={start} />
    </main>
  );
}
