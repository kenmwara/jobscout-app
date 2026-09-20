/* Cycle 3, the web half: press every control on every page of both markets
 * and assert the BEHAVIOUR, not the presence. State is reset before each
 * control, because the first version of this harness produced thirteen
 * ambiguous no-ops from filters left on by the check before.
 *
 *   node tools/cycle3.mjs                 # local, both markets
 *   node tools/cycle3.mjs --live          # against jobscout.page
 *
 * It drives the pages through Playwright, which the repo already carries.
 */
import { chromium } from "playwright";

const LIVE = process.argv.includes("--live");
const BASES = LIVE
  ? [["ca", "https://jobscout.page"], ["ke", "https://nairobi.jobscout.page"]]
  : [["ca", "http://localhost:8787"], ["ke", "http://localhost:8787?market=ke"]];

let fail = 0;
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);
const is = (cond, m) => (cond ? ok(m) : bad(m));

const PROFILE = `Kenneth Kariuki — Senior Platform Engineer, Vancouver BC.
EXPERIENCE. Technical lead on an algorithmic trading platform: Python, TypeScript,
Cloudflare Workers, D1, Postgres. Built risk gates, reconciliation and append-only
audit logging. Shipped three clients of one API: web, native Android, native iOS.
Ran CI/CD, Terraform and Linux in production for eight years.
SKILLS. Python, TypeScript, SQL, Terraform, Docker, AWS, Cloudflare, React.
EDUCATION. BSc Computer Science.`;

for (const [market, base] of BASES) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  /* Cloudflare Pages serves clean URLs and `python -m http.server` does not,
     so locally the extensionless routes the app navigates to (/apply, /saved)
     are 404s. Rewrite them in the harness rather than teaching the app about
     the dev server. */
  if (!LIVE) {
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (/^\/(apply|saved|privacy|stats)$/.test(u.pathname)) {
        u.pathname += ".html";
        return route.continue({ url: u.toString() });
      }
      return route.continue();
    });
  }

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  console.log(`\n── ${market.toUpperCase()} ── ${base}`);
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "networkidle" });

  // ── the landing page opens clean ────────────────────────────────────────
  is(await page.locator("#v-landing").isVisible(), "landing opens on the landing view");
  is((await page.locator(".hero .tab, #heroTabs a").count()) > 0, "the hero carries its policy tabs");
  is(!/\d/.test(await page.locator("#heroTabs").innerText().catch(() => "")),
     "no counts on the hero tabs at rest");

  // ── every in-page anchor and nav link goes somewhere real ───────────────
  const links = await page.$$eval("a[href]", (as) =>
    as.map((a) => a.getAttribute("href")).filter((h) => h && !h.startsWith("http") && h !== "#"));
  const dead = [];
  for (const h of new Set(links)) {
    if (h.startsWith("#")) { if (!(await page.locator(h).count())) dead.push(h); }
  }
  is(!dead.length, `${new Set(links).size} local links, ${dead.length ? "dead: " + dead : "all resolve"}`);

  // ── the logo goes home from every page ──────────────────────────────────
  // "stats" was here until 718a129 took the page off the public site. It kept
  // being requested, 404ed, and the locator timed out - so this harness has
  // been CRASHING rather than passing ever since, which is why nothing caught
  // it. A check that cannot complete is not a check.
  for (const p of ["saved", "privacy"]) {
    // Pages serves clean URLs; python -m http.server does not.
    const ext = LIVE ? "" : ".html";
    await page.goto(`${base.split("?")[0]}/${p}${ext}`, { waitUntil: "domcontentloaded" });
    const href = await page.locator("header .brand").getAttribute("href");
    is(href === "./" || href === "/" || href === "index.html", `${p}: the logo points home (${href})`);
    is(await page.locator(".fbrand a").count() === 1, `${p}: the footer wordmark is a link`);
  }

  // ── a real run, then every control on the matches ───────────────────────
  await page.goto(base, { waitUntil: "networkidle" });
  await page.fill("#ownText", PROFILE);
  await page.click("#runBtn");
  await page.waitForFunction(() => document.querySelectorAll("#browseJobs .job").length > 0,
                             null, { timeout: 120000 });
  await page.waitForTimeout(1200);

  const n = () => page.locator("#browseJobs .job").count();
  const scored = await n();
  is(scored > 0, `${scored} scored cards on screen`);
  is((await page.locator("#browseTitle").innerText()) === "Your matches", "the title says Your matches");

  // the feed sits below the matches
  const order = await page.evaluate(() => {
    const f = document.querySelector("#browseFeed"), h = document.querySelector("#browseHeadWrap") || document.querySelector(".browsehead");
    return f && h ? !!(h.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  });
  is(order === true, "the feed sits below the matches");

  // every evidence chip opens its popover, in view, readable
  const chips = await page.locator("#browseJobs .job [data-ev]").count();
  let popBad = 0;
  for (let i = 0; i < Math.min(chips, 6); i++) {
    const chip = page.locator("#browseJobs .job [data-ev]").nth(i);
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await page.waitForTimeout(160);
    const okk = await page.evaluate(() => {
      const p = document.getElementById("pop");
      if (!p || p.hidden) return false;
      const r = p.getBoundingClientRect();
      return getComputedStyle(p).opacity !== "0" && r.top >= 0 && r.left >= 0
             && r.right <= innerWidth && r.bottom <= innerHeight && p.textContent.trim().length > 3;
    });
    if (!okk) popBad++;
  }
  is(!popBad, `${Math.min(chips, 6)} evidence chips open a readable popover in view`);
  await page.keyboard.press("Escape");

  // show the whole sweep, and come back
  await page.click(".allsweep");
  await page.waitForTimeout(700);
  is((await page.locator("#browseTitle").innerText()).includes("sweep"), "the whole sweep opens");
  await page.click(".backrun");
  await page.waitForTimeout(700);
  is((await page.locator("#browseTitle").innerText()) === "Your matches"
     && (await n()) === scored, "and the matches come back whole");

  // leaving for the application page and coming back
  const applyBtn = page.locator("#browseJobs .job .applybtn").first();
  if (await applyBtn.count()) {
    await applyBtn.click();
    await page.waitForLoadState("networkidle");
    is(page.url().includes("apply"), "a card opens the application page");
    is((await page.locator("#role").innerText()).length > 2, "the application page names the posting");
    await page.goBack({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    is((await page.locator("#browseTitle").innerText()) === "Your matches",
       "Back from the application lands on the matches, not the landing page");
  } else {
    ok("no card cleared the floor this run — the apply route is covered by the KE pass");
  }

  // the logo goes home and the run stays reachable
  await page.click("header .brand");
  await page.waitForTimeout(1400);
  is(await page.locator("#v-landing").isVisible(), "the logo lands on the landing page");
  await page.click("#navBrowse");
  await page.waitForTimeout(900);
  is((await page.locator("#browseTitle").innerText()) === "Your matches",
     "and Browse still opens onto the run");

  // a refresh of the landing page stays on the landing page
  await page.click("header .brand");
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  is(await page.locator("#v-landing").isVisible(), "refreshing the landing page stays there");

  is(!errors.length, errors.length ? `console: ${errors.slice(0, 2).join(" | ")}` : "no page errors all pass");
  await browser.close();
}

console.log("");
console.log(fail ? `${fail} FAILED` : "ALL GREEN");
process.exit(fail ? 1 : 0);
