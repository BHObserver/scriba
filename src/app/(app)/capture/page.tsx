import type { Viewport } from "next";
import { CaptureScreen } from "@/components/capture/capture-screen";
import { getLimitsConfig } from "@/lib/config";
import { requireUser } from "@/lib/server/auth";

export const metadata = { title: "Capture" };
// The camera screen is dark; the browser chrome follows it.
export const viewport: Viewport = { themeColor: "#2a2622" };

/** The camera. Taking photos stores nothing: pages are uploaded and read only after "read". */
export default async function CapturePage() {
  const { user } = await requireUser("/capture");
  return <CaptureScreen userId={user.id} maxUploadBytes={getLimitsConfig().maxUploadBytes} />;
}
