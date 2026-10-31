import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";

/**
 * The Today screen lands here in B4. Until then a signed-in shop goes to its pages, and a
 * signed-out visitor to the sign-in page (which now explains what Scriba does).
 */
export default async function Home() {
  await requireUser("/");
  redirect("/documents");
}
