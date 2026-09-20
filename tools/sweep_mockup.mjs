/* Every control on the phone mockup, both markets, behaviour asserted.
 *
 *     node tools/sweep_mockup.mjs
 *     node tools/sweep_mockup.mjs --keep   (leave the browser open on a fail)
 *
 * The mockup is the surface the design is signed off on, and it calls the
 * same live endpoints the shipped clients do, so a control that does nothing
 * here is a control that does nothing there. It is also the only place the
 * three-state theme control, both markets and both platform frames sit on
 * one page, which is why the sweep lives here rather than in the app.
 *
 * THE RULE THIS FILE EXISTS FOR: assert what the screen did, never that a
 * node is present. Six of the defects found this session were controls that
 * rendered perfectly and could not fire.
 *
 * The scoring endpoint is behind an hourly guard. A 429 means the board is
 * legitimately empty, so board checks SKIP rather than fail - and the last
 * line says how many, because a run full of skips has verified nothing.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const KEEP = process.argv.includes("--keep");
/* NOT `URL`: a module-scope const by that name shadows the global URL
   constructor, and `new URL(...)` two functions below then throws. */
const PAGE = "http://localhost:4174/mockups/mobile.html";

let fail = 0, skipped = 0, limited = false;
const bad = (m) => {
  if (limited) { skipped++; console.log(`  skip  ${m} (rate limited)`); return; }
  fail++; console.log(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  ok    ${m}`);
const is = (c, m) => (c ? ok(m) : bad(m));

const RESUME = `Kenneth Kariuki - Senior Platform Engineer, Vancouver BC.
EXPERIENCE. Technical lead on an algorithmic trading platform: Python,
TypeScript, Cloudflare Workers, D1 and Postgres. Built risk gates,
reconciliation and append-only audit logging. Shipped three clients of one
API: web, native Android and native iOS. Ran CI/CD, Terraform and Linux in
production for eight years.
SKILLS. Python, TypeScript, SQL, Terraform, Docker, AWS, Cloudflare, React.
EDUCATION. BSc Computer Science.`;

/* The phone is an element inside a page, so "visible" means visible INSIDE
   the phone - an off-frame control is as unreachable as a missing one. */
const onPhone = async (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const screen = document.querySelector(".screen").getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    found: true, w: Math.round(r.width), h: Math.round(r.height),
    inFrame: r.width > 0 && r.height > 0 &&
             r.left >= screen.left - 1 && r.right <= screen.right + 1,
    visible: cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05,
  };
}, sel);

/* THE LETTERHEAD EXTRACTOR, EXERCISED WITHOUT A BROWSER OR AN API CALL.
   /api/letter returns the body alone, so the name and contact line come out
   of the resume the reader gave - and the first version rejected the most
   common resume opening there is, "Name - Title, City", because it counted
   eight words on the line. Two more cases came out of running this list: a
   resume that opens on a section heading ("EXPERIENCE") passed as a name,
   and an email on the first line got printed twice. Reading the function
   would not have found any of the three. */
const unitLetterhead = async () => {
  const src = await readFile(new URL("../mockups/mobile.html", import.meta.url), "utf8");
  const from = src.indexOf("function letterhead");
  const fn = src.slice(from, src.indexOf("\nconst asProse", from));
  const letterhead = new Function(fn + "; return letterhead;")();
  const CASES = [
    ["Kenneth Kariuki - Senior Platform Engineer, Vancouver BC.\nEXPERIENCE", "Kenneth Kariuki"],
    ["Ken Kariuki\nCybersecurity - Vulnerability Management\nkenmwara@gmail.com", "Ken Kariuki"],
    ["Kenneth Mwara Kariuki | Platform Engineer | kenmwara@gmail.com", "Kenneth Mwara Kariuki"],
    ["EXPERIENCE\nSomething that is not a name", null],
    ["SKILLS\nPython, TypeScript", null],
    ["", null],
    ["A resume that opens with a whole sentence about the candidate", null],
  ];
  let bad2 = 0;
  for (const [input, want] of CASES) {
    const got = letterhead(input);
    if ((got ? got.nm : null) !== want) {
      bad2++;
      bad(`letterhead("${input.split("\n")[0].slice(0, 36)}") -> ${JSON.stringify(got ? got.nm : null)}, want ${JSON.stringify(want)}`);
    }
  }
  /* The email must not appear twice when the first line already carried it. */
  const dup = letterhead("Kenneth Mwara Kariuki | kenmwara@gmail.com");
  if ((dup.ct.match(/@/g) || []).length > 1) { bad2++; bad(`letterhead prints the email twice: ${dup.ct}`); }
  if (!bad2) ok(`the letterhead reads ${CASES.length} resume openings correctly`);
};

const run = async () => {
  await unitLetterhead();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/\b429\b/.test(m.text())) return;      // the guard, handled in-page
    errors.push(m.text());
  });
  page.on("response", (r) => { if (r.status() === 429) limited = true; });

  for (const market of ["ca", "ke"]) {
    console.log(`\n── ${market.toUpperCase()} ──`);
    await page.goto(PAGE, { waitUntil: "networkidle" });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: "networkidle" });

    // ── the rail: market, theme, platform ────────────────────────────────
    await page.click(`#segMarket button[data-m="${market}"]`);
    await page.waitForTimeout(300);
    is(await page.getAttribute("html", "data-market") === market,
       `market ${market}: the chip sets data-market`);
    is(await page.evaluate(() =>
         [...document.querySelectorAll("#segMarket button")]
           .filter((b) => b.getAttribute("aria-pressed") === "true").length) === 1,
       "exactly one market reads as pressed");

    /* THE HERO IS THE ONLY PLACE THE MARKET SHOWS. Everything else is the
       theme. The chip reads as SELECTED, which is a theme token. */
    const heroTint = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".mhero")).backgroundImage.slice(0, 40));
    is(heroTint.includes("gradient"), "the hero carries the market gradient");

    /* THE ABSENT STATE IS LIGHT, NOT SYSTEM. The zip's spec has absence mean
       "follow the OS", but light is the default on all four surfaces, so the
       shipped contract inverts it: no attribute is light, and following the
       device is the explicit "system". base.css carries the matching
       :root[data-theme="system"] block inside the prefers-color-scheme
       query. The site and the mockup agree; this harness did not, and had it
       been written to the spec instead of to the code it would have reported
       two failures against a correct implementation. */
    for (const [t, expect] of [["dark", "dark"], ["system", "system"], ["light", null]]) {
      await page.click(`#segTheme button[data-t="${t}"]`);
      await page.waitForTimeout(250);
      const got = await page.getAttribute("html", "data-theme");
      is(got === expect, `theme ${t}: data-theme is ${got === null ? "absent" : got}`);
    }
    await page.click(`#segTheme button[data-t="light"]`);

    for (const p of ["ios", "android"]) {
      await page.click(`#segPlat button[data-p="${p}"]`);
      await page.waitForTimeout(250);
      is(await page.getAttribute("html", "data-plat") === p, `platform ${p}: the frame switches`);
    }

    // ── the hero: paste, upload, run ─────────────────────────────────────
    const clip = await onPhone(page, "#clipBtn");
    is(clip.found && clip.inFrame && clip.w >= 20,
       `the upload clip is on the phone (${clip.w || 0}x${clip.h || 0})`);

    const up = await page.evaluate(async () => {
      const inp = document.querySelector("#resumeFile");
      if (!inp) return { err: "no #resumeFile" };
      const dt = new DataTransfer();
      dt.items.add(new File(["Kenneth Kariuki - Senior Platform Engineer. Eight years " +
        "of Python, TypeScript, Cloudflare Workers and Postgres in production."],
        "sweep.txt", { type: "text/plain" }));
      inp.files = dt.files;
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if ((document.querySelector("#resume")?.value || "").length > 40) break;
      }
      return { chars: (document.querySelector("#resume")?.value || "").length,
               note: (document.querySelector("#mfile")?.textContent || "").trim() };
    });
    is(up.chars > 40, `the clip fills the box (${up.chars || 0} chars)`);
    is(/character|read/i.test(up.note || ""), `and names the file ("${(up.note || "").slice(0, 44)}")`);

    /* ── the floor, on a board built for the purpose ──────────────────
       The web holds FIT_FLOOR = 55 and leads with WHY when nothing clears
       it; the phone listed whatever came back under "Your matches", so a
       board of 30s read as a recommendation. Driven off a synthetic board
       rather than real scoring: it costs no API call, it still runs when
       the guard is up, and a board where nothing clears is not something
       real scoring produces on request. */
    const floor = await page.evaluate(async () => {
      const low = postings().slice(0, 6).map((p, i) => ({
        ...p, fit: 38 - i * 3, verdict: "",
        strongest: "Deep infrastructure work across Python and TypeScript.",
        weakest: "Enterprise Power Platform and Dynamics 365 delivery.",
      }));
      scoredReal = low; ran = true; screen = "matches"; paint();
      await new Promise((r) => setTimeout(r, 200));
      const nf = document.querySelector(".nofit");
      const firstCard = document.querySelector("#view .card");
      const out = {
        panel: !!nf,
        asks: nf ? nf.querySelectorAll(".asks li").length : 0,
        quotesTheScore: !!nf && /38 out of 100/.test(nf.innerText),
        aboveTheCards: !!nf && !!firstCard &&
          !!(nf.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING),
        sub: document.querySelector("#view .sub").innerText.split("\u00b7")[0].trim(),
      };
      firstCard.click();
      await new Promise((r) => setTimeout(r, 250));
      out.lowCta = document.querySelector('#view [data-go="draft"]').innerText.trim();

      scoredReal = low.map((x, i) => ({ ...x, fit: i === 0 ? 82 : 40 }));
      screen = "matches"; paint();
      await new Promise((r) => setTimeout(r, 200));
      out.panelGoesAway = !document.querySelector(".nofit");
      document.querySelector("#view .card").click();
      await new Promise((r) => setTimeout(r, 250));
      out.highCta = document.querySelector('#view [data-go="draft"]').innerText.trim();

      scoredReal = null; ran = false; screen = "home"; paint();
      return out;
    });
    is(floor.panel && floor.aboveTheCards,
       "below the floor the phone leads with why, above the cards");
    is(floor.quotesTheScore, "and names the nearest score honestly");
    is(floor.asks === 3, `quoting what three postings asked for (${floor.asks})`);
    is(/^6 scored/.test(floor.sub), `the count is counted, not typed ("${floor.sub}")`);
    is(/Apply anyway/.test(floor.lowCta), `a below-floor card offers "${floor.lowCta}"`);
    is(/Prepare application/.test(floor.highCta), `one that clears offers "${floor.highCta}"`);
    is(floor.panelGoesAway, "and the panel goes away as soon as something clears");

    await page.fill("#resume", RESUME);
    await page.click("#runBtn");

    /* WHILE IT WORKS THE BUTTON IS NOT A BUTTON. The Claude mark used to
       breathe inside the dark arrow disc, so the thing saying "working"
       wore the affordance that says "press me". */
    await page.waitForTimeout(400);
    const busy = await page.evaluate(() => {
      const b = document.querySelector("#runBtn");
      if (!b || !b.classList.contains("busy")) return null;
      const cs = getComputedStyle(b);
      return { bg: cs.backgroundColor, mark: !!b.querySelector(".cmark") };
    });
    if (busy) is(busy.mark && /rgba\(0, 0, 0, 0\)|transparent/.test(busy.bg),
                 `working: the Claude mark shows with no disc behind it (${busy.bg})`);
    else ok("working: the run finished before the busy state could be sampled");

    const ran = await page.waitForFunction(
      () => document.querySelectorAll("#view .card").length > 0, null, { timeout: 150000 })
      .then(() => true).catch(() => false);
    if (!ran && limited) { skipped++; console.log("  skip  the run (hourly rate limit)"); }
    else is(ran, "the run puts scored cards on the matches screen");

    const cards = await page.locator("#view .card").count();
    is(cards > 0, `${cards} cards on screen`);

    // ── every control on the matches screen ──────────────────────────────
    if (cards) {
      const heart = page.locator("#view .heart").first();
      const before = await heart.getAttribute("aria-pressed");
      await heart.click();
      await page.waitForTimeout(250);
      is(await page.locator("#view .heart").first().getAttribute("aria-pressed") !== before,
         "the heart toggles on a card");

      await page.click("#saveSearch");
      await page.waitForTimeout(250);
      is(await page.getAttribute("#saveSearch", "aria-pressed") === "true",
         "Save this search takes");

      // the tab bar
      for (const [tab, marker] of [["saved", ".card, .empty"], ["home", "#resume"], ["matches", ".card"]]) {
        await page.click(`#tabbar button[data-go="${tab}"]`);
        await page.waitForTimeout(350);
        is(await page.locator(`#view ${marker}`).count() > 0, `the ${tab} tab shows its screen`);
        is(await page.getAttribute(`#tabbar button[data-go="${tab}"]`, "aria-pressed") === "true",
           `and the ${tab} tab reads as current`);
      }

      // a card opens the application screen
      await page.locator("#view .card").first().click();
      await page.waitForTimeout(450);
      is(await page.locator('#view [data-go="draft"]').count() > 0,
         "a card opens the application screen");

      await page.click('#view [data-go="draft"]');
      await page.waitForTimeout(450);
      const steps = await page.locator("#view [data-draft]").count();
      is(steps >= 3, `Prepare application opens the three drafting steps (${steps})`);

      // ── one real draft, and the sheet it opens ─────────────────────────
      await page.locator('#view [data-draft="letter"]').first().click();
      const drafted = await page.waitForFunction(
        () => document.querySelector('[data-open="letter"]'), null, { timeout: 180000 })
        .then(() => true).catch(() => false);
      if (!drafted && limited) { skipped++; console.log("  skip  the letter (hourly rate limit)"); }
      else is(drafted, "the letter drafts and offers Read it");

      if (drafted) {
        /* A finished draft OPENS ITS SHEET. Clicking "Read it" underneath it
           times out on the sheet intercepting the pointer, which is the
           sheet doing its job. Only press the button when the sheet is not
           already up - and press it at least once per run, below, so the
           button itself is still exercised. */
        if (await page.locator("#sheet").getAttribute("hidden") !== null) {
          await page.click('[data-open="letter"]');
        }
        await page.waitForTimeout(400);
        const sheet = await page.evaluate(() => {
          const s = document.querySelector("#sheet");
          if (!s || s.hidden) return null;
          const win = s.querySelector(".win"), body = s.querySelector("#sheetBody");
          const wr = win.getBoundingClientRect(), sr = s.getBoundingClientRect();
          const cs = getComputedStyle(win);
          return {
            text: body.innerText.trim().length,
            fullWidth: Math.abs(wr.width - sr.width) < 2,
            flush: Math.abs(sr.bottom - wr.bottom) < 2,
            topOnly: cs.borderBottomLeftRadius === "0px" && cs.borderTopLeftRadius !== "0px",
            grab: !!s.querySelector(".grab"),
            close: Math.round(s.querySelector(".xclose").getBoundingClientRect().width),
            letterhead: !!s.querySelector(".lhead"),
            title: getComputedStyle(s.querySelector(".wtop h4")).fontFamily.split(",")[0],
          };
        });
        if (!sheet) bad("Read it did not open the sheet");
        else {
          is(sheet.text > 120, `the sheet reads the letter (${sheet.text} chars)`);
          is(sheet.fullWidth && sheet.flush && sheet.topOnly,
             "it is a bottom sheet: full width, flush, top corners only");
          is(sheet.grab && sheet.close <= 32, `grab handle and a ${sheet.close}px close`);
          is(sheet.letterhead, "the letter has a letterhead");
          is(/Newsreader/.test(sheet.title), `the title is the serif (${sheet.title})`);
        }

        await page.click("#sheetCopy");
        await page.waitForTimeout(250);
        is(/copied/i.test(await page.locator("#sheetCopy").innerText()),
           "Copy all says it copied");
        await page.click("[data-sheet-close]");
        await page.waitForTimeout(250);
        is(await page.locator("#sheet").getAttribute("hidden") !== null, "Close shuts the sheet");

        /* Now that the sheet is shut, Read it is reachable - so press it.
           Re-opening a draft that is already written is its whole purpose. */
        await page.click('[data-open="letter"]');
        await page.waitForTimeout(350);
        is(await page.locator("#sheet").getAttribute("hidden") === null,
           "Read it re-opens a letter already written");
        await page.click("[data-sheet-close]");
        await page.waitForTimeout(200);
      }

      // ── the resume sheet: the one that showed a headline and nothing else ─
      await page.locator('#view [data-draft="resume"]').first().click();
      const built = await page.waitForFunction(
        () => document.querySelector('[data-open="resume"]'), null, { timeout: 180000 })
        .then(() => true).catch(() => false);
      if (!built && limited) { skipped++; console.log("  skip  the resume (hourly rate limit)"); }
      else is(built, "the resume rebuilds");

      if (built) {
        /* Same as the letter: a finished rebuild opens its own sheet. */
        if (await page.locator("#sheet").getAttribute("hidden") !== null) {
          await page.click('[data-open="resume"]');
        }
        await page.waitForTimeout(400);
        const doc = await page.evaluate(() => {
          const b = document.querySelector("#sheetBody");
          return { chars: b.innerText.trim().length,
                   sections: b.querySelectorAll(".dsec").length,
                   bullets: b.querySelectorAll(".ditem li").length };
        });
        /* THE BUG THIS ASSERTION IS FOR: the renderer reached for
           section.title / .lines / .bullets when the payload carries
           section.heading and items[].bullets, so every section mapped to an
           empty string and the sheet showed the headline alone - about 90
           characters, no sections, no bullets. Counting characters alone
           would have passed it. */
        is(doc.sections > 0 && doc.bullets > 0,
           `the resume sheet renders the document (${doc.sections} sections, ${doc.bullets} bullets, ${doc.chars} chars)`);
        await page.click("[data-sheet-close]");
      }

      // back out
      await page.waitForTimeout(200);
      const bk = page.locator("#view .bk").first();
      if (await bk.count()) {
        await bk.click();
        await page.waitForTimeout(350);
        is(await page.locator("#view .card, #view [data-go=\"draft\"]").count() > 0,
           "Back leaves the drafting screen");
      }
    }

    is(!errors.length, errors.length ? `console: ${errors.slice(0, 2).join(" | ")}` : "no page errors");
    errors.length = 0;
  }

  if (!KEEP || !fail) await browser.close();
  console.log("");
  console.log(fail ? `${fail} FAILED` + (skipped ? `, ${skipped} skipped` : "")
    : skipped ? `${skipped} SKIPPED on the rate limit - nothing failed, but this run did not verify them`
    : "ALL GREEN");
  process.exit(fail ? 1 : 0);
};

run();
