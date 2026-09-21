// The rose in the list, proved: lit dots = the score, the numeral seats on the
// dots' clock, settled roses breathe out of step, only AUTO pulses, and under
// reduced motion the same information arrives with no animation at all.
//
//   python -m http.server 8765   (the REPO ROOT: the mockup links ../site/base.css)
//   node tools/check_rose.mjs
//
// The lit count IS the band (motion v2): AUTO 8, PING 6, UNSURE 5, NEAR-MISS 3,
// keyed on the SVG's own aria-label so the check reads the score the page
// claims. Also: the display-cut viewBox at every size, lit and unlit fills
// differ, every card title is the serif, and a card's three metadata tiers
// are three distinct computed treatments.
import { chromium } from "playwright";

const SITE = "http://localhost:8765/site", MOCK = "http://localhost:8765/mockups";
const fails = [];
const ok = m => console.log("  ok    " + m);
const bad = m => { fails.push(m); console.log("  FAIL  " + m); };
const is = (c, m) => (c ? ok : bad)(m);

// A saved list the page did not have to score: four fits across the bands.
const SEED = {
  a: { id: "a", title: "Staff Engineer", company: "Shopify", url: "", fit: 84, saved: "2026-09-20" },
  b: { id: "b", title: "External Wholesaler", company: "Manulife", url: "", fit: 79, saved: "2026-09-20" },
  c: { id: "c", title: "Analytics Engineer", company: "Linear", url: "", fit: 61, saved: "2026-09-20" },
  d: { id: "d", title: "Business Systems Analyst", company: "TD", url: "", fit: 32, saved: "2026-09-20" },
};

const LIT = { auto: 8, ping: 6, unsure: 5, "near-miss": 3 };
const bandOf = f => f >= 80 ? "auto" : f >= 70 ? "ping" : f >= 55 ? "unsure" : "near-miss";
/* two shapes: rose.js's svg (aria-label "fit N of 100", .d/.lit, .fitnum) and
   the stage-1 pack's .jcard__score (aria-hidden svg + .jcard__num, .dot/.is-lit) */
const ROSES = () => [...document.querySelectorAll("svg.rose[aria-label^='fit '], .jcard__score")].map(el => {
  const svg = el.tagName === "svg" ? el : el.querySelector("svg.rose");
  const fit = el.tagName === "svg" ? +el.getAttribute("aria-label").match(/fit (\d+)/)[1] : +el.querySelector(".jcard__num").textContent;
  const dots = [...svg.querySelectorAll("circle.d, circle.dot")];
  const isLit = d => d.classList.contains("lit") || d.classList.contains("is-lit");
  const lit = dots.filter(isLit).length;
  const litFill = lit ? getComputedStyle(dots.find(isLit)).fill : null;
  const unlit = dots.find(d => !isLit(d));
  const unlitFill = unlit ? getComputedStyle(unlit).fill : null;
  const box = svg.getBoundingClientRect();
  const inside = dots.every(c => {
    const r = c.getBoundingClientRect();
    return r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
  });
  const num = el.tagName === "svg" ? svg.querySelector(".fitnum") : el.querySelector(".jcard__num");
  return { fit, lit, litFill, unlitFill, viewBox: svg.getAttribute("viewBox"), inside,
           numFont: num ? getComputedStyle(num).fontFamily : "", numVar: num ? getComputedStyle(num).fontVariantNumeric : "" };
});
/* a card's three tiers: the band pill filled, the fact chip sunken, the date bare */
const TIERS = () => [...document.querySelectorAll(".job:not(.swept), #view .card, .rows .row")].slice(0, 6).map(card => {
  const g = sel => { const el = card.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : null; };
  const title = card.querySelector("h3.role, p.r, .row > .t, .jcard__title");
  return { pill: g(".route, .band, .jcard__band"), chip: g(".pill, .jcard__chip"), date: g(".age, .ago, .m, .jcard__when"),
           titleFont: title ? getComputedStyle(title).fontFamily : "" };
});

function judge(label, roses, tiers) {
  is(roses.length > 0, `${label}: ${roses.length} roses on screen`);
  const wrong = roses.filter(r => r.lit !== LIT[bandOf(r.fit)]);
  is(!wrong.length, `${label}: every rose lights its band (8/6/5/3)` + (wrong.length ? ` - ${wrong.map(r => `${r.fit}->${r.lit}`).join(", ")}` : ""));
  is(roses.every(r => r.viewBox === "-4.2416 -3.0639 31.3054 31.3054"), `${label}: the display cut, verbatim`);
  is(roses.every(r => r.inside), `${label}: no dot is clipped by its own svg`);
  const both = roses.filter(r => r.unlitFill && r.litFill);
  is(both.length > 0 && both.every(r => r.unlitFill !== r.litFill), `${label}: lit and unlit fills differ (${both.length} roses carry both)`);
  is(roses.every(r => /JetBrains Mono/i.test(r.numFont) && /tabular-nums/.test(r.numVar)), `${label}: the numeral is mono, tabular`);
  if (tiers) {
    is(tiers.length > 0 && tiers.every(t => /Newsreader/i.test(t.titleFont)), `${label}: every card title is Newsreader`);
    /* the verdict pill is filled, the date is bare, and where a fact chip
       exists it is a third, sunken treatment (a saved row carries no chip) */
    const three = t => t.pill && t.pill !== "rgba(0, 0, 0, 0)" && (!t.date || t.date === "rgba(0, 0, 0, 0)")
                       && (!t.chip || (t.chip !== "rgba(0, 0, 0, 0)" && t.chip !== t.pill));
    is(tiers.every(three), `${label}: three metadata tiers, three treatments (pill filled, chip sunken, date bare)`);
  }
}

