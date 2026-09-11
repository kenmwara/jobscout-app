// Capture the three HOW-IT-WORKS screenshots from the live demo.
// Runs the real pipeline once (~1¢, one rate slot). node tools/capture_screens.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = new URL("../docs/img/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
await page.goto("https://www.jobscout.tbot.trade/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.locator(".chooser").screenshot({ path: OUT + "01-candidate.png" });
console.log("01-candidate.png");

await page.click("#runBtn");
await page.waitForSelector(".scard.in", { timeout: 120000 });
await page.waitForTimeout(3000);
await page.locator("#gatesStage").screenshot({ path: OUT + "02-gates.png" });
console.log("02-gates.png");

const first = page.locator(".scard").first();
await first.screenshot({ path: OUT + "03-score-rose.png" });
console.log("03-score-rose.png");

await browser.close();
console.log("done");
