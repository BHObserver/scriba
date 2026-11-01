import { redirect } from "next/navigation";
import { LearningScreen } from "@/components/more/learning-screen";
import { requireUser } from "@/lib/server/auth";
import { loadLearningPanel } from "@/lib/server/learning-data";
import { loadShopProfile } from "@/lib/server/shop-data";

export const metadata = { title: "Learning your handwriting" };

/** The learning panel (P3), reached from More. Computed from his confirmed lines; nothing is sent to Meta. */
export default async function LearningPage() {
  const { supabase } = await requireUser("/settings/learning");
  const [profile, panel] = await Promise.all([loadShopProfile(supabase), loadLearningPanel(supabase)]);
  if (!profile) redirect("/welcome");
  return <LearningScreen panel={panel} sample={profile.isSample} />;
}
