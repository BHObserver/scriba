import { readFile } from "node:fs/promises";
import path from "node:path";

const NAME_RE = /^(S\d{2}(-upright)?|V\d{2}(\.flat)?|M\d{2}|P\d)\.jpg$/;

/**
 * Development only: serves one of the author's private test photos to the /kit/check board. The
 * folder is git-ignored and never deployed; in production this route does not exist.
 */
export async function GET(_request: Request, ctx: RouteContext<"/kit/photo/[name]">) {
  const { name } = await ctx.params;
  if (process.env.NODE_ENV === "production" || !NAME_RE.test(name)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "private-test-data", /^[VMP]/.test(name) ? "v3" : "ledger-snippets", name));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
