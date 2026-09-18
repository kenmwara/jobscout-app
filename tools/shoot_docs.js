/* Re-shoot every doc screenshot from the live site.
 *
 * Run from the repo root: node tools/shoot_docs.js
 * (Node resolves `playwright` from the script's own directory upward, so it must live in
 *  the repo, not in a scratch folder — that was the first failure.)
 *
 * Two runs hit the live scoring API (about a cent each) because the gates and the score card
 * cannot be photographed without real results, and a staged screenshot in a doc that boasts
 * about not staging anything would be a poor joke.
 *
 * The chooser shots light the card marks first: at rest all three rings are grey and the
 * picture says nothing about what the cursor does.
 */
const { chromium } = require("playwright");
const path = require("path");

const OUT = path.join(__dirname, "..", "docs", "img");
const VIEW = { width: 1280, height: 1000 };

const lightCards = () =>
  document.querySelectorAll(".setupcard").forEach(c => c.classList.add("on"));

async function settle(page, ms = 2500) {
  await page.waitForSelector(".setupcard", { timeout: 20000 });
  await page.waitForTimeout(ms);
}

(async () => {
  const b = await chromium.launch();

  // ── the two market landings, side by side in the README ────────────────────────────────
  for (const [url, file] of [
    ["https://jobscout.page/?doc=1", "web-canada.png"],
    ["https://nairobi.jobscout.page/?doc=1", "web-kenya.png"],
  ]) {
    const page = await b.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle" });
    await settle(page);
    await page.evaluate(lightCards);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log("shot", file);
    await page.close();
  }

  // ── the chooser on its own, for step 1 of the brief ────────────────────────────────────
  {
    const page = await b.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
    await page.goto("https://jobscout.page/?doc=1", { waitUntil: "networkidle" });
    await settle(page);
    await page.evaluate(lightCards);
    await page.waitForTimeout(900);
    await (await page.$(".chooser")).screenshot({ path: path.join(OUT, "web-chooser.png") });
    console.log("shot web-chooser.png");
    await page.close();
  }

  // ── a phone ────────────────────────────────────────────────────────────────────────────
  {
    const page = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.goto("https://jobscout.page/?doc=1", { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: path.join(OUT, "web-mobile.png") });
    console.log("shot web-mobile.png");
    await page.close();
  }

  // ── a real run: the gates and one score card ───────────────────────────────────────────
  {
    const page = await b.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
    await page.goto("https://jobscout.page/?doc=1", { waitUntil: "networkidle" });
    await settle(page);
    await page.evaluate(() => document.querySelectorAll(".chip")[0].click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector("#runBtn").click());
    await page.waitForSelector(".scard", { timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll(".scard").length >= 8, { timeout: 120000 });
    await page.waitForTimeout(2000);

    await (await page.$(".scard")).screenshot({ path: path.join(OUT, "web-score-rose.png") });
    console.log("shot web-score-rose.png");

    // The whole #gatesStage is far taller than the viewport and runs full-bleed, so shooting
    // the element gives a mostly-empty canvas with the sticky header stamped across it. Shoot
    // the three gate cards plus the first verdicts, with the header out of the way.
    await page.addStyleTag({ content: "header{display:none!important}" });
    const gates = await page.$("#gatesStage .wrap");
    if (gates) {
      await gates.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1400);   // the gate frames rise on an IntersectionObserver
      await page.evaluate(() => {
        // trim the shot to the cards and the first six verdicts
        const more = document.querySelector("#gateMore");
        if (more) more.style.display = "none";
        const btn = [...document.querySelectorAll("#gatesStage button")].find(b => /other/i.test(b.textContent));
        if (btn) btn.style.display = "none";
      });
      await page.waitForTimeout(300);
      await gates.screenshot({ path: path.join(OUT, "web-gates.png") });
      console.log("shot web-gates.png");
    } else console.log("!! gates wrap not found");
    await page.close();
  }

  await b.close();
})();
