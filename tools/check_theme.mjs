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
    canvas: hex(getComputedStyle(document.body).backgroundColor),
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
  for (const market of ["ca", "ke"]) {
    for (const os of ["light", "dark"]) {
      for (const forced of [null, "light", "dark"]) {
        const ctx = await browser.newContext({ colorScheme: os });
        const page = await ctx.newPage();
        const url = (market === "ke" ? KE : CA) +
          (forced ? (LIVE ? `?theme=${forced}` : `&theme=${forced}`)
                  : (LIVE ? "" : "&theme=system"));
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const r = await probe(page);
        const want = CANVAS[forced || os];
        const label = `${market} / ${forced || "system"} / OS ${os}`;
        if (r.canvas !== want) bad(`${label}: canvas ${r.canvas}, expected ${want}`);
        else if (!squash(r.hero).includes(HERO[market])) bad(`${label}: hero is not ${market}'s (${squash(r.hero).slice(0, 48)})`);
        else if (r.market !== market) bad(`${label}: data-market is ${r.market}`);
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
    await page.evaluate(() => document.documentElement.setTheme("light"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const r = await probe(page);
    if (r.canvas !== CANVAS.light) bad(`a stored light choice did not survive a reload (${r.canvas})`);
    else ok("a stored choice survives a reload, set before first paint");
    // and the head script must NOT write the attribute when nothing is stored
    await page.evaluate(() => document.documentElement.setTheme("system"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const r2 = await probe(page);
    if (r2.theme !== null)
      bad(`with no stored choice the head script wrote data-theme="${r2.theme}" - "follow the system" is then unreachable`);
    else ok("with no stored choice no attribute is written; absence stays meaningful");
    await ctx.close();
  }

  // ── 11: an OS change lands live, with no reload ──────────────────────
  {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(CA + (LIVE ? "" : "&theme=system"), { waitUntil: "domcontentloaded" });
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
    for (const choice of ["dark", "light", "system"]) {
      await page.click(`#thmTop button[data-thm="${choice}"]`);
      const r = await probe(page);
      const want = choice === "system" ? null : choice;
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

  await browser.close();
  console.log("");
  console.log(fails ? `${fails} FAILED` : "ALL GREEN");
  process.exit(fails ? 1 : 0);
};

run();
