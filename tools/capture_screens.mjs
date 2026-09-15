// Capture the three HOW-IT-WORKS screenshots from the live demo.
// Runs the real pipeline once (~1¢, one rate slot). node tools/capture_screens.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = new URL("../docs/img/native/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
await page.goto("https://jobscout.page/", { waitUntil: "networkidle" });
// smooth scrolling races element screenshots (the capture lands mid-scroll)
await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; });
await page.waitForTimeout(1500);

await page.locator(".chooser").screenshot({ path: OUT + "01-candidate.png" });
console.log("01-candidate.png");

await page.click("#runBtn");
await page.waitForSelector(".scard.in", { timeout: 120000 });
await page.waitForTimeout(3000);
await page.locator("#gatesStage").scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);   // the gates animate in on scroll
// The band is full-bleed (wider than the viewport, curved bottom), and an
// element screenshot of an oversize box composites wrongly — clip the page to
// the band's rows at viewport width instead, with the fixed header hidden.
const band = await page.evaluate(() => {
  const b = document.querySelector("#gatesStage").getBoundingClientRect();
  document.querySelector("header").style.visibility = "hidden";
  return { y: b.top + scrollY, h: b.height };
});
await page.screenshot({ path: OUT + "02-gates.png", fullPage: true, clip: { x: 0, y: band.y, width: 1180, height: band.h } });
await page.evaluate(() => { document.querySelector("header").style.visibility = ""; });
console.log("02-gates.png");

const first = page.locator(".scard").first();
await first.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await first.screenshot({ path: OUT + "03-score-rose.png" });
console.log("03-score-rose.png");

await browser.close();
console.log("done");
