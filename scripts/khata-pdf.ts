/**
 * Prints the Scriba khata page (scripts/khata/page.html) to the PDFs the app serves, with the
 * installed Microsoft Edge:
 *
 *   public/khata.pdf     one A5 page
 *   public/khata-a4.pdf  two A5 pages on one A4 landscape sheet, to cut in half
 *
 *   bun run khata:pdf [--png <dir>]
 *
 * Run it after changing the page and commit both PDFs. It needs the network once, for the Bangla
 * fonts, which end up embedded in the PDFs; it stops rather than print with a fallback font.
 * --png also writes screenshots of both layouts for a visual check (a scratchpad, not the repo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright-core";

const root = join(import.meta.dir, "..");
const PAGE = pathToFileURL(join(root, "scripts", "khata", "page.html")).href;
const A5 = join(root, "public", "khata.pdf");
const A4 = join(root, "public", "khata-a4.pdf");

const MM = 96 / 25.4;

async function open(page: Page) {
  await page.goto(PAGE, { waitUntil: "networkidle" });
  const fontsOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('600 9pt "Anek Bangla"', "তারিখ") && document.fonts.check('700 13pt "Noto Serif Bengali"', "খাতা");
  });
  if (!fontsOk) throw new Error("The Bangla fonts did not load (is the network up?). No PDF was written.");
}

/** Pages in a PDF Chromium wrote: one "/Type /Page" object each. */
function pageCount(path: string): number {
  return (readFileSync(path, "latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

async function main() {
  const argv = process.argv.slice(2);
  const pngDir = argv.includes("--png") ? argv[argv.indexOf("--png") + 1] : null;

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: Math.ceil(297 * MM), height: Math.ceil(210 * MM) }, deviceScaleFactor: 2 });
    await page.emulateMedia({ media: "print" });

    await open(page);
    await page.pdf({ path: A5, format: "A5", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    if (pngDir) await page.locator(".sheet").screenshot({ path: join(pngDir, "khata-a5.png") });

    await page.evaluate(() => {
      const sheet = document.querySelector(".sheet")!;
      sheet.after(sheet.cloneNode(true));
      document.body.classList.add("two-up");
    });
    await page.pdf({ path: A4, format: "A4", landscape: true, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    if (pngDir) await page.locator("body").screenshot({ path: join(pngDir, "khata-a4.png") });

    for (const [path, want] of [[A5, 1], [A4, 1]] as const) {
      const pages = pageCount(path);
      if (pages !== want) throw new Error(`${path} has ${pages} pages; expected ${want}. The page no longer fits its paper.`);
    }
    console.log(`Wrote ${A5} and ${A4} (one page each).`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
