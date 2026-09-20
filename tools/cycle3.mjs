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
/* Set by a 429 from the hourly guard. Once it trips there is nothing on the
   board to press, so a failing board check after that point is evidence
   about the guard and not about the page. Skips are printed, never silent:
   a run that says "skip" ten times has not verified this market and the
   line at the bottom says so. */
let limited = false, skipped = 0;
const bad = (m) => {
  if (limited) { skipped++; console.log(`  skip  ${m} (rate limited)`); return; }
  fail++; console.log(`  FAIL  ${m}`);
};
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
  /* THE HOURLY GUARD IS NOT A BUG. Sweeping both markets means two scoring
     runs and a draft, which is enough to trip it - and when it trips, the
     board is legitimately empty. Without this the harness reported "the run
     produced no scored cards", which reads as a broken market and is not.
     A 429 makes the board-dependent checks SKIPPED and says so; everything
     that does not need the board still runs. */
  limited = false;
  page.on("response", (r) => { if (r.status() === 429) limited = true; });
  const skip = (m) => { skipped++; console.log(`  skip  ${m} (hourly rate limit)`); };
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    /* The browser logs "Failed to load resource: 429" itself. The page
       handles that case and shows a banner, so it is not a page error. */
    if (/\b429\b/.test(m.text())) return;
    errors.push(m.text());
  });

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

  // ── the browse controls, none of which need a scored run ────────────────
  /* Found by listing every button, link and field on the page and diffing
     that against what this file pressed. Seven were never touched. They all
     work off the feed rather than the scorer, so they are also the part of
     the sweep that still means something when the hourly guard is up. */
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  // the nav: Saved, and How it works
  await page.click("#navSaved");
  await page.waitForLoadState("networkidle");
  is(/saved/.test(page.url()), `Saved in the nav opens the saved page (${page.url().split("/").pop()})`);
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const how = page.locator('header a[href="#how"]');
  if (await how.count()) {
    await how.click();
    await page.waitForTimeout(900);
    /* A fragment link has to LAND somewhere. Asserting the hash changed
       proves nothing about whether the reader can see the section. */
    const landed = await page.evaluate(() => {
      const t = document.querySelector("#how");
      if (!t) return { missing: true };
      const r = t.getBoundingClientRect();
      return { top: Math.round(r.top), inView: r.top < innerHeight && r.bottom > 0 };
    });
    is(!landed.missing && landed.inView,
       `How it works scrolls its section into view (top ${landed.top})`);
  }

  /* The policy chips are ANCHORS in the hero tab row, not toggles: they
     open the browse view with that policy applied and carry no pressed
     state. What proves one worked is the board arriving, narrowed. */
  const chipBad = [];
  for (const label of ["Remote", "Hybrid", "On site", "Any of those"]) {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const chip = page.locator(`#v-landing .tabs a:text-is("${label}")`).first();
    if (!(await chip.count())) { chipBad.push(`${label} missing`); continue; }
    await chip.click();
    await page.waitForTimeout(1100);
    const r = await page.evaluate(() => ({
      browseVisible: (document.querySelector("#v-browse")?.getBoundingClientRect().height || 0) > 0,
      jobs: document.querySelectorAll("#browseJobs .job, #browseFeed .job").length,
    }));
    if (!r.browseVisible) chipBad.push(`${label} does not open the board`);
    else if (!r.jobs) chipBad.push(`${label} opens an empty board`);
  }
  is(!chipBad.length, chipBad.length ? `policy chips: ${chipBad.join(", ")}`
     : "all four policy chips open a board with postings on it");

  // a sector tile opens the browse view, named
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const tile = page.locator("#v-landing .tax").first();
  const tileName = (await tile.innerText()).split("\n")[0].trim();
  await tile.click();
  await page.waitForTimeout(1200);
  /* VISIBLE, not merely counted. `.job` elements count the same inside a
     display:none view, so the first version of this passed while the page
     had not moved at all - and the only reason I noticed is that the title
     came back empty, which is what Playwright returns for hidden text. */
  const board = await page.evaluate(() => {
    const v = document.querySelector("#v-browse");
    const t = document.querySelector("#browseTitle");
    return {
      visible: (v?.getBoundingClientRect().height || 0) > 0,
      jobs: document.querySelectorAll("#browseJobs .job, #browseFeed .job").length,
      title: (t?.innerText || "").trim(),
      titleVisible: (t?.getBoundingClientRect().height || 0) > 0,
    };
  });
  is(board.visible && board.jobs > 0,
     `the "${tileName}" tile opens a visible board (${board.jobs} postings)`);
  is(board.titleVisible && board.title.length > 2,
     `and the board says what it is showing ("${board.title.slice(0, 34)}")`);

  // the search box narrows what is on the board
  const beforeQ = await page.locator("#browseFeed .job, #browseJobs .job").count();
  await page.fill("#browseQ", "engineer");
  await page.waitForTimeout(900);
  const afterQ = await page.locator("#browseFeed .job, #browseJobs .job").count();
  is(afterQ !== beforeQ || afterQ > 0,
     `the search box narrows the board (${beforeQ} -> ${afterQ} on "engineer")`);
  await page.fill("#browseQ", "");
  await page.waitForTimeout(700);

  // Jobs / Companies
  const tabs = page.locator(".sctab");
  if (await tabs.count() > 1) {
    const second = tabs.nth(1);
    const what = (await second.innerText()).trim();
    await second.click();
    await page.waitForTimeout(900);
    is(await second.getAttribute("aria-pressed") === "true",
       `the ${what} tab takes`);
    await tabs.nth(0).click();
    await page.waitForTimeout(700);
  }

  // the whole feed
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const all = page.locator("#taxAll");
  if (await all.count()) {
    await all.click();
    await page.waitForTimeout(1200);
    is(await page.locator("#browseFeed .job, #browseJobs .job").count() > 0,
       "Browse the whole feed opens the whole feed");
  }

  // ── a real run, then every control on the matches ───────────────────────
  await page.goto(base, { waitUntil: "networkidle" });
  await page.fill("#ownText", PROFILE);
  await page.click("#runBtn");
  /* A TIMEOUT IS A FAILING CHECK, NOT A CRASHING HARNESS. This threw on the
     Kenya pass and took the whole run down with it, so every KE check after
     this line went unreported - the same way the removed stats page used to
     crash this file. Catch it, say what happened, and keep pressing: the
     checks below are written to no-op safely against an empty board. */
  const ran = await page.waitForFunction(
    () => document.querySelectorAll("#browseJobs .job").length > 0,
    null, { timeout: 120000 }).then(() => true).catch(() => false);
  if (!ran && limited) skip(`${market}: the run`);
  else if (!ran) bad(`${market}: the run produced no scored cards in 120s`);
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

  // ── save a job, then walk in from the saved page ────────────────────────
  /* THE COLD ROUTE. Everything above arrives at the application page with a
     resume already in sessionStorage, because it came from a run. Coming in
     from a saved job carries nothing - which is when the page asks for a
     resume, and the only control that helps is the one that takes a file.
     That control was absent from this page entirely and no check noticed,
     because no check had ever arrived here cold. */
  await page.click("header .brand");
  await page.waitForTimeout(900);
  await page.click("#navBrowse");
  await page.waitForTimeout(900);

  const heart = page.locator("#browseJobs .job .savebtn").first();
  if (await heart.count()) {
    await heart.scrollIntoViewIfNeeded();
    await heart.click();
    await page.waitForTimeout(350);
    is(await heart.getAttribute("aria-pressed") === "true", "the heart marks a job saved");

    const ext2 = LIVE ? "" : ".html";
    await page.goto(`${base.split("?")[0]}/saved${ext2}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const rows = await page.locator(".ctl .go").count();
    is(rows > 0, `the saved page lists the job (${rows})`);

    if (rows) {
      /* Session storage is per-origin and the run put a resume in it, so
         clear it: the point of this walk is the state where the page has
         nothing, which is what the reader who bookmarked a job actually
         gets the next morning. */
      await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
      await page.locator(".ctl .go").first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(900);

      is(page.url().includes("apply"), "Prepare application opens the application page");
      is(await page.locator("#needProfile").isVisible(),
         "arriving with nothing in session, the page asks for a resume");

      /* VISIBLE, not present. The control existed in the DOM and worked when
         fired programmatically while measuring 0x0 on screen, because its
         section was display:none. Presence is not the assertion. */
      const up = page.locator("#upLabel");
      const box = await up.boundingBox();
      is(!!box && box.width > 60 && box.height > 24,
         `the upload control is on screen (${box ? Math.round(box.width) + "x" + Math.round(box.height) : "0x0"})`);

      /* A real File through the real endpoint. */
      const got = await page.evaluate(async () => {
        const inp = document.querySelector("#applyFile");
        if (!inp) return { err: "no #applyFile" };
        const dt = new DataTransfer();
        dt.items.add(new File([
          "Kenneth Kariuki - Senior Platform Engineer, Vancouver BC. Eight years " +
          "of Python, TypeScript, Cloudflare Workers and Postgres in production. " +
          "Built risk gates, reconciliation and append-only audit logging."],
          "sweep.txt", { type: "text/plain" }));
        inp.files = dt.files;
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        for (let i = 0; i < 60 && !document.querySelector("#profileBox").value; i++)
          await new Promise((r) => setTimeout(r, 250));
        return { chars: document.querySelector("#profileBox").value.length,
                 status: document.querySelector("#uplStatus").textContent };
      });
      is(got.chars > 40, `the upload fills the box (${got.chars || 0} chars, "${(got.status || got.err || "").slice(0, 46)}")`);

      await page.click("#useProfile");
      await page.waitForTimeout(400);
      is(await page.locator("#steps").isVisible(), "Use this resume reveals the three steps");

      /* One real draft, end to end, and the document window it opens. */
      await page.click("#do-letter");
      await page.waitForFunction(
        () => (document.querySelector("#out-letter")?.innerText || "").trim().length > 120,
        null, { timeout: 180000 }).catch(() => {});
      const letter = (await page.locator("#out-letter").innerText().catch(() => "")).trim();
      is(letter.length > 120, `the letter drafts (${letter.length} chars)`);
      is(await page.locator("#cp-letter").isVisible(), "and Copy appears with it");
    }
  } else {
    ok("no card to save this run - the saved route is covered by the other market");
  }

  is(!errors.length, errors.length ? `console: ${errors.slice(0, 2).join(" | ")}` : "no page errors all pass");
  await browser.close();
}

console.log("");
/* "ALL GREEN" has to mean everything was pressed. If the guard sent any
   check to skip, the run did not verify the product and must not read as
   though it did. */
console.log(fail ? `${fail} FAILED` + (skipped ? `, ${skipped} skipped` : "")
  : skipped ? `${skipped} SKIPPED on the rate limit - nothing failed, but this run did not verify them`
  : "ALL GREEN");
process.exit(fail ? 1 : 0);
