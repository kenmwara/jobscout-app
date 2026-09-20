/* The truth table in docs/THEME.md, executed.
 *
 *     node tools/check_theme.mjs            (local, python -m http.server)
 *     node tools/check_theme.mjs --live
 *
 * Market is the hero. Theme is everything else. They never touch. All eight
 * market x theme x OS cells are legal; none is a fallback and none is an
 * error state. The two that every previous attempt got wrong are Kenya in
 * light, so those are here twice: once following a light OS and once forcing
 * light against a dark one.
 *
 * READ THIS BEFORE TRUSTING A FAILURE:
 * `body` carries `transition: background .45s, color .45s`. A transition is
 * PAUSED AT FRAME ZERO in a hidden document, so getComputedStyle returns the
 * colour the page is animating FROM, not the one it resolved to. Measuring
 * through it is how I convinced myself Chrome could not re-resolve
 * light-dark() at runtime, wrote that in three places, and was wrong. Every
 * read below suppresses transitions first. Do not remove that.
 */
import { chromium } from "playwright";

const LIVE = process.argv.includes("--live");
const BASE = LIVE ? "https://jobscout.page" : "http://localhost:8787";
const KE = LIVE ? "https://nairobi.jobscout.page" : `${BASE}/index.html?market=ke`;
const CA = LIVE ? BASE : `${BASE}/index.html?market=ca`;

/* Every route a reader can actually land on. */
const ROUTES = LIVE
  ? ["/", "/saved", "/apply", "/privacy"]
  : ["/index.html", "/saved.html", "/apply.html", "/privacy.html"];

const CANVAS = { light: "#f8f3eb", dark: "#0a0524" };
// A custom property is NOT normalised by getComputedStyle - it comes back as
// authored - so compare with the whitespace stripped rather than guessing
// which spelling the stylesheet used.
const HERO = { ca: "72,101,255", ke: "45,140,50" };
const squash = (v) => v.replace(/\s+/g, "");

let fails = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { fails++; console.log(`  FAIL  ${m}`); };

/** Read the resolved colours with transitions suppressed. */
const probe = (page) => page.evaluate(() => {
  const s = document.createElement("style");
  s.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
  document.head.appendChild(s);
  void document.body.offsetHeight;
  const hex = (v) => {
    const m = v.match(/\d+/g);
    return m ? "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("") : v;
  };
  const cs = getComputedStyle(document.documentElement);
  const out = {
    market: document.documentElement.getAttribute("data-market"),
    theme: document.documentElement.getAttribute("data-theme"),
    /* THE PAGE'S GROUND, wherever it lives. It moved from <body> to <html>
       when the halo became a fixed body::before layer - body is transparent
       now, and reading it returned rgba(0,0,0,0) for every cell. A probe
       that names an element rather than the thing it is measuring breaks on
       the first structural change. */
    canvas: (() => {
      for (const el of [document.documentElement, document.body]) {
        const c = getComputedStyle(el).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return hex(c);
      }
      return "none";
    })(),
    text: hex(getComputedStyle(document.body).color),
    hero: cs.getPropertyValue("--hero").trim(),
    surface: hex(cs.getPropertyValue("--surface").trim().startsWith("#")
      ? cs.getPropertyValue("--surface").trim() : getComputedStyle(document.body).backgroundColor),
  };
  s.remove();
  return out;
});