const b = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const reduce of [false, true]) {
    const tag = `${theme}${reduce ? " reduced" : ""}`;
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduce ? "reduce" : "no-preference" });
    await ctx.addInitScript(([t, seed]) => {
      localStorage.setItem("jobscout.theme", t);
      localStorage.setItem("jobscout.tracker", JSON.stringify({ v: 2, items: seed }));
    }, [theme, SEED]);

    // saved.html: the seeded shortlist
    let p = await ctx.newPage();
    await p.goto(SITE + "/saved.html", { waitUntil: "networkidle" });
    await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
    await p.waitForTimeout(600);
    judge(`saved ${tag}`, await p.evaluate(ROSES), await p.evaluate(TIERS));
    await p.close();

    // apply.html: the posting's rose in the header (the fourth copy of the
    // builder lived here on the old geometry, and its numeral came out tiny)
    p = await ctx.newPage();
    await p.addInitScript(() => sessionStorage.setItem("jobscout.apply", JSON.stringify({
      posting: { id: "chk", title: "Threat Detection Analyst", company: "Fastly", url: "", location: "Anywhere", remote_policy: "remote", sector: "cybersecurity" },
      profile: "", fit: 72, stretch: false })));
    await p.goto(SITE + "/apply.html", { waitUntil: "networkidle" });
    await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
    await p.waitForSelector("#fit svg.rose", { timeout: 10000 }).catch(() => {});
    const ar = await p.evaluate(ROSES);
    judge(`apply ${tag}`, ar);
    const numPx = await p.$eval("#fit .fitnum", n => n.getBoundingClientRect().height).catch(() => 0);
    is(numPx >= 10, `apply ${tag}: the numeral is legible (${numPx.toFixed(1)}px tall)`);
    await p.close();

    // the mockup's home screen: four example cards, both markets
    for (const market of ["canada", "kenya"]) {
      p = await ctx.newPage();
      await p.goto(MOCK + "/mobile.html", { waitUntil: "networkidle" });
      await p.evaluate(([t, m]) => {
        const press = w => { const x = [...document.querySelectorAll("button")].find(x => x.textContent.toLowerCase().includes(w)); if (x) x.click(); };
        press(m); press(t);
      }, [theme, market]);
      await p.waitForFunction(() => document.querySelectorAll("#view .card svg.rose").length >= 3, null, { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(reduce ? 900 : 1800);   // the last rose (4 cards x 28ms + 7 dots x 46 + 520) has seated
      const label = `mockup ${market} ${tag}`;
      judge(label, await p.evaluate(ROSES), await p.evaluate(TIERS));
      const dyn = await p.evaluate(() => {
        const cards = [...document.querySelectorAll("#view .card")];
        const settled = cards.filter(c => c.classList.contains("settled")).length;
        const numOf = c => c.querySelector(".fitnum, .jcard__num"), fitOf = c => c.dataset.score ? +c.dataset.score : +c.querySelector("svg.rose").getAttribute("aria-label").match(/fit (\d+)/)[1];
        const seated = cards.every(c => +numOf(c).textContent === fitOf(c));
        const delays = cards.map(c => { const d = c.querySelector(".rose .lit, .rose .is-lit"); return d ? getComputedStyle(d).animationDelay : "-"; });
        const pulse = cards.map(c => [c.dataset.band, getComputedStyle(c.querySelector(".band, .jcard__band")).animationName]);
        /* CSSAnimation only: a theme press leaves 1ms transitions in flight for
           a moment, and a transition is a state resolving, not motion. */
        return { n: cards.length, settled, seated, delays, pulse, running: document.getAnimations().filter(a => a instanceof CSSAnimation).length };
      });
      is(dyn.settled === dyn.n, `${label}: all ${dyn.n} cards settled`);
      is(dyn.seated, `${label}: every numeral seated on its score`);
      if (!reduce) {
        is(new Set(dyn.delays).size === dyn.delays.length && dyn.n >= 3, `${label}: breathing offsets pairwise distinct across ${dyn.n} cards (${dyn.delays.join(" / ")})`);
        is(dyn.pulse.every(([band, an]) => (band === "auto") === (an === "autopulse")),
          `${label}: only AUTO pulses its pill (${dyn.pulse.map(x => x.join(":")).join(", ")})`);
        is(dyn.running > 0, `${label}: settled roses are breathing (${dyn.running} animations running)`);
      } else {
        is(dyn.running === 0, `${label}: reduced motion runs no animation at all (${dyn.running})`);
        is(dyn.delays.every(d => d === "0s" || d === "-"), `${label}: reduced motion carries no breathing offsets`);
      }
      await p.close();
    }
    await ctx.close();
  }
}
await b.close();
console.log("\n" + (fails.length ? `${fails.length} FAILED` : "ALL GREEN"));
process.exit(fails.length ? 1 : 0);
