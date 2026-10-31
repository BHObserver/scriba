/**
 * Screenshots a page with the installed Microsoft Edge (there is no Chrome on this
 * machine) and reports console errors and failed requests, for visual checks.
 *
 *   bun run shot <url> [--w 390] [--h 844] [--out path.png] [--full] [--wait 1500] [--login]
 *
 * --login first signs in through /login as the demo shop, using SCRIBA_DEMO_EMAIL and
 * SCRIBA_DEMO_PASSWORD from .env.local. Screenshots belong in a session scratchpad, not
 * the repo. Never pass a URL to this script in a file or message that gets committed.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

function parseArgs(argv: string[]) {
  const opts = { url: "", w: 390, h: 844, out: "", full: false, wait: 1500, login: false };
  const value = (i: number) => argv[i] ?? "";
  for (let i = 0; i < argv.length; i++) {
    const arg = value(i);
    if (arg === "--w") opts.w = Number(value(++i));
    else if (arg === "--h") opts.h = Number(value(++i));
    else if (arg === "--out") opts.out = value(++i);
    else if (arg === "--wait") opts.wait = Number(value(++i));
    else if (arg === "--full") opts.full = true;
    else if (arg === "--login") opts.login = true;
    else if (!arg.startsWith("--")) opts.url = arg;
  }
  if (!opts.url) throw new Error("Usage: bun run shot <url> [--w 390] [--h 844] [--out file.png] [--full] [--wait ms] [--login]");
  if (!opts.out) opts.out = join(tmpdir(), `scriba-shot-${Date.now()}.png`);
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: opts.w, height: opts.h },
      deviceScaleFactor: opts.w <= 500 ? 2 : 1,
      isMobile: opts.w <= 500,
      hasTouch: opts.w <= 500,
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("requestfailed", (req) => failedRequests.push(`${req.failure()?.errorText ?? "failed"} ${req.url()}`));
    page.on("response", (res) => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    if (opts.login) {
      const email = process.env.SCRIBA_DEMO_EMAIL;
      const password = process.env.SCRIBA_DEMO_PASSWORD;
      if (!email || !password) throw new Error("--login needs SCRIBA_DEMO_EMAIL and SCRIBA_DEMO_PASSWORD in .env.local");
      const origin = new URL(opts.url).origin;
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }), page.click('button[type="submit"]')]);
    }

    await page.goto(opts.url, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(opts.wait);
    await page.screenshot({ path: opts.out, fullPage: opts.full });

    console.log(`screenshot: ${opts.out}`);
    console.log(`console errors: ${consoleErrors.length}`);
    for (const e of consoleErrors.slice(0, 10)) console.log(`> ${e.slice(0, 300)}`);
    console.log(`failed requests: ${failedRequests.length}`);
    for (const r of failedRequests.slice(0, 10)) console.log(`> ${r.slice(0, 200)}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