const run = async () => {
  const browser = await chromium.launch();

  // ── 1-8: the truth table ─────────────────────────────────────────────
  console.log("\n-- the truth table --");
  /* LIGHT IS THE DEFAULT (operator decision 2026-09-20), so an absent
     attribute is light rather than "follow the OS" - cream and Newsreader are
     the brand, and a first visit lands on them whatever the device says.
     "system" is still reachable; it is just asked for now. The state that
     used to be implicit is the one worth testing hardest, so all four are
     here against both OS settings. */
  for (const market of ["ca", "ke"]) {
    for (const os of ["light", "dark"]) {
      for (const forced of [null, "light", "system", "dark"]) {
        const ctx = await browser.newContext({ colorScheme: os });
        const page = await ctx.newPage();
        const url = (market === "ke" ? KE : CA) +
          (forced ? (LIVE ? `?theme=${forced}` : `&theme=${forced}`) : (LIVE ? "" : ""));
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const r = await probe(page);
        const want = CANVAS[forced === "system" ? os : (forced || "light")];
        const label = `${market} / ${forced || "default"} / OS ${os}`;
        if (r.canvas !== want) bad(`${label}: canvas ${r.canvas}, expected ${want}`);
        else if (!squash(r.hero).includes(HERO[market])) bad(`${label}: hero is not ${market}'s (${squash(r.hero).slice(0, 48)})`);
        else if (r.market !== market) bad(`${label}: data-market is ${r.market}`);
        else if (forced === null && r.theme !== null)
          bad(`${label}: the default wrote data-theme="${r.theme}"`);
        else ok(`${label} -> ${r.canvas}, ${market} hero`);
        await ctx.close();
      }
    }
  }

  // ── 9: switching market must not touch the theme ─────────────────────
  console.log("\n-- the two axes never touch --");
  {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(CA + (LIVE ? "?theme=light" : "&theme=light"), { waitUntil: "domcontentloaded" });
    const before = await probe(page);
    await page.evaluate(() => document.documentElement.setAttribute("data-market", "ke"));
    const after = await probe(page);
    if (after.canvas !== before.canvas)
      bad(`switching market changed the ground ${before.canvas} -> ${after.canvas}: setMarket is touching theme`);
    else if (after.hero === before.hero) bad("switching market did not change the hero");
    else ok(`market ca -> ke in forced light: ground stayed ${after.canvas}, only the hero moved`);
    await ctx.close();
  }

  // ── 10: a stored choice survives a reload, and paints on first frame ──
  {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(CA, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.documentElement.setTheme("dark"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const r = await probe(page);
    if (r.canvas !== CANVAS.dark) bad(`a stored dark choice did not survive a reload (${r.canvas})`);
    else ok("a stored choice survives a reload, set before first paint");
    // and the default must write nothing
    await page.evaluate(() => document.documentElement.setTheme("light"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const r2 = await probe(page);
    if (r2.theme !== null)
      bad(`after choosing Light the head script wrote data-theme="${r2.theme}"`);
    else if (r2.canvas !== CANVAS.light)
      bad(`the default is ${r2.canvas}, and it must be light on a dark OS too`);
    else ok("the default writes no attribute and lands light, on a dark OS");
    await ctx.close();
  }

  // ── 11: an OS change lands live, with no reload ──────────────────────
  {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(CA + (LIVE ? "?theme=system" : "&theme=system"), { waitUntil: "domcontentloaded" });
    const before = await probe(page);
    await page.emulateMedia({ colorScheme: "light" });
    const after = await probe(page);
    if (before.canvas !== CANVAS.dark) bad(`following a dark OS gave ${before.canvas}`);
    else if (after.canvas !== CANVAS.light)
      bad(`an OS change to light did not land live (${after.canvas}) - something is caching the resolved theme`);
    else ok("an OS flip dark -> light lands live, with no reload");
    await ctx.close();
  }

  // ── the toggle exists and offers all three ───────────────────────────
  console.log("\n-- the control --");
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(CA, { waitUntil: "domcontentloaded" });
    const states = await page.$$eval("#thmTop button[data-thm]", (b) => b.map((x) => x.dataset.thm));
    if (states.length !== 3 || !["system", "light", "dark"].every((s) => states.includes(s)))
      bad(`the theme control offers ${JSON.stringify(states)} - a switch cannot express "follow the system"`);
    else ok("the theme control offers all three states");

    // and clicking each one actually lands
    for (const choice of ["dark", "system", "light"]) {
      await page.click(`#thmTop button[data-thm="${choice}"]`);
      const r = await probe(page);
      // Light is the default, so choosing it clears the attribute rather
      // than writing one; "system" and "dark" are stored.
      const want = choice === "light" ? null : choice;
      if (r.theme !== want) bad(`clicking ${choice} left data-theme=${JSON.stringify(r.theme)}`);
      else ok(`clicking ${choice} sets data-theme=${JSON.stringify(r.theme)}`);
    }
    const pressed = await page.$$eval("#thmTop button[aria-pressed='true']", (b) => b.length);
    if (pressed !== 1) bad(`${pressed} buttons read as pressed; exactly one must`);
    else ok("exactly one state reads as pressed");
    await ctx.close();
  }

  // ── the control renders AT EVERY WIDTH ──────────────────────────────
  /* This exists because the control's CSS was inserted just before a comment
     that happened to sit inside @media(max-width:620px). Chrome's CSS nesting
     kept the nested @media valid, so it styled the control on a phone - the
     only width I checked - and nowhere else. At 1440px the buttons had no
     size, no stroke and no colour: three blank boxes on the live site.
     Presence is not the assertion. Rendered size, resolved stroke, and not
     colliding with the two things either side of it are. */
  console.log("\n-- the control at every width --");
  for (const width of [1920, 1440, 1280, 1024, 860, 768, 600, 480, 375]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(CA, { waitUntil: "domcontentloaded" });
    const m = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(); return { x: r.x, r: r.right, w: r.width, h: r.height }; };
      const t = document.getElementById("thmTop");
      if (!t) return { missing: true };
      const svg = t.querySelector("svg");
      const sr = svg.getBoundingClientRect();
      const hit = t.querySelector("button").getBoundingClientRect();
      const over = (a, b) => !!a && !!b && !(a.r <= b.x || b.r <= a.x);
      return {
        thm: box("#thmTop"), svgW: Math.round(sr.width), svgH: Math.round(sr.height),
        stroke: getComputedStyle(svg).stroke,
        tap: Math.round(Math.min(hit.width, hit.height)),
        overMkt: over(box("#thmTop"), box(".mkt")),
        overNav: over(box("#thmTop"), box("nav.main")),
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    const w = `${width}px`;
    if (m.missing) bad(`${w}: the control is not in the DOM`);
    else if (m.thm.w === 0 || m.thm.h === 0) bad(`${w}: the control is not rendered`);
    else if (m.svgW === 0 || m.svgH === 0) bad(`${w}: the icons are ${m.svgW}x${m.svgH} - the CSS is not reaching them`);
    else if (m.stroke === "none") bad(`${w}: the icons have no stroke - they draw as blank boxes`);
    else if (m.overMkt) bad(`${w}: the control overlaps the market switch`);
    else if (m.overNav) bad(`${w}: the control overlaps the nav`);
    else if (m.hscroll) bad(`${w}: the header forces a horizontal scroll`);
    else if (width <= 860 && m.tap < 40) bad(`${w}: ${m.tap}px tap target, under the 44px guidance`);
    else ok(`${w}: ${m.svgW}px icons, ${m.tap}px targets, clear of both neighbours`);
    await ctx.close();
  }

  // ── the stylesheet must not outlive the document (live only) ────────
  /* Pages defaults to max-age=0 for HTML and 14400 for everything else, and
     `must-revalidate` does NOT make the browser ask inside that window. So a
     reader gets new HTML with a four-hour-old stylesheet, and the inline
     scripts set attributes the cached CSS has no rules for. That shipped, and
     it looked exactly like a broken toggle: "I have to do a hard reset before
     I can change light/dark modes". site/_headers pins base.css to the HTML. */
  /* ONE GROUND, EVERY ROUTE.
     /saved and /privacy each declared their own
       body{background:var(--canvas); background-image:radial-gradient(dots)}
     and an opaque body background covers <html>'s fixed halo layers
     completely. Those two routes measured 1.000 against the flat canvas at
     all six corners in BOTH themes while /browse measured on spec. The halo
     was never missing there - it was underneath, and a per-page dot grid
     LOUDER than the halo was standing in for it.

     A layer that is one rule on one element either reaches every page or it
     is not global, so this is asserted per ROUTE - the defect lived on the
     two routes nothing in this harness had ever opened. And it asserts WHO
     PAINTS, not what colour came out: a route can composite to the right hex
     and still have thrown the halo away. */
  console.log("");
  console.log("-- the ground belongs to <html>, on every route --");
  for (const route of ROUTES) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext(
        { colorScheme: theme, viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
      const g = await page.evaluate(() => {
        const s = document.createElement("style");
        s.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
        document.head.appendChild(s);
        void document.body.offsetHeight;
        const H = getComputedStyle(document.documentElement);
        const B = getComputedStyle(document.body);
        return {
          layers: (H.backgroundImage.match(/gradient/g) || []).length,
          fixed: /fixed/.test(H.backgroundAttachment),
          bodyPaints:
            B.backgroundColor !== "rgba(0, 0, 0, 0)" || B.backgroundImage !== "none",
          bodyGround: B.backgroundImage === "none" ? B.backgroundColor : B.backgroundImage,
        };
      });
      const tag = route + " " + theme;
      if (g.bodyPaints)
        bad(tag + ": body paints its own ground (" + g.bodyGround.slice(0, 46) +
            ") - that covers the halo");
      else if (g.layers < 4)
        bad(tag + ": <html> carries " + g.layers +
            " background layers, want 4 (3 blooms + the dot texture)");
      else if (!g.fixed)
        bad(tag + ": the halo scrolls with the page instead of sitting behind it");
      else ok(tag + ": 4 fixed layers on <html>, body paints nothing");
      await ctx.close();
    }
  }

  /* BROWSE MEANS ONE PLACE.
     index.html resolves #browse on load and its own nav link switches the
     view in place; the other three linked to "./", which is the LANDING. The
     same word in the same nav went to two different screens depending on
     which page you clicked it from. Assert the destination, not that a link
     with the right label exists. */
  console.log("");
  console.log("-- one word, one destination --");
  for (const route of ROUTES.filter((r) => !/^\/(index\.html)?$/.test(r))) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("a")]
        /* Not === "Browse": the footer calls it "Browse today's sweep", and
           an exact match silently passed that one as "no Browse link". */
        .filter((a) => a.textContent.trim().startsWith("Browse"))
        .map((a) => a.getAttribute("href")));
    if (!hrefs.length) bad(route + ": no link labelled Browse");
    else if (hrefs.some((h) => !/#browse$/.test(h)))
      bad(route + ": Browse -> " + hrefs.join(", ") +
          " - that is the landing, not the browse view");
    else ok(route + ": Browse -> " + hrefs[0] + " (all " + hrefs.length + ")");
    await ctx.close();
  }

  if (LIVE) {
    console.log("\n-- what the browser is told to cache --");
    const maxAge = async (u) => {
      const r = await fetch(u, { method: "HEAD" });
      const m = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
      return m ? +m[1] : null;
    };
    const doc = await maxAge(BASE + "/");
    const css = await maxAge(BASE + "/base.css");
    /* The invariant is "a reader cannot hold new markup with an OLD palette".
       Two ways to satisfy it: the stylesheet expires with the document, or
       its URL carries a content hash so a changed file is a changed URL. The
       zone overrides max-age downward-only on the custom domain, so the hash
       is what actually holds - check the invariant, not one way of meeting it. */
    const html = await (await fetch(BASE + "/")).text();
    const ref = (html.match(/href="base\.css(\?v=[^"]*)?"/) || [])[1];
    if (ref) ok(`base.css is content-hashed (${ref}), so its cache lifetime cannot matter`);
    else if (doc === null || css === null) bad(`no max-age on the document (${doc}) or the stylesheet (${css})`);
    else if (css > doc)
      bad(`base.css is cached ${css}s against the document's ${doc}s, and its URL carries no hash - a reader can hold new HTML with an old palette`);
    else ok(`base.css ${css}s <= document ${doc}s, so the palette cannot outlive the markup`);
  }

  await browser.close();
  console.log("");
  console.log(fails ? `${fails} FAILED` : "ALL GREEN");
  process.exit(fails ? 1 : 0);
};

run();
