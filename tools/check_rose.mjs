// The rose in the list, proved: lit dots = the score, the numeral seats on the
// dots' clock, settled roses breathe out of step, only AUTO pulses, and under
// reduced motion the same information arrives with no animation at all.
//
//   python -m http.server 8765   (the REPO ROOT: the mockup links ../site/base.css)
//   node tools/check_rose.mjs
//
// The lit count is round(fit/100*8) - the needle-is-the-score law (a 32 lights
// 3, an 84 lights 7). Keyed on the SVG's own aria-label so the check reads the
// score the page claims, never a value it computed itself.
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

const ROSES = () => [...document.querySelectorAll("svg.rose[aria-label^='fit ']")].map(svg => {
  const fit = +svg.getAttribute("aria-label").match(/fit (\d+)/)[1];
  const lit = svg.querySelectorAll("circle.lit, circle[fill]:not([fill^='var(--hair']").length;
  const box = svg.getBoundingClientRect();
  const inside = [...svg.querySelectorAll("circle")].every(c => {
    const r = c.getBoundingClientRect();
    return r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
  });
  return { fit, lit, want: Math.max(1, Math.round(fit / 100 * 8)), viewBox: svg.getAttribute("viewBox"), inside };
});

function judge(label, roses) {
  is(roses.length > 0, `${label}: ${roses.length} roses on screen`);
  const wrong = roses.filter(r => r.lit !== r.want);
  is(!wrong.length, `${label}: every rose lights round(fit/100*8)` + (wrong.length ? ` - ${wrong.map(r => `${r.fit}->${r.lit} not ${r.want}`).join(", ")}` : ""));
  is(roses.every(r => r.viewBox === "0 0 104 104"), `${label}: the 104-box geometry, verbatim`);
  is(roses.every(r => r.inside), `${label}: no dot is clipped by its own svg`);
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
    judge(`saved ${tag}`, await p.evaluate(ROSES));
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
      judge(label, await p.evaluate(ROSES));
      const dyn = await p.evaluate(() => {
        const cards = [...document.querySelectorAll("#view .card")];
        const settled = cards.filter(c => c.classList.contains("settled")).length;
        const seated = cards.every(c => +c.querySelector(".fitnum").textContent === +c.querySelector("svg.rose").getAttribute("aria-label").match(/fit (\d+)/)[1]);
        const delays = cards.map(c => { const d = c.querySelector(".rose .lit"); return d ? getComputedStyle(d).animationDelay : "-"; });
        const pulse = cards.map(c => [c.dataset.band, getComputedStyle(c.querySelector(".band")).animationName]);
        /* CSSAnimation only: a theme press leaves 1ms transitions in flight for
           a moment, and a transition is a state resolving, not motion. */
        return { n: cards.length, settled, seated, delays, pulse, running: document.getAnimations().filter(a => a instanceof CSSAnimation).length };
      });
      is(dyn.settled === dyn.n, `${label}: all ${dyn.n} cards settled`);
      is(dyn.seated, `${label}: every numeral seated on its score`);
      if (!reduce) {
        is(new Set(dyn.delays).size === dyn.delays.length && dyn.n >= 3, `${label}: breathing offsets pairwise distinct across ${dyn.n} cards (${dyn.delays.join(" / ")})`);
        is(dyn.pulse.every(([band, an]) => (band === "auto") === (an === "pillpulse")),
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
